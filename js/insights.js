/* ═══ Insights V1: a calm 7-day reflection page ═══
   Pipeline: normalize → filter 7 days → metrics → sample-size gate →
   patterns → suggestion. The compute half is DOM-independent and exported
   for tests; renderInsights() is the only part that touches the page. */

import { state } from './state.js';
import { $, faNum, dayKey, parseDurationMin } from './utils.js';
import { getHistory } from './focushistory.js';
import { qorqoriMarkup } from './qorqori.js';
import { fekrbazMarkup } from './fekrbaz.js';

/* ── Sample-size rules (centralized — no magic numbers elsewhere) ── */
const MIN_SAMPLES = 3;      // below this: no pattern at all
const COMPARISON_SAMPLES = 6; // per-side/total minimum for a comparison pattern
const MIN_RATE_GAP = 20;    // percentage points a comparison must differ by

const DAY_MS = 24 * 60 * 60 * 1000;

/* ── Sanitizers: corrupt storage must never reach the math ── */

const validTs = t => Number.isFinite(t) && t > 0;

function normalizeTask(t) {
  if (!t || typeof t !== 'object') return null;
  const text = typeof t.text === 'string' ? t.text.trim() : '';
  if (!text) return null;
  return {
    id: String(t.id ?? ''),
    text,
    done: t.done === true,
    durationMin: parseDurationMin(t.durationMin),
    created: validTs(Number(t.created)) ? Number(t.created) : null,
    doneAt: t.done && validTs(Number(t.doneAt)) ? Number(t.doneAt) : null,
  };
}

function normalizeSession(s, now = Date.now()) {
  if (!s || typeof s !== 'object') return null;
  const status = ['completed', 'active', 'paused', 'cancelled'].includes(s.status) ? s.status : null;
  if (!status) return null;
  const startedAt = validTs(Number(s.startedAt)) ? Number(s.startedAt) : null;
  if (!startedAt) return null;
  // Active minutes: stored actual, or elapsed for a live session
  let actualMin = Number(s.actualDurationMin);
  if (!Number.isFinite(actualMin) || actualMin < 0) {
    const activeMs = Number(s.activeMs) >= 0 ? Number(s.activeMs) : 0;
    const runMs = status === 'active' && validTs(Number(s.runStartedAt))
      ? Math.max(0, now - Number(s.runStartedAt)) : 0;
    actualMin = Math.round((activeMs + runMs) / 60000);
  }
  return {
    id: String(s.id ?? ''),
    startedAt,
    status,
    plannedMin: parseDurationMin(s.plannedDurationMin),
    actualMin: actualMin > 0 ? actualMin : null,
    taskCompleted: s.taskCompleted === true,
    rating: ['good', 'okay', 'hard'].includes(s.rating) ? s.rating : null,
  };
}

/* ── Metric helpers ── */

const rate = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);

function pctFa(p) {
  return p === null ? null : `${faNum(p)}٪`;
}

/* ═══ Compute pipeline (pure — no DOM) ═══ */

export function computeInsights(now = Date.now()) {
  const windowStart = now - 6 * DAY_MS - (new Date(now).getHours() * 3600 + new Date(now).getMinutes() * 60 + new Date(now).getSeconds()) * 1000;

  const tasks = (Array.isArray(state.tasks) ? state.tasks : [])
    .map(normalizeTask).filter(Boolean);

  const created7 = tasks.filter(t => t.created !== null && t.created >= windowStart && t.created <= now);
  const done7 = tasks.filter(t => t.doneAt !== null && t.doneAt >= windowStart && t.doneAt <= now);

  /* Relevant denominator: tasks created in the window or completed in it */
  const relevantIds = new Set();
  created7.forEach(t => relevantIds.add(t.id));
  done7.forEach(t => relevantIds.add(t.id));
  const relevant = tasks.filter(t => relevantIds.has(t.id));

  const completionRate = rate(done7.length, relevant.length);

  /* Focus: the history archive is the single source of truth. Every
     reflected session is archived before insights can see it, so the
     live current session is never counted here (no double-counting).
     History records arrive pre-validated by the history module. */
  const sessions = getHistory()
    .map(r => ({ ...r, status: 'completed', actualMin: r.actualDurationMin }))
    .filter(s => s.startedAt >= windowStart && s.startedAt <= now);
  const focusMinutes = sessions.reduce((sum, s) => sum + (s.actualMin || 0), 0);

  /* Mood: dayKey → 1..5 recorded in the window */
  const moodDays = [];
  if (state.moods && typeof state.moods === 'object') {
    for (let i = 0; i < 7; i++) {
      const k = dayKey(new Date(now - i * DAY_MS));
      const m = Number(state.moods[k]);
      if (m >= 1 && m <= 5) moodDays.push({ key: k, mood: m });
    }
  }
  const moodAvg = moodDays.length
    ? moodDays.reduce((s, d) => s + d.mood, 0) / moodDays.length : null;

  const summary = {
    createdCount: created7.length,
    doneCount: done7.length,
    completionRate,
    focusCount: sessions.length,
    focusMinutes: sessions.length && focusMinutes > 0 ? focusMinutes : null,
    moodDays: moodDays.length,
    moodAvg,
  };

  const insights = [
    ...taskPattern(relevant, done7),
    ...focusPattern(sessions),
    ...energyPattern(moodDays, relevant, done7, now),
  ].slice(0, 3);

  return { summary, insights, suggestion: makeSuggestion(insights), state: 'ok' };
}

/* ── Insight 1: task completion vs duration ── */
function taskPattern(relevant, done7) {
  const doneIds = new Set(done7.map(t => t.id));

  /* Completion counts alone are summary info, not a pattern — a pattern needs
     a comparison between two groups with enough samples on both sides. */
  const dur = relevant.filter(t => t.durationMin !== null);
  const nodur = relevant.filter(t => t.durationMin === null);
  const durDone = dur.filter(t => doneIds.has(t.id)).length;
  const nodurDone = nodur.filter(t => doneIds.has(t.id)).length;

  if (relevant.length >= COMPARISON_SAMPLES && dur.length >= MIN_SAMPLES && nodur.length >= MIN_SAMPLES) {
    const r1 = rate(durDone, dur.length);
    const r2 = rate(nodurDone, nodur.length);
    if (r1 !== null && r2 !== null && Math.abs(r1 - r2) >= MIN_RATE_GAP) {
      const higher = r1 > r2 ? 'durated' : 'plain';
      return [{
        type: 'task-duration',
        text: higher === 'durated'
          ? 'کارهایی که براشون زمان مشخص کرده بودی، بیشتر کامل شدن.'
          : 'کارهای بدون زمان مشخص، این هفته بیشتر کامل شدن.',
        evidence: { durated: { total: dur.length, done: durDone, rate: r1 }, plain: { total: nodur.length, done: nodurDone, rate: r2 } },
      }];
    }
  }

  /* Short vs long among duration-bearing tasks */
  const short = dur.filter(t => t.durationMin <= 30);
  const long = dur.filter(t => t.durationMin > 30);
  if (dur.length >= COMPARISON_SAMPLES && short.length >= MIN_SAMPLES && long.length >= MIN_SAMPLES) {
    const sDone = short.filter(t => doneIds.has(t.id)).length;
    const lDone = long.filter(t => doneIds.has(t.id)).length;
    const rs = rate(sDone, short.length);
    const rl = rate(lDone, long.length);
    if (rs !== null && rl !== null && Math.abs(rs - rl) >= MIN_RATE_GAP) {
      return [{
        type: 'task-length',
        text: rs > rl
          ? `بیشتر کارهای کوتاه‌تر (تا ${faNum(30)} دقیقه) این هفته کامل شدن.`
          : 'کارهای طولانی‌تر این هفته بیشتر کامل شدن.',
        evidence: { short: { total: short.length, done: sDone, rate: rs }, long: { total: long.length, done: lDone, rate: rl } },
      }];
    }
  }

  return [];
}

/* ── Insight 2: focus pattern ── */
function focusPattern(sessions) {
  if (sessions.length < MIN_SAMPLES) return []; // honest: not enough samples, no pattern
  const finished = sessions.filter(s => s.status === 'completed');
  const success = sessions.filter(s => s.taskCompleted);
  const r = rate(success.length, sessions.length);
  if (r === null) return [];
  return [{
    type: 'focus',
    text: r >= 50
      ? 'بیشتر تمرکزهات به کار واقعی رسیدن.'
      : 'تمرکزهات شروع شدن ولی کمتر به تکمیل کار رسیده‌ان.',
    evidence: { sessions: sessions.length, finished: finished.length, completedTasks: success.length, rate: r },
    focusRelated: true,
  }];
}

/* ── Insight 3: energy (mood) vs completion ── */
function energyPattern(moodDays, relevant, done7, now) {
  const doneIds = new Set(done7.map(t => t.id));
  const DAY_MS_LOCAL = 24 * 60 * 60 * 1000;

  const byDay = moodDays.map(d => {
    const dayStart = new Date(d.key + 'T00:00:00').getTime();
    const dayEnd = dayStart + DAY_MS_LOCAL;
    const dayTasks = relevant.filter(t => {
      const ts = t.doneAt || t.created;
      return ts !== null && ts >= dayStart && ts < dayEnd;
    });
    return { mood: d.mood, total: dayTasks.length, done: dayTasks.filter(t => doneIds.has(t.id)).length };
  }).filter(d => d.total > 0);

  const low = byDay.filter(d => d.mood <= 2);
  const high = byDay.filter(d => d.mood >= 4);
  const totalLow = low.reduce((s, d) => s + d.total, 0);
  const totalHigh = high.reduce((s, d) => s + d.total, 0);

  if (low.length < MIN_SAMPLES || high.length < MIN_SAMPLES || totalLow < MIN_SAMPLES || totalHigh < MIN_SAMPLES) return [];

  const rl = rate(low.reduce((s, d) => s + d.done, 0), totalLow);
  const rh = rate(high.reduce((s, d) => s + d.done, 0), totalHigh);
  if (rl === null || rh === null || Math.abs(rl - rh) < MIN_RATE_GAP) return [];

  const betterHigh = rh > rl;
  return [{
    type: 'energy',
    text: betterHigh
      ? 'روی روزهایی که انرژی‌ات بالاتر بوده، کارها بیشتر کامل شدن.'
      : 'جالبه: روی روزهایی که انرژی‌ات پایین‌تر بوده هم کارها پیش رفتن.',
    evidence: { lowDays: low.length, highDays: high.length, lowRate: rl, highRate: rh },
    khabalo: !betterHigh,
  }];
}

/* ── Suggestion: deterministic mapping from the first valid insight ── */
function makeSuggestion(insights) {
  const first = insights[0];
  if (!first) return null;
  if (first.type === 'task-duration') {
    return first.evidence.durated.rate > first.evidence.plain.rate
      ? 'شاید برای کارهای بعدی‌ات یه زمان کوچیک مشخص کنی، رابطهٔ بهتری باهاشون پیدا کنی.'
      : 'شاید بعضی کارها رو بدون درگیر شدن با زمان، ساده‌تر جلو ببری.';
  }
  if (first.type === 'task-length') {
    return first.evidence.short.rate > first.evidence.long.rate
      ? 'شاید شروع با یه کار ۱۵ دقیقه‌ای برات راحت‌تر باشه.'
      : 'شاید وقتی برای کارهای بزرگ‌تر وقت می‌ذاری، بهتر جلو می‌ری.';
  }
  if (first.type === 'focus') {
    return 'شاید تمرکزهای کوتاه‌تر ولی منظم‌تر کمکت کنه کارها کامل بشن.';
  }
  if (first.type === 'energy') {
    return first.evidence.highRate > first.evidence.lowRate
      ? 'شاید کارهای مهم رو بذاری روی روزهایی که انرژی بیشتری داری.'
      : 'روزهای کم‌انرژی هم پیشرفت خودشون رو دارن — همین کافیه.';
  }
  return null;
}

/* ═══ Render (thin DOM layer) ═══ */

export function renderInsights() {
  const page = $('#page-insights');
  if (!page) return;

  const { summary, insights, suggestion } = computeInsights();

  /* Empty state: nothing meaningful happened in 7 days */
  const empty = $('#insightsEmpty');
  const body = $('#insightsBody');
  const hasAnything = summary.createdCount > 0 || summary.doneCount > 0 || summary.focusCount > 0;
  if (empty) {
    empty.hidden = hasAnything;
    /* Qorqori with a calm expression keeps the empty state warm, not alarming */
    const slot = empty.querySelector('.insights-empty-char');
    if (slot && !slot.innerHTML) slot.innerHTML = qorqoriMarkup('default');
  }
  if (body) body.hidden = !hasAnything;
  if (!hasAnything) return;

  /* Summary chips — only show what the data actually supports */
  const chips = [];
  if (summary.doneCount > 0 || summary.createdCount > 0) {
    chips.push({ v: faNum(summary.doneCount), l: 'کار انجام‌شده' });
    if (summary.completionRate !== null) chips.push({ v: pctFa(summary.completionRate), l: 'نرخ تکمیل' });
  }
  if (summary.focusCount > 0) {
    chips.push({ v: faNum(summary.focusCount), l: 'تمرکز' });
    if (summary.focusMinutes !== null) chips.push({ v: faNum(summary.focusMinutes), l: 'دقیقه تمرکز' });
  }
  if (summary.moodAvg !== null) {
    chips.push({ v: faNum(Math.round(summary.moodAvg * 10) / 10), l: 'میانگین حال' });
  }
  const sum = $('#insightsSummary');
  if (sum) sum.innerHTML = chips.map(c => `<div class="stat-chip"><b>${c.v}</b><span>${c.l}</span></div>`).join('');
  if (sum) sum.hidden = chips.length === 0;

  /* Insights list */
  const list = $('#insightsList');
  if (list) {
    list.innerHTML = insights.map(i => {
      const char = i.focusRelated
        ? fekrbazMarkup('thinking')
        : (i.khabalo ? '' : qorqoriMarkup('thinking'));
      return `<div class="insight-card">${char ? `<span class="insight-char" aria-hidden="true">${char}</span>` : ''}<p>${i.text}</p></div>`;
    }).join('');
  }
  const listHead = $('#insightsListHead');
  if (listHead) listHead.hidden = insights.length === 0;

  /* Suggestion */
  const sugCard = $('#insightsSuggestion');
  const sugText = $('#insightsSuggestionText');
  if (sugCard) sugCard.hidden = !suggestion;
  if (sugText && suggestion) sugText.textContent = suggestion;
}

export function initInsights() {
  $('#openInsightsBtn')?.addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'insights' })));
  $('#insightsBackBtn')?.addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'today' })));
  /* Re-render whenever data changes while the page is open */
  import('./bus.js').then(({ subscribe }) => subscribe(() => {
    if ($('#page-insights')?.classList.contains('active')) renderInsights();
  }));
}
