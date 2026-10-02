/* The task model and the focus archive: what may enter storage and what an old
   or damaged value is turned into on the way in. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ls } from './_env.mjs';

const { normalizeTask } = await import('../js/state.js');
const H = await import('../js/focushistory.js');

test('normalizeTask fills safe defaults and never throws on junk', () => {
  for (const bad of [null, undefined, 5, 'x', true]) assert.equal(normalizeTask(bad), null, String(bad));
  const t = normalizeTask({ text: 'a' });
  assert.ok(t.id && typeof t.id === 'string');
  assert.equal(t.durationMin, null); assert.equal(t.dueDate, null);
  assert.equal(t.timeFrom, null); assert.equal(t.timeTo, null);
  assert.equal(t.notify, false); assert.equal(t.notifiedStatus, 'none');
  assert.equal(t.doneAt, null);
  assert.ok(Number.isFinite(t.created));
});

test('normalizeTask migrates the old `due` field and drops it', () => {
  const t = normalizeTask({ id: 'a', text: 'x', due: '2026-10-01' });
  assert.equal(t.dueDate, '2026-10-01');
  assert.equal('due' in t, false);
});

test('normalizeTask rejects malformed dates and durations instead of keeping them', () => {
  assert.equal(normalizeTask({ id: 'a', dueDate: '2026-1-1' }).dueDate, null);
  assert.equal(normalizeTask({ id: 'a', dueDate: 'tomorrow' }).dueDate, null);
  assert.equal(normalizeTask({ id: 'a', durationMin: 9999 }).durationMin, null);
  assert.equal(normalizeTask({ id: 'a', durationMin: '30' }).durationMin, 30);
});

test('a time span is kept only as a whole, ordered pair', () => {
  const ok = normalizeTask({ id: 'a', timeFrom: 840, timeTo: 960 });
  assert.deepEqual([ok.timeFrom, ok.timeTo], [840, 960]);
  for (const half of [{ timeFrom: 840 }, { timeTo: 960 }, { timeFrom: 960, timeTo: 840 }, { timeFrom: 'x', timeTo: 'y' }]) {
    const t = normalizeTask({ id: 'a', ...half });
    assert.deepEqual([t.timeFrom, t.timeTo], [null, null], JSON.stringify(half));
  }
});

test('a done task always has doneAt; an undone task never does; a bad notify status resets', () => {
  const done = normalizeTask({ id: 'a', done: true });
  assert.ok(done.doneAt > 0);
  assert.equal(normalizeTask({ id: 'a', done: true, doneAt: 123 }).doneAt, 123);
  assert.equal(normalizeTask({ id: 'a', done: false, doneAt: 123 }).doneAt, null);
  assert.equal(normalizeTask({ id: 'a', notifiedStatus: 'weird' }).notifiedStatus, 'none');
  assert.equal(normalizeTask({ id: 'a', notifiedStatus: 'overdue' }).notifiedStatus, 'overdue');
  assert.equal(normalizeTask({ id: 'a', notify: 'yes' }).notify, false);
});

test('normalizeTask keeps the fields it does not own (nothing is deleted on migration)', () => {
  const t = normalizeTask({ id: 'a', text: 'x', p: 'high', cat: 'study', extra: { keep: 1 } });
  assert.equal(t.p, 'high'); assert.equal(t.cat, 'study'); assert.deepEqual(t.extra, { keep: 1 });
});

/* ── focus archive ── */
const rec = (id, endedAt, extra = {}) => ({
  id, startedAt: endedAt - 25 * 60000, endedAt, actualDurationMin: 25, taskCompleted: true, rating: 'good', ...extra,
});

test('normalizeHistoryRecord drops damaged records, never repairs them', () => {
  const bad = [
    null, {}, rec('', 1e12), rec('a', 1e12, { rating: 'meh' }), rec('a', 1e12, { taskCompleted: 'yes' }),
    rec('a', 1e12, { actualDurationMin: 0 }), rec('a', 1e12, { startedAt: 2e12 }),   // ends before it starts
    rec('a', 1e12, { endedAt: 'x' }),
  ];
  for (const r of bad) assert.equal(H.normalizeHistoryRecord(r), null, JSON.stringify(r));
  assert.equal(H.normalizeHistoryRecord(rec('ok', 1e12)).id, 'ok');
});

test('mergeHistory: dedupes by id, newest first, capped at HISTORY_CAP', () => {
  let list = [];
  for (let i = 0; i < H.HISTORY_CAP + 15; i++) list = H.mergeHistory(list, rec('s' + i, 1e12 + i * 1000));
  assert.equal(list.length, H.HISTORY_CAP);
  assert.equal(list[0].id, 's' + (H.HISTORY_CAP + 14));
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].endedAt >= list[i].endedAt);

  const again = H.mergeHistory(list, rec('s' + (H.HISTORY_CAP + 14), 2e12));   // same id, re-added
  assert.equal(again.filter(r => r.id === 's' + (H.HISTORY_CAP + 14)).length, 1);
  assert.equal(H.mergeHistory(list, { junk: true }).length, list.length);       // invalid incoming ignored
});

test('toHistoryRecord: a sub-minute session still counts as one minute; activeMs is the fallback', () => {
  const base = { id: 'x', startedAt: 1e12, endedAt: 1e12 + 20000, taskCompleted: false, rating: 'okay' };
  assert.equal(H.toHistoryRecord({ ...base, activeMs: 20000 }).actualDurationMin, 1);
  assert.equal(H.toHistoryRecord({ ...base, activeMs: 10 * 60000 }).actualDurationMin, 10);
  assert.equal(H.toHistoryRecord({ ...base, actualDurationMin: 40, activeMs: 10 * 60000 }).actualDurationMin, 40);
  assert.equal(H.toHistoryRecord(null), null);
});

test('addSessionToHistory persists through the guarded store and getHistory sanitises what it reads', () => {
  ls.clear();
  H.addSessionToHistory({ id: 'p1', startedAt: 1e12, endedAt: 1e12 + 60000, actualDurationMin: 1, taskCompleted: true, rating: 'good' });
  assert.equal(H.getHistory().length, 1);
  ls.setItem('daftarche-focus-history', JSON.stringify([rec('good', 1e12), { garbage: 1 }, 7]));
  assert.deepEqual(H.getHistory().map(r => r.id), ['good']);
  ls.setItem('daftarche-focus-history', '{not json');
  assert.deepEqual(H.getHistory(), []);
});
