/* «الان چی کار کنیم؟» — the engine is deterministic and has no DOM, so its
   promises can be checked exactly: what outranks what, what a skip costs, and
   the fact that history may only break ties, never overrule the score. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deadlineScore, priorityScore, energyFitScore, criticalBonus, energyFromMood,
  getRecommendation, reasonForTask, ALL_DONE_REASON, SINGLE_TASK_REASON,
} from '../js/decision.js';

const TODAY = new Date(2026, 8, 30);            // 2026-09-30
const K = '2026-09-30';
const t = (id, extra = {}) => ({ id, text: 'کار ' + id, done: false, p: 'mid', dueDate: null, durationMin: null, created: 1, ...extra });

test('deadlineScore: overdue > today > tomorrow > … > far, and junk = 0', () => {
  assert.equal(deadlineScore('2026-09-29', K), 50);
  assert.equal(deadlineScore(K, K), 45);
  assert.equal(deadlineScore('2026-10-01', K), 35);
  assert.equal(deadlineScore('2026-10-02', K), 28);
  assert.equal(deadlineScore('2026-10-03', K), 22);
  assert.equal(deadlineScore('2026-10-07', K), 15);   // +7
  assert.equal(deadlineScore('2026-10-14', K), 8);    // +14
  assert.equal(deadlineScore('2026-12-01', K), 3);
  for (const bad of [null, undefined, '', 'soon', '2026-13-45', 20260930]) assert.equal(deadlineScore(bad, K), 0, String(bad));
});

test('priority: high 30 > mid 20 > low 10; unknown falls back to mid', () => {
  assert.equal(priorityScore('high'), 30);
  assert.equal(priorityScore('mid'), 20);
  assert.equal(priorityScore('low'), 10);
  assert.equal(priorityScore('whatever'), 20);
  assert.equal(priorityScore(undefined), 20);
});

test('energy fit: unknown duration is never guessed; tired people get short tasks', () => {
  assert.equal(energyFitScore(null, 'low'), 0);
  assert.equal(energyFitScore(0, 'low'), 0);
  assert.equal(energyFitScore(10, 'low'), 15);
  assert.equal(energyFitScore(90, 'low'), 0);
  assert.equal(energyFitScore(45, 'high'), 15);
  assert.equal(energyFitScore(45, 'nonsense'), energyFitScore(45, 'normal'));
});

test('critical bonus only for high-priority tasks due today or overdue', () => {
  assert.equal(criticalBonus('high', 0), 10);
  assert.equal(criticalBonus('high', -3), 10);
  assert.equal(criticalBonus('high', 1), 0);
  assert.equal(criticalBonus('high', null), 0);
  assert.equal(criticalBonus('mid', 0), 0);
});

test('energyFromMood maps 1–5 onto low/normal/high; nothing set = normal', () => {
  assert.equal(energyFromMood(1), 'low'); assert.equal(energyFromMood(2), 'low');
  assert.equal(energyFromMood(3), 'normal');
  assert.equal(energyFromMood(4), 'high'); assert.equal(energyFromMood(5), 'high');
  assert.equal(energyFromMood(0), 'normal'); assert.equal(energyFromMood(undefined), 'normal');
});

test('empty and all-done states', () => {
  assert.equal(getRecommendation({ tasks: [], today: TODAY }).state, 'empty');
  assert.equal(getRecommendation({ tasks: null, today: TODAY }).state, 'empty');
  const done = getRecommendation({ tasks: [t('a', { done: true })], today: TODAY });
  assert.equal(done.state, 'all-done');
  assert.equal(done.reason, ALL_DONE_REASON);
  assert.equal(done.primary, null);
});

test('a task with no text is not a candidate; junk entries do not crash it', () => {
  const r = getRecommendation({ tasks: [null, 5, 'x', t('blank', { text: '   ' })], today: TODAY });
  assert.notEqual(r.state, 'ok');
  const r2 = getRecommendation({ tasks: [null, t('real')], today: TODAY });
  assert.equal(r2.state, 'ok');
  assert.equal(r2.primary.id, 'real');
  assert.equal(r2.reason, SINGLE_TASK_REASON);
});

test('overdue high-priority beats a fresh low-priority task', () => {
  const r = getRecommendation({
    tasks: [t('low', { p: 'low' }), t('late', { p: 'high', dueDate: '2026-09-28' })], today: TODAY,
  });
  assert.equal(r.primary.id, 'late');
  assert.equal(r.reason, 'این یکی از موعدش گذشته.');
});

test('a nearer deadline beats a further one at equal priority', () => {
  const r = getRecommendation({
    tasks: [t('far', { dueDate: '2026-10-20' }), t('near', { dueDate: '2026-10-01' })], today: TODAY,
  });
  assert.equal(r.primary.id, 'near');
});

test('each skip costs 8 points and can hand the pick to the runner-up (Map or object)', () => {
  const tasks = [t('a', { p: 'high' }), t('b', { p: 'mid' })];   // 30 vs 20
  assert.equal(getRecommendation({ tasks, today: TODAY }).primary.id, 'a');
  assert.equal(getRecommendation({ tasks, today: TODAY, skipCounts: new Map([['a', 1]]) }).primary.id, 'a'); // 22 vs 20
  assert.equal(getRecommendation({ tasks, today: TODAY, skipCounts: new Map([['a', 2]]) }).primary.id, 'b'); // 14 vs 20
  assert.equal(getRecommendation({ tasks, today: TODAY, skipCounts: { a: 2 } }).primary.id, 'b');
});

test('energy changes the pick between a short and a long task', () => {
  const tasks = [t('short', { durationMin: 10 }), t('long', { durationMin: 90 })];
  assert.equal(getRecommendation({ tasks, today: TODAY, energy: 'low' }).primary.id, 'short');
  assert.equal(getRecommendation({ tasks, today: TODAY, energy: 'high' }).primary.id, 'long');
});

test('ties break: nearer deadline, then shorter duration, then older task — deterministically', () => {
  const same = getRecommendation({ tasks: [t('new', { created: 9 }), t('old', { created: 1 })], today: TODAY });
  assert.equal(same.primary.id, 'old');
  const again = getRecommendation({ tasks: [t('old', { created: 1 }), t('new', { created: 9 })], today: TODAY });
  assert.equal(again.primary.id, 'old');
});

test('alternatives: at most two, all within 20 points of the winner', () => {
  const tasks = [
    t('top', { p: 'high', dueDate: K }),                 // 30 + 45 + 10 = 85
    t('near1', { p: 'high', dueDate: '2026-10-01' }),    // 65
    t('near2', { p: 'high', dueDate: '2026-10-02' }),    // 58 → too far (>20 below 85)
    t('far', { p: 'low' }),                              // 10
  ];
  const r = getRecommendation({ tasks, today: TODAY });
  assert.equal(r.primary.id, 'top');
  assert.deepEqual(r.alternatives.map(a => a.id), ['near1']);
});

test('the engine never mutates its input and only leaks known fields', () => {
  const tasks = [t('a', { secret: 'x', notifiedStatus: 'soon' }), t('b')];
  const before = JSON.stringify(tasks);
  const r = getRecommendation({ tasks, today: TODAY });
  assert.equal(JSON.stringify(tasks), before);
  assert.equal('secret' in r.primary, false);
  assert.equal('notifiedStatus' in r.primary, false);
});

/* ── Decision Context: a tie-break, never an override ── */
const ctx = range => ({ available: true, durationFit: { available: true, preferredRange: range } });

test('context reorders candidates inside the 5-point window …', () => {
  // mid + no due: both 20. medium (16–30) preferred → the 20-min task wins over the older one.
  const tasks = [t('old', { created: 1, durationMin: 60 }), t('fit', { created: 2, durationMin: 20 })];
  const plain = getRecommendation({ tasks, today: TODAY, energy: 'normal' });
  const guided = getRecommendation({ tasks, today: TODAY, energy: 'normal', context: ctx('medium') });
  assert.equal(guided.primary.id, 'fit');
  assert.ok(plain.primary.id === 'old' || plain.primary.id === 'fit');
});

test('… but can never overrule a clearly higher score', () => {
  const tasks = [t('strong', { p: 'high', dueDate: K, durationMin: 90 }), t('fit', { durationMin: 20 })];
  const r = getRecommendation({ tasks, today: TODAY, context: ctx('medium') });
  assert.equal(r.primary.id, 'strong');
});

test('an unusable context is ignored', () => {
  const tasks = [t('a', { p: 'high' }), t('b')];
  const base = getRecommendation({ tasks, today: TODAY });
  for (const c of [null, {}, { available: false }, { available: true, durationFit: { available: false } },
                   { available: true, durationFit: { available: true } }]) {
    assert.deepEqual(getRecommendation({ tasks, today: TODAY, context: c }), base);
  }
});

test('reasonForTask gives a human sentence, never a number', () => {
  const s = reasonForTask(t('x', { dueDate: '2026-09-20' }), { today: TODAY });
  assert.equal(typeof s, 'string');
  assert.equal(/\d/.test(s), false);
});
