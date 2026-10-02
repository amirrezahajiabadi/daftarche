/* The streak and the day ledger — the two things a person feels when they are
   wrong: a streak that broke for no reason, or a badge that came back. */
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ls } from './_env.mjs';

const { state } = await import('../js/state.js');
const {
  streakInfo, readLedger, bumpDay, rememberDone, collectTotals,
  FREEZE_LIMIT, FREEZE_EARN_EVERY, LEDGER_VERSION,
} = await import('../js/ledger.js');
const { shiftKey, dayKey } = await import('../js/utils.js');

const FIRST = '2026-01-01';
const k = n => shiftKey(FIRST, n);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => k(a + i));
const NOW = day => new Date(day + 'T12:00:00');

beforeEach(() => {
  ls.clear(); ls.writes = 0;
  state.tasks.length = 0; state.history.length = 0;
  for (const key of Object.keys(state.moods)) delete state.moods[key];
});

/* ── streakInfo (pure) ── */
test('no active days → an empty streak', () => {
  const s = streakInfo([], NOW(k(5)));
  assert.equal(s.current, 0); assert.equal(s.best, 0); assert.equal(s.length, 0);
});

test('consecutive days ending today', () => {
  const s = streakInfo(range(0, 2), NOW(k(2)));
  assert.equal(s.current, 3); assert.equal(s.best, 3);
});

test('today not done yet does not break the streak (yesterday still counts)', () => {
  const s = streakInfo(range(0, 2), NOW(k(3)));
  assert.equal(s.current, 3);
});

test('two days without activity does break it', () => {
  const s = streakInfo(range(0, 2), NOW(k(4)));
  assert.equal(s.current, 0);
  assert.equal(s.best, 3);
});

test('a single missed day breaks a young streak (no freeze earned yet)', () => {
  const active = [...range(0, 4), ...range(6, 8)];
  const s = streakInfo(active, NOW(k(8)));
  assert.equal(s.current, 3); assert.equal(s.best, 5);
  assert.equal(s.earned, 0); assert.equal(s.used, 0);
});

test('a freeze earned by 30 active days repairs one missed day', () => {
  const active = [...range(0, 29), ...range(31, 34)];            // 34 active days, gap on day 30
  const s = streakInfo(active, NOW(k(34)));
  assert.equal(FREEZE_EARN_EVERY, 30);
  assert.equal(s.earned, 1); assert.equal(s.used, 1); assert.equal(s.available, 0);
  assert.ok(s.frozen.has(k(30)));
  assert.equal(s.current, 35); assert.equal(s.best, 35);
});

test('with freezes switched off the same history is broken', () => {
  const active = [...range(0, 29), ...range(31, 34)];
  const s = streakInfo(active, NOW(k(34)), { freeze: false });
  assert.equal(s.current, 4); assert.equal(s.best, 30);
  assert.equal(s.frozen.size, 0);
});

test('a freeze never covers today (a day still being lived is not a missed day)', () => {
  const s = streakInfo(range(0, 29), NOW(k(31)));                // day 30 missed, today (31) empty
  assert.equal(s.frozen.size, 0);
  assert.equal(s.current, 0);
});

test('two missed days in a row are never repaired', () => {
  const active = [...range(0, 29), ...range(32, 35)];
  const s = streakInfo(active, NOW(k(35)));
  assert.equal(s.frozen.size, 0);
  assert.equal(s.current, 4);
});

test('freezes are capped at FREEZE_LIMIT no matter how long the history', () => {
  // 100 active days with three separate one-day holes → only 2 can be repaired.
  const holes = new Set([20, 50, 80]);
  const active = range(0, 103).filter((_, i) => !holes.has(i));
  const s = streakInfo(active, NOW(k(103)));
  assert.equal(FREEZE_LIMIT, 2);
  assert.equal(s.earned, 2); assert.equal(s.used, 2);
  assert.equal(s.frozen.size, 2);
  // newest holes are repaired first: the streak the person is standing on wins.
  assert.ok(s.frozen.has(k(80)) && s.frozen.has(k(50)) && !s.frozen.has(k(20)));
});

test('derived, not stored: same input → same output; junk keys and duplicates ignored', () => {
  const a = streakInfo(new Set([...range(0, 3), 'garbage', '2026-1-1', null]), NOW(k(3)));
  const b = streakInfo([...range(0, 3), ...range(0, 3)], NOW(k(3)));
  assert.equal(a.current, 4); assert.equal(b.current, 4);
  assert.deepEqual([a.best, a.length], [b.best, b.length]);
});

/* ── the ledger (storage) ── */
test('an empty, corrupt or foreign ledger reads as an empty book', () => {
  assert.deepEqual(readLedger(), { v: LEDGER_VERSION, seededAt: null, days: {} });
  ls.setItem('daftarche-ledger', 'not json');
  assert.deepEqual(readLedger().days, {});
  ls.setItem('daftarche-ledger', JSON.stringify({ v: 99, days: { '2026-01-01': { done: 3 } } }));
  assert.deepEqual(readLedger().days, {});
});

test('readLedger drops bad day keys and clamps bad numbers to 0', () => {
  ls.setItem('daftarche-ledger', JSON.stringify({ v: LEDGER_VERSION, days: {
    '2026-01-01': { done: 3, focusMin: -5, sessions: 'x' },
    'not-a-day': { done: 9 },
    '2026-01-02': null,
  } }));
  assert.deepEqual(readLedger().days, { '2026-01-01': { done: 3, focusMin: 0, sessions: 0 } });
});

test('bumpDay only ever raises a floor, and does not write when nothing changed', () => {
  bumpDay('2026-02-01', { done: 5 });
  assert.equal(readLedger().days['2026-02-01'].done, 5);
  const w = ls.writes;
  bumpDay('2026-02-01', { done: 3 });                 // lower → ignored
  bumpDay('2026-02-01', { done: 5 });                 // equal → ignored
  assert.equal(readLedger().days['2026-02-01'].done, 5);
  assert.equal(ls.writes, w);
  bumpDay('2026-02-01', { done: 7, focusMin: 25 });
  assert.deepEqual(readLedger().days['2026-02-01'], { done: 7, focusMin: 25, sessions: 0 });
  bumpDay('bad-key', { done: 1 }); bumpDay('2026-02-02', null);
  assert.equal(Object.keys(readLedger().days).length, 1);
});

test('tick, un-tick, tick again counts once — and un-ticking never lowers the floor', () => {
  const now = new Date(2026, 8, 30, 14, 0, 0);
  const key = dayKey(now);
  const mk = (id, done) => ({ id, text: id, done, doneAt: done ? now.getTime() : null });
  state.tasks.push(mk('a', true), mk('b', true), mk('c', false));
  rememberDone(now);
  assert.equal(readLedger().days[key].done, 2);

  state.tasks[0].done = false;                         // un-tick
  rememberDone(now);
  assert.equal(readLedger().days[key].done, 2);        // floor stays

  state.tasks[0].done = true;                          // tick again
  rememberDone(now);
  assert.equal(readLedger().days[key].done, 2);        // not 3
});

test('a deleted task cannot take the day back: the floor outlives the list', () => {
  const now = new Date(2026, 8, 30, 14, 0, 0);
  const key = dayKey(now);
  state.tasks.push({ id: 'a', text: 'a', done: true, doneAt: now.getTime() });
  rememberDone(now);
  state.tasks.length = 0;                              // the task is deleted
  const book = collectTotals(now);
  assert.equal(book.totals.done, 1);
  assert.equal(book.days.find(d => d.key === key).done, 1);
});

test('collectTotals: live data wins when higher, the floor wins when lower — never summed', () => {
  const now = new Date(2026, 8, 30, 14, 0, 0);
  const key = dayKey(now);
  bumpDay(key, { done: 5 });
  state.tasks.push({ id: 'a', text: 'a', done: true, doneAt: now.getTime() },
                   { id: 'b', text: 'b', done: true, doneAt: now.getTime() });
  assert.equal(collectTotals(now).days.find(d => d.key === key).done, 5);   // floor 5 > live 2
  for (let i = 0; i < 4; i++) state.tasks.push({ id: 'x' + i, text: 'x', done: true, doneAt: now.getTime() });
  assert.equal(collectTotals(now).days.find(d => d.key === key).done, 6);   // live 6 > floor 5
});

test('opening the app makes a day active; mood must be an integer 1–5', () => {
  const now = new Date(2026, 8, 30, 14, 0, 0);
  state.history.push('2026-09-29', 'garbage');
  state.moods['2026-09-29'] = 4; state.moods['2026-09-28'] = 9; state.moods['2026-09-27'] = 2.5;
  const book = collectTotals(now);
  assert.ok(book.active.has('2026-09-29'));
  assert.equal(book.totals.mood.days, 1);
  assert.equal(book.totals.mood.goodDays, 1);
});
