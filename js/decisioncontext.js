/* ═══ Decision Context V1 — «سابقهٔ تمرکز → زمینهٔ تصمیم» ═══
   A deterministic, DOM-free layer that turns reflected Focus History into
   a conservative context signal for the Decision Engine.
   History → Evidence → Context → Better Decision.

   Rules kept deliberately tight: the context never guesses, never stores
   anything, and never rewrites the base score. When evidence is missing
   every pattern reports available=false and the engine falls back to the
   exact previous behavior. */

import { normalizeHistoryRecord } from './focushistory.js';

/* ── Sample-size & threshold rules (centralized) ── */
export const WINDOW_DAYS = 30;      // only the last 30 days are considered
export const MIN_SESSIONS = 3;      // below this: no context at all
export const RANKING_MIN = 6;       // from this count a pattern may guide ranking
export const STABLE_MIN = 10;       // from this count a pattern is considered stable
export const BUCKET_MIN = 3;        // minimum samples per bucket for a comparison
export const MEANINGFUL_GAP = 0.2;  // meaningful difference = 20 percentage points

const DAY_MS = 864e5;

/* Ordinal mapping so a bucket can carry an average rating; never used as
   success/failure — a hard rating on a completed task is still completed. */
const RATING_SCORE = { good: 2, okay: 1, hard: 0 };

/* ── Helpers ── */

const emptyDurationFit = () => ({
  available: false,
  preferredRange: null,
  weakerRange: null,
  sampleSize: 0,
  preferredRate: null,
  weakerRate: null,
});

/* Valid reflected sessions inside the 30-day window. Corrupt records are
   dropped, never repaired; whatever stays valid is kept. */
export function filterValidHistory(history, currentDate = new Date()) {
  if (!Array.isArray(history)) return [];
  const cutoff = new Date(currentDate).getTime() - WINDOW_DAYS * DAY_MS;
  if (!Number.isFinite(cutoff)) return [];
  return history
    .map(normalizeHistoryRecord)
    .filter(Boolean)
    .filter(r => r.startedAt >= cutoff);
}

/* Sessions grouped by actualDurationMin:
   short 5–15 · medium 16–30 · long 31–60 · veryLong 61–90
   Sessions outside that range stay visible in the overall aggregates but
   never feed a duration pattern. */
export function getDurationBuckets(sessions) {
  const names = ['short', 'medium', 'long', 'veryLong'];
  const buckets = names.map(name => ({
    name,
    count: 0,
    completedCount: 0,
    completionRate: null,
    averageRating: null,
    hardRate: null,   // set when the bucket has BUCKET_MIN+ samples
    goodRate: null,   // set when the bucket has BUCKET_MIN+ samples
    ratingSum: 0,
    hardCount: 0,
    goodCount: 0,
  }));
  const bucketIndex = min => (min <= 15 ? 0 : min <= 30 ? 1 : min <= 60 ? 2 : 3);
  for (const s of sessions) {
    const min = s.actualDurationMin;
    if (min < 5 || min > 90) continue;
    const b = buckets[bucketIndex(min)];
    b.count++;
    if (s.taskCompleted) b.completedCount++;
    b.ratingSum += RATING_SCORE[s.rating] ?? 0;
    if (s.rating === 'hard') b.hardCount++;
    if (s.rating === 'good') b.goodCount++;
  }
  for (const b of buckets) {
    if (!b.count) continue;
    b.completionRate = b.completedCount / b.count;
    b.averageRating = b.ratingSum / b.count;
    if (b.count >= BUCKET_MIN) {
      b.hardRate = b.hardCount / b.count;
      b.goodRate = b.goodCount / b.count;
    }
  }
  return buckets;
}

/* Overall completion signal; only surfaced once totalSessions >= RANKING_MIN.
   It is a general signal and never used for direct ranking. */
export function calculateCompletion(sessions) {
  const sampleSize = sessions.length;
  const completed = sessions.filter(s => s.taskCompleted).length;
  return {
    available: sampleSize >= RANKING_MIN,
    rate: sampleSize > 0 ? completed / sampleSize : null,
    sampleSize,
  };
}

/* Rating distribution from real ratings only. A rating alone never means
   failure — a hard session with taskCompleted=true counts as completed. */
export function calculateDifficulty(sessions) {
  const n = sessions.length;
  const goodCount = sessions.filter(s => s.rating === 'good').length;
  const okayCount = sessions.filter(s => s.rating === 'okay').length;
  const hardCount = sessions.filter(s => s.rating === 'hard').length;
  return {
    available: n >= MIN_SESSIONS,
    goodRate: n > 0 ? goodCount / n : null,
    okayRate: n > 0 ? okayCount / n : null,
    hardRate: n > 0 ? hardCount / n : null,
    sampleSize: n,
  };
}

/* Duration Fit: among buckets with BUCKET_MIN+ samples, the pair with the
   clearest completion-rate gap. The pattern is meaningful only when at
   least two buckets compare and the gap is >= MEANINGFUL_GAP. */
export function findDurationPattern(buckets) {
  const comp = buckets.filter(b => b.count >= BUCKET_MIN);
  if (comp.length < 2) return emptyDurationFit();
  let best = null;
  for (let i = 0; i < comp.length; i++) {
    for (let j = i + 1; j < comp.length; j++) {
      const gap = Math.abs(comp[i].completionRate - comp[j].completionRate);
      if (gap < MEANINGFUL_GAP) continue;
      if (!best || gap > best.gap) {
        const hi = comp[i].completionRate >= comp[j].completionRate ? comp[i] : comp[j];
        const lo = hi === comp[i] ? comp[j] : comp[i];
        best = { gap, hi, lo };
      }
    }
  }
  if (!best) return emptyDurationFit();
  return {
    available: true,
    preferredRange: best.hi.name,
    weakerRange: best.lo.name,
    sampleSize: best.hi.count + best.lo.count,
    preferredRate: best.hi.completionRate,
    weakerRate: best.lo.completionRate,
  };
}

/* ── Main entry ──
   Input:  history (raw Focus History array) + currentDate (injectable)
   Output: the context object consumed by the Decision Engine.
   Built on demand from current history — nothing is persisted, so it can
   never go stale. */
export function buildDecisionContext(history, currentDate = new Date()) {
  const sessions = filterValidHistory(history, currentDate);
  if (sessions.length < MIN_SESSIONS) {
    return {
      available: false,
      reason: 'insufficient-data',
      durationFit: emptyDurationFit(),
      completion: { available: false, rate: null, sampleSize: sessions.length },
      difficulty: {
        available: false, goodRate: null, okayRate: null, hardRate: null,
        sampleSize: sessions.length,
      },
    };
  }
  return {
    available: true,
    reason: null,
    durationFit: findDurationPattern(getDurationBuckets(sessions)),
    completion: calculateCompletion(sessions),
    difficulty: calculateDifficulty(sessions),
  };
}