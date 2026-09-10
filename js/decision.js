/* ═══ Decision Engine V1 — «الان چی کار کنیم؟» ═══
   Pure scoring logic with no DOM access. today.js collects the current
   tasks, date and energy level, calls getRecommendation() and renders
   the structured result. The engine is fully deterministic. */

import { dayKey } from './utils.js';

const DAY = 864e5;
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const ALL_DONE_REASON = 'امروز دیگه کاری نمونده. دمت گرم.';
export const SINGLE_TASK_REASON = 'فکر کنم همین یکی رو بزنیم.';

/* ── Scoring tables ── */

const PRI_SCORE = { high: 30, mid: 20, low: 10 };
const PRI_DEFAULT = 'mid'; // unknown priority falls back safely to medium

/* Energy-fit rows by duration bucket: ≤15, 16–30, 31–60, 61+ minutes */
const ENERGY_FIT = {
  low:    [15, 10, 5, 0],
  normal: [8, 12, 15, 8],
  high:   [3, 8, 15, 14],
};

const SKIP_PENALTY = 8; // per rejection, session-only

/* ── Decision Context tie-break (V1) ──
   History-driven context may only reorder candidates whose base scores are
   within CONTEXT_TIE_GAP points; beyond that it has no say. V1 never adds
   a modifier to the base score — the cap below is reserved so any future
   modifier stays bounded. */
const CONTEXT_TIE_GAP = 5;
const CONTEXT_MODIFIER_CAP = 10;

/* Task duration → decision-context range name, or null when unknown or
   outside the 5–90 minute buckets. A task without a duration is never
   assumed short or long. */
function contextRangeName(min) {
  const m = Number(min);
  if (!Number.isFinite(m)) return null;
  if (m >= 5 && m <= 15) return 'short';
  if (m >= 16 && m <= 30) return 'medium';
  if (m >= 31 && m <= 60) return 'long';
  if (m >= 61 && m <= 90) return 'veryLong';
  return null;
}

/* Only a meaningful, available duration-fit pattern may guide ranking */
function contextUsable(ctx) {
  return !!(ctx && ctx.available === true
    && ctx.durationFit && ctx.durationFit.available === true
    && ctx.durationFit.preferredRange);
}

/* ── Date helpers ── */

/* Whole-day difference between a canonical YYYY-MM-DD deadline and today.
   Returns null for missing or malformed deadlines (treated as no deadline). */
function dueDiffDays(dueDate, todayKey) {
  if (typeof dueDate !== 'string' || !DAY_KEY_RE.test(dueDate)) return null;
  const d = new Date(dueDate + 'T00:00:00');
  const t = new Date(todayKey + 'T00:00:00');
  if (Number.isNaN(d.getTime()) || Number.isNaN(t.getTime())) return null;
  return Math.round((d - t) / DAY);
}

/* ── Score components ── */

export function deadlineScore(dueDate, todayKey) {
  const diff = dueDiffDays(dueDate, todayKey);
  if (diff === null) return 0;
  if (diff < 0) return 50;   // overdue
  if (diff === 0) return 45; // today
  if (diff === 1) return 35; // tomorrow
  if (diff === 2) return 28; // day after
  if (diff === 3) return 22;
  if (diff <= 7) return 15;  // 4–7 days
  if (diff <= 14) return 8;  // 8–14 days
  return 3;                  // 15+ days
}

export function priorityScore(p) {
  return PRI_SCORE[p] ?? PRI_SCORE[PRI_DEFAULT];
}

/* Duration bucket index: ≤15, 16–30, 31–60, 61+ (values beyond 90 keep the
   deepest-work tier so any valid duration classifies without crashing) */
function durationBucket(min) {
  return min <= 15 ? 0 : min <= 30 ? 1 : min <= 60 ? 2 : 3;
}

export function energyFitScore(durationMin, energy) {
  const m = Number(durationMin);
  if (!Number.isFinite(m) || m <= 0) return 0; // unknown duration → no guess
  const row = ENERGY_FIT[energy] || ENERGY_FIT.normal;
  return row[durationBucket(m)];
}

export function criticalBonus(p, diff) {
  return p === 'high' && diff !== null && diff <= 0 ? 10 : 0;
}

/* Map the 1–5 daily mood index onto the three decision energy levels.
   No mood set → Normal. */
export function energyFromMood(mood) {
  const m = Number(mood) || 0;
  if (m >= 4) return 'high';
  if (m >= 3) return 'normal';
  if (m >= 1) return 'low';
  return 'normal';
}

/* Session-only skip penalty (Map or plain object); never persisted.
   Returns a negative value so rankTask can add it directly. */
function skipPenalty(id, skipCounts) {
  if (!skipCounts) return 0;
  const n = typeof skipCounts.get === 'function' ? skipCounts.get(id) : skipCounts[id];
  return -SKIP_PENALTY * (Number(n) || 0);
}

/* ── Candidate ranking ── */

function validDuration(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function rankTask(task, todayKey, energy, skipCounts) {
  const diff = dueDiffDays(task.dueDate, todayKey);
  const p = PRI_SCORE[task.p] !== undefined ? task.p : PRI_DEFAULT;
  const durationMin = validDuration(task.durationMin);
  const deadline = deadlineScore(task.dueDate, todayKey);
  const priority = priorityScore(p);
  const fit = energyFitScore(durationMin, energy);
  const bonus = criticalBonus(p, diff);
  const penalty = skipPenalty(task.id, skipCounts);
  const created = Number(task.created);
  return {
    task, score: deadline + priority + fit + bonus + penalty,
    diff, durationMin, fit,
    created: Number.isFinite(created) ? created : Infinity,
  };
}

/* Higher score wins; ties break by nearer deadline, then shorter duration
   (unknown duration counts as longest, never as zero), then older task */
function compareCandidates(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const da = a.diff ?? Infinity;
  const db = b.diff ?? Infinity;
  if (da !== db) return da - db;
  const fa = a.durationMin ?? Infinity;
  const fb = b.durationMin ?? Infinity;
  if (fa !== fb) return fa - fb;
  return a.created - b.created;
}

/* Score first, then — only inside the CONTEXT_TIE_GAP window — the context
   preference: a candidate inside the preferred range wins, a candidate
   inside the weaker range gets no advantage at all. */
function compareWithContext(a, b, ctx) {
  const diff = b.score - a.score;
  if (diff !== 0 && Math.abs(diff) > CONTEXT_TIE_GAP) return diff;
  const pr = ctx.durationFit.preferredRange;
  const pa = contextRangeName(a.durationMin) === pr;
  const pb = contextRangeName(b.durationMin) === pr;
  if (pa !== pb) return pa ? -1 : 1;
  return diff !== 0 ? diff : compareCandidates(a, b);
}

/* ── Reason engine (kept separate from scoring; never exposes numbers) ── */

function pickReason(c) {
  if (c.diff !== null && c.diff < 0) return 'این یکی از موعدش گذشته.';
  if (c.task.p === 'high' && c.diff === 0) return 'این یکی امروز مهم‌تره.';
  if (c.diff !== null && c.diff >= 1 && c.diff <= 3) return 'این یکی داره نزدیک می‌شه.';
  if (c.fit === 15) return 'با انرژی الانت جور درمیاد.';
  if (c.durationMin !== null && c.durationMin <= 15) return 'برای شروع، جمع‌کردنش راحته.';
  if (c.durationMin !== null && (c.durationMin > 60 || (c.durationMin > 30 && c.task.p === 'high')))
    return 'یکم سنگینه، ولی بهتره همین یکی رو بزنیم.';
  return 'فکر کنم همین یکی رو بزنیم.';
}

/* Natural micro-copy used only when the recommendation was actually chosen
   with the help of the context (kept human — never statistical) */
const CONTEXT_REASONS = {
  short: 'این یکی کوتاهه؛ برای شروع انتخاب بدی نیست.',
  medium: 'جلسه‌های این قدی این مدت بهتر پیش رفتن.',
  long: 'جلسه‌های بلندت این مدت بهتر پیش رفتن.',
  veryLong: 'تمرکزهای طولانی‌ات این مدت بهتر پیش رفتن.',
};

/* Only known task fields leave the engine — internal scores stay inside */
function publicTask(t) {
  return {
    id: t.id, text: t.text, done: t.done, p: t.p, cat: t.cat,
    dueDate: t.dueDate, durationMin: t.durationMin ?? null,
    created: t.created, doneAt: t.doneAt,
  };
}

/* Human reason for a single task (used when an alternative is shown) */
export function reasonForTask(task, { today = new Date(), energy = 'normal' } = {}) {
  const todayKey = dayKey(today instanceof Date ? today : new Date());
  return pickReason(rankTask(task, todayKey, energy, null));
}

/* ── Main entry ──
   Input:  { tasks, today (Date), energy ('low'|'normal'|'high'), skipCounts,
             context (optional Decision Context object) }
   Output: { state: 'ok'|'all-done'|'empty', primary, alternatives, reason } */
export function getRecommendation({ tasks, today = new Date(), energy = 'normal', skipCounts = new Map(), context = null } = {}) {
  const todayKey = dayKey(today instanceof Date ? today : new Date());
  const list = Array.isArray(tasks) ? tasks : [];
  if (!list.length) return { state: 'empty', primary: null, alternatives: [], reason: null };

  const active = list.filter(t => t && typeof t === 'object' && t.done !== true);
  if (!active.length) return { state: 'all-done', primary: null, alternatives: [], reason: ALL_DONE_REASON };

  const candidates = active
    .filter(t => typeof t.text === 'string' && t.text.trim())
    .map(t => rankTask(t, todayKey, energy, skipCounts));

  if (!candidates.length) return { state: 'empty', primary: null, alternatives: [], reason: null };

  if (candidates.length === 1) {
    return { state: 'ok', primary: publicTask(candidates[0].task), alternatives: [], reason: SINGLE_TASK_REASON };
  }

  /* Base score first, always. Context may only reorder inside the gap. */
  const ctx = contextUsable(context) ? context : null;
  const pure = candidates.slice().sort(compareCandidates);
  const sorted = ctx
    ? candidates.slice().sort((a, b) => compareWithContext(a, b, ctx))
    : pure;

  const top = sorted[0];
  const cutoff = top.score - 20;
  const alternatives = sorted
    .slice(1)
    .filter(c => c.score >= cutoff)
    .slice(0, 2);

  /* The context reason is used only when the context actually changed the
     pick — never to dress up a choice the base score already made. */
  const contextHelped = ctx ? pure[0] !== top : false;
  const reason = contextHelped
    ? CONTEXT_REASONS[ctx.durationFit.preferredRange] || pickReason(top)
    : pickReason(top);

  return {
    state: 'ok',
    primary: publicTask(top.task),
    alternatives: alternatives.map(c => publicTask(c.task)),
    reason,
  };
}
