/* Badges: the engine is pure, so the rules the README promises can be checked
   exactly — a badge never goes down, the first run is a silent baseline, and
   the stored file cannot be made to say something the catalogue does not. */
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ls } from './_env.mjs';

const { state } = await import('../js/state.js');
const { collectTotals } = await import('../js/ledger.js');
const A = await import('../js/achievements.js');
const S = await import('../js/store.js');
const T = await import('../js/theme.js');

const NOW = new Date(2026, 8, 30, 14, 0, 0);

beforeEach(() => {
  ls.clear();
  state.tasks.length = 0; state.history.length = 0;
  for (const k of Object.keys(state.moods)) delete state.moods[k];
});

const tick = (n, at = NOW) => {
  for (let i = 0; i < n; i++) state.tasks.push({ id: 't' + state.tasks.length, text: 'x', done: true, doneAt: at.getTime(), cat: 'misc' });
};
const rowOf = (ev, id) => ev.rows.find(r => r.a.id === id);

test('catalogue sanity: unique ids, ascending tiers, known family/kind, totals add up', () => {
  const ids = A.ACHIEVEMENTS.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id');
  const families = new Set(A.FAMILIES.map(f => f.key));
  for (const a of A.ACHIEVEMENTS) {
    assert.ok((a.id === 'tour-intro' ? a.tiers.length >= 1 : a.tiers.length >= 2) && a.tiers.length <= 4, a.id + ' tiers count');
    assert.deepEqual([...a.tiers].sort((x, y) => x - y), a.tiers, a.id + ' tiers ascending');
    assert.equal(new Set(a.tiers).size, a.tiers.length, a.id + ' tiers distinct');
    assert.ok(families.has(a.family), a.id + ' family');
    assert.ok(A.KIND_LABEL[a.kind], a.id + ' kind');
  }
  assert.equal(A.TOTAL_BADGES, A.ACHIEVEMENTS.length);
  assert.equal(A.TOTAL_STEPS, A.ACHIEVEMENTS.reduce((n, a) => n + a.tiers.length, 0));
  assert.equal(A.byId('nope'), null);
});

test('every badge value() survives an empty book (no NaN, no throw, no negatives)', () => {
  const ev = A.evaluate(collectTotals(NOW), A.emptyState());
  for (const r of ev.rows) {
    assert.ok(Number.isFinite(r.value) && r.value >= 0, r.a.id);
    assert.ok(r.pct >= 0 && r.pct <= 1, r.a.id + ' pct');
  }
  assert.equal(ev.earned, 0);
});

test('tiers are reached by value: 10 ticks → first-step tier 2 (of [1,10,100])', () => {
  tick(10);
  const ev = A.evaluate(collectTotals(NOW), A.emptyState());
  const r = rowOf(ev, 'first-step');
  assert.equal(r.value, 10);
  assert.equal(r.tier, 2);
  assert.equal(r.nextGoal, 100);
  assert.equal(r.left, 90);
  assert.equal(r.open, true); assert.equal(r.complete, false);
});

test('a badge never goes down: a stored tier outlives the data that earned it', () => {
  const st = A.normalizeState({ baselineAt: '2026-09-01', unlocked: { 'first-step': { tier: 3, at: '2026-09-02' } } });
  const ev = A.evaluate(collectTotals(NOW), st);                    // no tasks at all now
  const r = rowOf(ev, 'first-step');
  assert.equal(r.tier, 3); assert.equal(r.complete, true);
  assert.equal(r.raised, false);
});

test('on the baseline run nothing is "new"; after it, a raised tier is', () => {
  tick(1);
  const first = A.evaluate(collectTotals(NOW), A.emptyState());
  assert.equal(first.newly.length, 0);                              // baselineAt null → silent
  assert.equal(rowOf(first, 'first-step').raised, true);

  const st = A.normalizeState({ baselineAt: '2026-09-01', unlocked: {} });
  const second = A.evaluate(collectTotals(NOW), st);
  assert.ok(second.newly.some(r => r.a.id === 'first-step'));
});

test('the tour achievement opens only after the tour is marked complete', () => {
  const before = collectTotals(NOW);
  before.totals.tourDone = 0;
  assert.equal(rowOf(A.evaluate(before, A.emptyState()), 'tour-intro').tier, 0);

  const after = collectTotals(NOW);
  after.totals.tourDone = 1;
  const st = A.normalizeState({ baselineAt: '2026-09-01', unlocked: {} });
  const row = rowOf(A.evaluate(after, st), 'tour-intro');
  assert.equal(row.tier, 1);
  assert.equal(row.raised, true);
  assert.equal(row.complete, true);
});

test('achievement rewards are generic and unlock from the earned tier', () => {
  const tour = A.byId('tour-intro');
  assert.deepEqual(A.rewardsOf(tour).map(reward => reward.id), ['theme:lilac']);
  assert.equal(A.hasReward(A.emptyState(), 'theme:lilac'), false);
  assert.equal(A.hasReward(A.normalizeState({
    baselineAt: '2026-09-01',
    unlocked: { 'tour-intro': { tier: 1, at: '2026-09-02' } },
  }), 'theme:lilac'), true);
  assert.equal(A.rewardFor('theme', 'lilac').lockedText, 'هنوز تنونستی "یاسی" رو بدست بیاری!');
  assert.deepEqual(A.rewardsOf({ rewards: [{ id: 'theme:lilac', tier: 2 }] }, 1), []);
  assert.equal(A.rewardsOf({ rewards: [{ id: 'theme:lilac', tier: 2 }] }, 2).length, 1);
  assert.equal(A.hasReward(A.emptyState(), 'unknown-reward'), false);
});

test('declining a tour suppresses its offer without earning its achievement', () => {
  S.saveTourDone();
  assert.equal(S.loadTourDone(), true);
  assert.equal(S.loadTourAwarded(), false);
  S.saveTourAwarded();
  assert.equal(S.loadTourAwarded(), true);
});

test('only the rewarded theme is gated, including remembered theme choices', () => {
  S.saveThemeModes({ light: 'lilac', dark: 'night' });
  assert.equal(T.isThemeUnlocked('paper'), true);
  assert.equal(T.isThemeUnlocked('night'), true);
  assert.equal(T.isThemeUnlocked('lilac'), false);
  assert.equal(T.applyTheme('lilac'), false);
  assert.equal(T.themeForMode('light'), 'paper');
  S.saveAchv(A.normalizeState({
    unlocked: { 'tour-intro': { tier: 1, at: '2026-09-02' } },
  }));
  assert.equal(T.isThemeUnlocked('lilac'), true);
  assert.equal(T.themeForMode('light'), 'lilac');
});

test('badges with a minimum sample stay at 0 until it is met (on-time needs 20 dated ticks)', () => {
  for (let i = 0; i < 10; i++) state.tasks.push({ id: 'd' + i, text: 'x', done: true, doneAt: NOW.getTime(), dueDate: '2026-09-30' });
  assert.equal(rowOf(A.evaluate(collectTotals(NOW), A.emptyState()), 'on-time').value, 0);
  for (let i = 10; i < 20; i++) state.tasks.push({ id: 'd' + i, text: 'x', done: true, doneAt: NOW.getTime(), dueDate: '2026-09-30' });
  const r = rowOf(A.evaluate(collectTotals(NOW), A.emptyState()), 'on-time');
  assert.equal(r.value, 100);
  assert.equal(r.tier, 2);
});

test('normalizeState: garbage in, a valid empty shelf out; tiers are clamped; unknown ids dropped', () => {
  for (const bad of [null, undefined, 5, 'x', []]) {
    assert.deepEqual(A.normalizeState(bad), A.emptyState(), String(bad));
  }
  const st = A.normalizeState({
    baselineAt: 42,
    unlocked: {
      'first-step': { tier: 99, at: '2026-09-01' },      // clamped to the top (3)
      'done': { tier: -4, at: 'x' },                      // dropped
      'no-such-badge': { tier: 1, at: null },             // dropped
      'chain': { tier: 2.9, at: 12 },                     // floored; bad date → null
    },
    recSeen: { a: 'x', b: 5 },
  });
  assert.equal(st.baselineAt, null);
  assert.deepEqual(Object.keys(st.unlocked).sort(), ['chain', 'first-step']);
  assert.equal(st.unlocked['first-step'].tier, A.byId('first-step').tiers.length);
  assert.equal(st.unlocked['chain'].tier, 2);
  assert.equal(st.unlocked['chain'].at, null);
  assert.deepEqual(st.recSeen, { a: 'x' });
});

test('rankOf: monotonic, correct thresholds, progress inside a rank, top rank is full', () => {
  assert.equal(A.rankOf(0).name, 'تازه‌کار');
  assert.equal(A.rankOf(149).name, 'تازه‌کار');
  assert.equal(A.rankOf(150).name, 'قدم‌زن');
  const mid = A.rankOf(325);                       // half-way between 150 and 500
  assert.equal(mid.name, 'قدم‌زن'); assert.equal(mid.next.at, 500);
  assert.equal(mid.left, 175); assert.ok(Math.abs(mid.pct - 0.5) < 1e-9);
  const top = A.rankOf(1e6);
  assert.equal(top.next, null); assert.equal(top.pct, 1); assert.equal(top.left, 0);
  let last = -1;
  for (let s = 0; s < 12000; s += 50) { const i = A.rankOf(s).index; assert.ok(i >= last); last = i; }
});

test('scoreOf is the sum of its explained parts (the table on the page is honest)', () => {
  tick(3);
  const book = collectTotals(NOW);
  const parts = A.partsOf(book.totals);
  assert.equal(A.scoreOf(book.totals), parts.reduce((n, p) => n + p.points, 0));
  assert.equal(parts.find(p => p.key === 'done').points, 3);
  assert.equal(parts.find(p => p.key === 'days').points, 5);        // one active day × 5
});

test('nearest: closest-to-next-rung first, complete badges excluded, capped', () => {
  tick(9);                                                           // first-step 9/10 → 90% of the tier-2 span
  const rows = A.evaluate(collectTotals(NOW), A.emptyState()).rows;
  const near = A.nearest(rows, 3);
  assert.ok(near.length <= 3);
  assert.ok(near.every(r => !r.complete && r.nextGoal !== null));
  for (let i = 1; i < near.length; i++) assert.ok(near[i - 1].pct >= near[i].pct);
});

test('streakRuns: a frozen day is a link, runs sorted longest first', () => {
  const book = { days: [
    { key: '2026-09-01', done: 1 }, { key: '2026-09-02', freeze: true }, { key: '2026-09-03', done: 1 },
    { key: '2026-09-10', done: 1 }, { key: '2026-09-11', done: 1 },
  ] };
  const runs = A.streakRuns(book);
  assert.deepEqual(runs.map(r => r.length), [3, 2]);
  assert.equal(runs[0].start, '2026-09-01'); assert.equal(runs[0].end, '2026-09-03');
});

test('leagueSnapshot: the exact shape a future table row would have, from real data', () => {
  tick(4);
  const snap = A.leagueSnapshot(collectTotals(NOW));
  assert.deepEqual(Object.keys(snap).sort(),
    ['activeDays', 'bestStreak', 'done', 'focusMin', 'period', 'readMin', 'score']);
  assert.equal(snap.done, 4);
  assert.equal(snap.period, '2026-09-26');                           // the Saturday that starts this week
  const empty = A.leagueSnapshot(collectTotals(NOW), '2020-01-04');   // a week with no data
  assert.equal(empty.done, 0); assert.equal(empty.score, 0);
});
