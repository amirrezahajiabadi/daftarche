/* ═══ Stats: one page, five windows ═══
   Everything the app knows about the reader's effort, aggregated for one
   rolling window at a time: the last 7, 30, 90, 180 or 365 days.

   Three parts, in this order:

     · sanitizers — storage is never trusted, so every task and every session is
       normalized before it can reach any math. They live here because this is
       the module that turns raw records into numbers, and the insights engine
       reads the same definitions instead of keeping copies of its own.
     · computeStats() — pure, DOM-free, parameterized on `now` (so it can be
       reasoned about and tested), returning one flat model for a window plus the
       previous window of the same length for comparison.
     · renderStats() / initStats() — the thin DOM layer for page-stats.

   A window is a rolling one, day-aligned: «۳۰ روز» means the last 30 days
   including today, not "this calendar month". A rolling window is never empty
   just because a month just started, and two windows can always be compared
   because they are the same length.

   Nothing here invents a number. A section with no data behind it is hidden
   rather than printed as a zero, and a rate with no denominator is null. */

import { state } from './state.js';
import { $, faNum, dayKey, parseDurationMin } from './utils.js';
import { CATS, MOODS, WEEKDAY_LETTERS } from './constants.js';
import { getBooks } from './library.js';
import { getHistory, RATING_LABEL, RATING_FACE, historyDayLabel } from './focushistory.js';
import { dateToJalali, JALALI_MONTHS } from './jalali.js';
import { subscribe } from './bus.js';
import { qorqoriMarkup } from './qorqori.js';
import { loadStatsRange, saveStatsRange } from './store.js';
import { streakToday } from './ledger.js';

/* ── The five windows ──
   `bucket` decides how the window is drawn: a bar per day for the two short
   ones, per week for three months, per month for the long ones. */
export const RANGES = [
  { key: 'week',  days: 7,   label: 'هفته',    sub: '۷ روز گذشته',   bucket: 'day' },
  { key: 'month', days: 30,  label: 'ماه',     sub: '۳۰ روز گذشته',  bucket: 'day' },
  { key: 'q3',    days: 90,  label: '۳ ماه',   sub: '۹۰ روز گذشته',  bucket: 'week' },
  { key: 'q6',    days: 180, label: '۶ ماه',   sub: '۱۸۰ روز گذشته', bucket: 'month' },
  { key: 'year',  days: 365, label: 'یک‌سال',  sub: '۱ سال گذشته',   bucket: 'month' },
];

const DEFAULT_RANGE = 'week';

export const rangeByKey = key => RANGES.find(r => r.key === key) || RANGES[0];

/* ── Sanitizers ──
   Corrupt storage must never reach the math: a string where a timestamp should
   be, a task with no text, a session with no start. */

const validTs = t => Number.isFinite(t) && t > 0;

export function normalizeTask(t) {
  if (!t || typeof t !== 'object') return null;
  const text = typeof t.text === 'string' ? t.text.trim() : '';
  if (!text) return null;
  return {
    id: String(t.id ?? ''),
    text,
    done: t.done === true,
    cat: typeof t.cat === 'string' && t.cat ? t.cat : 'misc',
    p: ['low', 'mid', 'high'].includes(t.p) ? t.p : 'mid',
    dueDate: typeof t.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) ? t.dueDate : null,
    durationMin: parseDurationMin(t.durationMin),
    created: validTs(Number(t.created)) ? Number(t.created) : null,
    doneAt: t.done && validTs(Number(t.doneAt)) ? Number(t.doneAt) : null,
  };
}

export function normalizeSession(s, now = Date.now()) {
  if (!s || typeof s !== 'object') return null;
  const status = ['completed', 'active', 'paused', 'cancelled'].includes(s.status) ? s.status : null;
  if (!status) return null;
  const startedAt = validTs(Number(s.startedAt)) ? Number(s.startedAt) : null;
  if (!startedAt) return null;
  let actualMin = Number(s.actualDurationMin);
  if (!Number.isFinite(actualMin) || actualMin < 0) {
    const activeMs = Number(s.activeMs) >= 0 ? Number(s.activeMs) : 0;
    const runMs = status === 'active' && validTs(Number(s.runStartedAt))
      ? Math.max(0, now - Number(s.runStartedAt)) : 0;
    actualMin = Math.round((activeMs + runMs) / 60000);
  }
  return {
    id: String(s.id ?? ''),
    taskTitle: typeof s.taskTitle === 'string' && s.taskTitle.trim() ? s.taskTitle.trim() : null,
    startedAt,
    status,
    plannedMin: parseDurationMin(s.plannedDurationMin),
    actualMin: actualMin > 0 ? actualMin : null,
    taskCompleted: s.taskCompleted === true,
    rating: ['good', 'okay', 'hard'].includes(s.rating) ? s.rating : null,
  };
}

/* ── Streak ──
   There is still exactly one definition of a streak in the app, but it no
   longer lives here: a streak is a property of the days themselves, and since
   the day book was added (js/ledger.js) that is where days are kept — together
   with the freezes that can repair a single missed one. This page asks for it
   by name instead of keeping a second, slightly different copy. */
export const calcStreak = () => streakToday().current;

/* ── Calendar helpers (day-aligned, DST-proof) ── */

const dayStart = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

/* A day-aligned timestamp `n` calendar days away. Stepped with setDate rather
   than with a day's worth of milliseconds: in a timezone that shifts its clock
   86,400,000ms is not always a day, and a window built that way can drift a day
   off its own name. */
const shiftDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };

function daysBetween(fromTs, toTs) {
  const out = [];
  const d = new Date(fromTs); d.setHours(0, 0, 0, 0);
  const end = dayStart(toTs);
  while (d.getTime() <= end) {
    const j = dateToJalali(d);
    out.push({
      ts: d.getTime(), key: dayKey(d), jd: j.jd, jm: j.jm, weekday: d.getDay(),
      done: 0, created: 0, focusMin: 0, readMin: 0, readPages: 0, marks: 0, mood: 0,
    });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/* The Saturday-based week a day belongs to — the Iranian week, the same one the
   weekday letters in the today chart spell out. */
function weekStartTs(ts) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 1) % 7;   // شنبه = 0
  d.setDate(d.getDate() - back);
  return d.getTime();
}

/* ── Filling a window's days from every source the app has ── */

function fillDays(days) {
  const byKey = new Map(days.map(d => [d.key, d]));
  const first = days[0].ts;
  const last = shiftDays(days[days.length - 1].ts, 1);

  const tasks = (Array.isArray(state.tasks) ? state.tasks : []).map(normalizeTask).filter(Boolean);
  for (const t of tasks) {
    if (t.created !== null && t.created >= first && t.created < last) {
      const d = byKey.get(dayKey(new Date(t.created))); if (d) d.created++;
    }
    if (t.doneAt !== null && t.doneAt >= first && t.doneAt < last) {
      const d = byKey.get(dayKey(new Date(t.doneAt))); if (d) d.done++;
    }
  }

  /* History records name the minutes `actualDurationMin`; the model below and
     the insights engine both speak `actualMin`, so the rename happens once, here,
     where the archive meets the math. Reading the wrong name is not a crash — it
     is worse: a silent zero in every focus total on the page. */
  const sessions = getHistory()
    .map(r => ({ ...r, status: 'completed', actualMin: r.actualDurationMin }))
    .filter(s => s.startedAt >= first && s.startedAt < last);
  for (const s of sessions) {
    const d = byKey.get(dayKey(new Date(s.startedAt)));
    if (d) d.focusMin += s.actualMin || 0;
  }

  const books = getBooks();
  for (const b of books) {
    /* Reading minutes and pages are already stored per day (reader.js) */
    for (const [k, v] of Object.entries(b.stats || {})) {
      const d = byKey.get(k);
      if (!d || !v) continue;
      d.readMin += Number(v.minutes) || 0;
      d.readPages += Number(v.pages) || 0;
    }
    /* Marks carry their own timestamp, so they can be windowed honestly */
    for (const list of [b.highlights, b.notes]) {
      for (const m of (list || [])) {
        const ts = Number(m && m.createdAt);
        if (!validTs(ts) || ts < first || ts >= last) continue;
        const d = byKey.get(dayKey(new Date(ts))); if (d) d.marks++;
      }
    }
  }

  if (state.moods && typeof state.moods === 'object') {
    for (const d of days) {
      const m = Number(state.moods[d.key]);
      if (Number.isInteger(m) && m >= 1 && m <= MOODS.length) d.mood = m;
    }
  }

  return { tasks, sessions };
}

/* ── Buckets: the days of a window, gathered the way the range is drawn ── */

function bucketize(days, kind, nowTs) {
  const groups = new Map();
  const todayKey = dayKey(new Date(nowTs));
  /* Where each day sits in the window. The tick rows are counted from the end of
     the window rather than from a date's own number, so the labels stay evenly
     spaced however the window happens to fall. */
  const pos = new Map(days.map((d, i) => [d.key, i]));

  for (const d of days) {
    let gkey, glabel = '';
    if (kind === 'week') {
      const start = weekStartTs(d.ts);
      gkey = 'w' + start;
      /* Only every third week is labelled: thirteen labels under thirteen
         columns is noise, four is a timeline. */
      const idx = Math.round((start - weekStartTs(days[0].ts)) / (7 * 864e5));
      glabel = idx % 3 === 0 ? `م${faNum(d.jd)}` : '';
    } else if (kind === 'month') {
      gkey = `${d.jm}-${dateToJalali(new Date(d.ts)).jy}`;
      glabel = JALALI_MONTHS[d.jm - 1];
    } else {
      gkey = d.key;
      /* Seven days get their weekday letter; thirty get a date every fifth bar,
         counted back from today: the ticks keep an even rhythm, and the day the
         reader is living in always carries its number instead of only when its
         date happens to land on the fifth step. */
      glabel = days.length <= 7
        ? WEEKDAY_LETTERS[d.weekday]
        : ((days.length - 1 - pos.get(d.key)) % 5 === 0 ? faNum(d.jd) : '');
    }

    let g = groups.get(gkey);
    if (!g) {
      g = { key: gkey, label: glabel, done: 0, focusMin: 0, readMin: 0, marks: 0, moodSum: 0, moodN: 0, today: false };
      groups.set(gkey, g);
    } else if (!g.label && glabel) g.label = glabel;
    g.done += d.done;
    g.focusMin += d.focusMin;
    g.readMin += d.readMin;
    g.marks += d.marks;
    if (d.mood) { g.moodSum += d.mood; g.moodN++; }
    if (d.key === todayKey) g.today = true;
  }

  return [...groups.values()].map(g => ({
    key: g.key, label: g.label, done: g.done, today: g.today,
    focusMin: g.focusMin, readMin: g.readMin, marks: g.marks,
    mood: g.moodN ? g.moodSum / g.moodN : null,
  }));
}

/* ═══ The model ═══ */

const rate = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);
const sum = (list, pick) => list.reduce((s, x) => s + (pick(x) || 0), 0);

/* ── Memo ──
   This page repaints on every change the app announces, and each repaint used
   to rebuild the whole window — a year of day cells, every task, every session
   — even when nothing the math reads had moved. The fingerprint below is a flat
   projection of exactly the fields computeStats consumes; while it is unchanged
   the previous model is handed back untouched, so a repaint that would produce
   the same numbers costs one string comparison instead of a year of days.
   Nothing that can move a number is left out: every task's tick and its dates,
   every archived session, every recorded mood, every reading day and mark, and
   the day the window ends on. */
let memo = { key: '', model: null };

function fingerprint(rangeKey, now) {
  const parts = [rangeKey, dayKey(new Date(now))];
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  parts.push('t' + tasks.length);
  for (const t of tasks) {
    parts.push(`${t.done ? 1 : 0}:${t.cat || ''}:${t.dueDate || ''}:${t.doneAt || 0}:${t.created || 0}:${t.text ? 1 : 0}`);
  }
  const hist = getHistory();
  parts.push('h' + hist.length);
  for (const r of hist) parts.push(`${r.id}:${r.startedAt}:${r.actualDurationMin}:${r.taskCompleted ? 1 : 0}`);
  const moods = state.moods && typeof state.moods === 'object' ? state.moods : {};
  const moodKeys = Object.keys(moods);
  parts.push('m' + moodKeys.length);
  for (const k of moodKeys) parts.push(`${k}=${moods[k]}`);
  parts.push('s' + (Array.isArray(state.history) ? state.history.length : 0));
  for (const b of getBooks()) {
    parts.push('b' + (b.id || ''));
    for (const [k, v] of Object.entries(b.stats || {})) parts.push(`${k}:${Number(v && v.pages) || 0}:${Number(v && v.minutes) || 0}`);
    for (const m of (b.highlights || [])) parts.push('M' + (Number(m && m.createdAt) || 0));
    for (const m of (b.notes || [])) parts.push('N' + (Number(m && m.createdAt) || 0));
    parts.push('C' + ((b.completedPages || []).length));
  }
  return parts.join('|');
}

export function computeStats(rangeKey = DEFAULT_RANGE, now = Date.now()) {
  const key = fingerprint(rangeKey, now);
  if (memo.model && key === memo.key) return memo.model;
  const model = buildStats(rangeKey, now);
  memo = { key, model };
  return model;
}

function buildStats(rangeKey = DEFAULT_RANGE, now = Date.now()) {
  const range = rangeByKey(rangeKey);
  const today = dayStart(now);
  const from = shiftDays(today, -(range.days - 1));
  const prevFrom = shiftDays(from, -range.days);

  const days = daysBetween(from, now);
  const prevDays = daysBetween(prevFrom, shiftDays(from, -1));

  const { tasks, sessions } = fillDays(days);
  const prev = fillDays(prevDays);

  /* ── Tasks ──
     The same denominator the insights use: everything that was created in the
     window or finished in it — a task carried over from before counts as work
     of this window once it is ticked.

     Both windows are bounded on both sides. The previous one needs its upper
     bound most of all: without it, everything completed since it ended falls
     inside it as well (a completion is always "after" that window), and the
     comparison this page leads with would be measured against a window that
     never existed. */
  const inWindow = (t, start, end) =>
    (t.created !== null && t.created >= start && t.created < end) ||
    (t.doneAt !== null && t.doneAt >= start && t.doneAt < end);
  const windowTasks = tasks.filter(t => inWindow(t, from, Infinity));
  const done = windowTasks.filter(t => t.doneAt !== null).length;
  const created = windowTasks.filter(t => t.created !== null && t.created >= from).length;
  const prevTasks = prev.tasks.filter(t => inWindow(t, prevFrom, from));
  const donePrev = prevTasks.filter(t => t.doneAt !== null).length;

  const activeDays = days.filter(d => d.done > 0).length;
  const prevActiveDays = prevDays.filter(d => d.done > 0).length;

  /* Longest run of ticked days inside the window */
  let bestStreak = 0, run = 0;
  for (const d of days) { run = d.done > 0 ? run + 1 : 0; if (run > bestStreak) bestStreak = run; }

  /* ── Focus ── */
  const focusMinutes = sum(sessions, s => s.actualMin);
  const prevFocusMinutes = sum(prev.sessions, s => s.actualMin);
  const bestSession = sessions.slice().sort((a, b) => (b.actualMin || 0) - (a.actualMin || 0))[0] || null;

  /* ── Categories: share of the ticks that carry a category ── */
  const catCounts = new Map();
  for (const t of windowTasks) {
    if (t.doneAt === null) continue;
    catCounts.set(t.cat, (catCounts.get(t.cat) || 0) + 1);
  }
  const catTotal = done;
  const cats = [...catCounts.entries()]
    .map(([key, count]) => {
      const meta = CATS.find(c => c.key === key);
      return { key, count, pct: catTotal ? Math.round((count / catTotal) * 100) : 0, label: meta ? meta.label : 'متفرقه', color: meta ? meta.color : 'var(--muted)' };
    })
    .sort((a, b) => b.count - a.count);

  /* ── Reading and marks ── */
  const reading = {
    minutes: sum(days, d => d.readMin),
    pages: sum(days, d => d.readPages),
    marks: sum(days, d => d.marks),
    booksOpen: getBooks().filter(b => (b.stats && Object.keys(b.stats).length) || b.completedPages?.length).length,
  };

  /* ── Mood ── */
  const moodDays = days.filter(d => d.mood > 0);
  const mood = {
    days: moodDays.length,
    avg: moodDays.length ? moodDays.reduce((s, d) => s + d.mood, 0) / moodDays.length : null,
    dist: MOODS.map((_, i) => moodDays.filter(d => d.mood === i + 1).length),
  };

  /* ── Timing: ticked before the deadline, or after it ── */
  let onTime = 0, late = 0;
  for (const t of windowTasks) {
    if (t.doneAt === null) continue;
    if (!t.dueDate) continue;
    if (dayKey(new Date(t.doneAt)) <= t.dueDate) onTime++; else late++;
  }
  const dated = onTime + late;

  /* ── Best day and best weekday ── */
  const bestDay = days.reduce((best, d) => (d.done > 0 && (!best || d.done >= best.done) ? d : best), null);
  const byWeekday = WEEKDAY_LETTERS.map((letter, i) => ({
    letter,
    name: ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'][i],
    count: sum(days.filter(d => d.weekday === i), d => d.done),
  }));
  const bestWeekday = activeDays >= 3 && Math.max(...byWeekday.map(w => w.count)) > 0
    ? byWeekday.reduce((a, b) => (b.count > a.count ? b : a))
    : null;

  const buckets = bucketize(days, range.bucket, now);

  const hasAny = done > 0 || sessions.length > 0 || created > 0 || reading.minutes > 0 || reading.marks > 0 || mood.days > 0;

  /* The streak and its freezes, read once. `frozen` rides along with the model
     because the chart marks those days: a repaired day is shown as repaired,
     never quietly counted as a day the reader showed up for. */
  const streak = streakToday();

  return {
    range,
    window: { from, to: today, days: days.length, sub: range.sub },
    headline: {
      done, donePrev, delta: done - donePrev,
      created,
      rate: rate(done, windowTasks.length),
      activeDays, activeDaysPrev: prevActiveDays, days: days.length,
      focusMinutes, focusMinutesPrev: prevFocusMinutes,
      streak: streak.current, bestStreak,
      streakFreezes: streak.used, streakFreezesLeft: streak.available,
    },
    frozen: [...streak.frozen],
    buckets,
    focus: {
      count: sessions.length,
      minutes: focusMinutes,
      avgMin: sessions.length ? Math.round(focusMinutes / sessions.length) : null,
      bestMin: bestSession ? bestSession.actualMin : null,
      completed: sessions.filter(s => s.taskCompleted).length,
      sessions: sessions.slice().sort((a, b) => b.startedAt - a.startedAt),
      daysActive: new Set(sessions.map(s => dayKey(new Date(s.startedAt)))).size,
    },
    cats,
    reading,
    mood,
    timing: { onTime, late, dated, onTimePct: rate(onTime, dated) },
    best: {
      day: bestDay ? { key: bestDay.key, label: `${faNum(dateToJalali(new Date(bestDay.ts)).jd)} ${JALALI_MONTHS[bestDay.jm - 1]}`, count: bestDay.done } : null,
      weekday: bestWeekday ? { name: bestWeekday.name, count: bestWeekday.count } : null,
    },
    hasAny,
  };
}

/* ═══ The page ═══
   Only one window is ever on screen, so only its numbers are painted. The chart
   is rebuilt when the number of buckets changes (a different range) and merely
   updated when the numbers do, which is what keeps a tick from restarting the
   entrance animation of thirty bars. */

let rangeKey = null;
let lastSig = '';
/* How many sessions the history section shows before the reader asks for the
   rest. A long window can hold a hundred of them; the section stays a glance
   until it is told otherwise. */
const HISTORY_PREVIEW = 6;
let historyExpanded = false;

export const currentRangeKey = () => rangeKey || DEFAULT_RANGE;

const deltaText = (now, before, unit) => {
  const diff = now - before;
  if (!diff) return '';
  return `${faNum(Math.abs(diff))} ${unit} ${diff > 0 ? 'بیشتر' : 'کمتر'} از بازهٔ قبل`;
};

function paintRangeButtons() {
  const wrap = $('#statsRange');
  if (!wrap) return;
  if (!wrap.dataset.built) {
    wrap.dataset.built = '1';
    wrap.innerHTML = RANGES.map(r =>
      `<button type="button" class="stat-range-btn" role="radio" data-key="${r.key}" aria-checked="false">${r.label}</button>`
    ).join('');
    wrap.addEventListener('click', e => {
      const b = e.target.closest('.stat-range-btn');
      if (b) setRange(b.dataset.key);
    });
    wrap.addEventListener('keydown', e => {
      const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const i = RANGES.findIndex(r => r.key === currentRangeKey());
      const next = RANGES[(i + step + RANGES.length) % RANGES.length];
      setRange(next.key);
      wrap.querySelector(`[data-key="${next.key}"]`)?.focus();
    });
  }
  wrap.querySelectorAll('.stat-range-btn').forEach(b => {
    const on = b.dataset.key === currentRangeKey();
    b.classList.toggle('sel', on);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

export function setRange(key) {
  if (!rangeByKey(key) || key === rangeKey) return;
  rangeKey = key;
  /* A different window starts its history closed again — the expand the reader
     asked for belonged to the list they were looking at. */
  historyExpanded = false;
  saveStatsRange(key);
  paintRangeButtons();
  renderStats();
}

/* Which days were repaired by a freeze. Set once per paint, read by the tooltip
   and by the two branches below that build and update the columns. */
let frozenKeys = new Set();

const barTitle = b => `${faNum(b.done)} کار${b.focusMin ? ` · ${faNum(b.focusMin)} دقیقه تمرکز` : ''}${b.mood ? ` · حال: ${MOODS[Math.round(b.mood) - 1].label}` : ''}${frozenKeys.has(b.key) ? ' · با مرخصی پیوستگی' : ''}`;

/* ── Ticks that fit ──
   A column is about thirty pixels wide and «اردیبهشت» is half as wide again as
   that, so a label on every column prints the names on top of one another. The
   names are laid out first and then thinned to every n-th tick — n measured, not
   guessed, from the room the widest name needs against the distance between two
   ticks, both of which move with the window, the range and the width of the
   card. Thinning starts at the newest column, so today always keeps its label.
   The full name stays on the span's data, which is what lets a rotation re-fit
   the row instead of leaving it thinner than the new width could carry. */
const TICK_GAP = 8;

function fitTicks(chart) {
  const spans = [...chart.querySelectorAll('.col > span')].filter(s => s.dataset.t);
  if (spans.length < 2) return;
  spans.forEach(s => { s.textContent = s.dataset.t; });
  const rects = spans.map(s => s.getBoundingClientRect());
  const pitch = Math.abs(rects[0].left - rects[rects.length - 1].left) / (spans.length - 1);
  /* Zero while the page is hidden: nothing has been laid out, so there is no
     width to fit against and the row is left for the next visible paint. */
  if (pitch < 2) return;
  const widest = Math.max(...rects.map(r => r.width));
  const step = Math.max(1, Math.ceil((widest + TICK_GAP) / pitch));
  if (step < 2) return;
  spans.forEach((s, i) => {
    if ((spans.length - 1 - i) % step) s.textContent = '';
  });
}

function paintChart(model) {
  const chart = $('#statsChart');
  if (!chart) return;
  const buckets = model.buckets;
  frozenKeys = new Set(model.frozen || []);
  const max = Math.max(...buckets.map(b => b.done), 1);
  const meta = $('#statsChartMeta');
  if (meta) meta.textContent = max > 1 ? `بیشترین: ${faNum(max)} کار` : '';

  if (chart.dataset.n !== String(buckets.length)) {
    chart.dataset.n = String(buckets.length);
    chart.classList.toggle('busy', buckets.length > 14);
    chart.innerHTML = '';
    /* The bars rise in one after another, and the rise is a CSS keyframe rather
       than a requestAnimationFrame hand-off: the heights are written once, and a
       bar that is never composited (a hidden tab, a reduced-motion reader) still
       lands at its real height instead of resting at the empty stub. */
    const stagger = buckets.length > 20 ? 10 : buckets.length > 10 ? 22 : 34;
    buckets.forEach((b, i) => {
      const col = document.createElement('div');
      col.className = 'col' + (b.today ? ' today' : '') + (frozenKeys.has(b.key) ? ' frozen' : '');
      const bar = document.createElement('div');
      bar.className = 'bar' + (b.done ? '' : ' zero') + ' grow';
      const lbl = document.createElement('span');
      lbl.textContent = b.label;
      lbl.dataset.t = b.label;
      const md = document.createElement('i');
      md.className = 'mdot';
      md.style.background = b.mood ? MOODS[Math.round(b.mood) - 1].color : 'transparent';
      col.append(bar, lbl, md);
      col.title = barTitle(b);
      chart.appendChild(col);
      bar.style.height = (b.done ? 20 + (b.done / max) * 80 : 6) + '%';
      bar.style.setProperty('--d', `${Math.min(i * stagger, 360)}ms`);
    });
    fitTicks(chart);
    return;
  }

  chart.querySelectorAll('.col').forEach((col, i) => {
    const b = buckets[i];
    if (!b) return;
    const bar = col.querySelector('.bar');
    const md = col.querySelector('.mdot');
    col.classList.toggle('today', !!b.today);
    col.classList.toggle('frozen', frozenKeys.has(b.key));
    bar.className = 'bar' + (b.done ? '' : ' zero');
    bar.style.height = (b.done ? 20 + (b.done / max) * 80 : 6) + '%';
    md.style.background = b.mood ? MOODS[Math.round(b.mood) - 1].color : 'transparent';
    col.title = barTitle(b);
  });
  /* Every repaint re-fits the row: the window may have been rotated under it. */
  fitTicks(chart);
}

const line = (label, value, hint) =>
  `<div class="stat-line"><span>${label}</span><b>${value}</b>${hint ? `<i>${hint}</i>` : ''}</div>`;

function paintSection(sel, title, html, hint) {
  const el = $(sel);
  if (!el) return;
  const has = !!html;
  el.hidden = !has;
  if (!has) return;
  el.innerHTML = `<div class="stat-sec-head"><strong>${title}</strong>${hint ? `<span>${hint}</span>` : ''}</div>${html}`;
}

/* One ring, driven by the window's completion rate: the same paper card the
   app already used, now answering a question about a chosen range instead of
   about the whole list. */
function paintRing(model, animate) {
  const ring = $('#ringWrap');
  const pct = model.headline.rate;
  if (ring) {
    ring.style.setProperty('--pct', pct === null ? 0 : pct);
    ring.classList.toggle('complete', pct === 100);
  }
  const pv = $('#percentVal');
  if (pv) {
    /* The final number is written first and the count-up then climbs from zero
       over it. A frame loop that never runs — a backgrounded tab — leaves the
       true value on screen rather than a stale one. */
    pv.textContent = pct === null ? '۰' : faNum(pct);
    if (animate && pct !== null) {
      const start = performance.now();
      const tick = now => {
        const t = Math.min((now - start) / 700, 1);
        pv.textContent = faNum(Math.round(pct * (1 - Math.pow(1 - t, 3))));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }
  const st = $('#stats');
  if (st) {
    const done = model.headline.done;
    st.textContent = model.headline.created || done
      ? `${faNum(done)} کار در این ${model.range.sub.replace(' گذشته', '')} انجام شد`
      : 'این بازه هنوز کاری نداشته';
  }
  const dl = $('#statsDelta');
  if (dl) {
    const parts = [deltaText(model.headline.done, model.headline.donePrev, 'کار')];
    if (model.headline.focusMinutes || model.headline.focusMinutesPrev) {
      parts.push(deltaText(model.headline.focusMinutes, model.headline.focusMinutesPrev, 'دقیقه تمرکز'));
    }
    const text = parts.filter(Boolean).join(' · ');
    dl.textContent = text;
    dl.hidden = !text;
  }
}

export function renderStats(force = false) {
  const page = $('#page-stats');
  if (!page) return;
  if (!rangeKey) rangeKey = rangeByKey(loadStatsRange() || DEFAULT_RANGE).key;
  paintRangeButtons();

  const model = computeStats(rangeKey);
  const h = model.headline;

  const sub = $('#statsSub');
  if (sub) sub.textContent = `نگاهی به ${model.range.sub}`;

  /* Signature: a repaint that would write the same numbers is a repaint the
     reader pays for and never sees. */
  const sig = [rangeKey, h.done, h.donePrev, h.rate, h.focusMinutes, h.focusMinutesPrev, h.activeDays, h.streak, model.focus.count, model.reading.marks, model.mood.days, model.timing.dated, historyExpanded].join('|');
  if (!force && sig === lastSig) return;
  const animate = !lastSig;
  lastSig = sig;

  paintRing(model, animate);

  /* ── Headline chips ── */
  const head = $('#statsHead');
  if (head) {
    const chips = [];
    if (h.done || h.created) {
      chips.push({ v: faNum(h.done), l: 'کار انجام‌شده' });
      if (h.rate !== null) chips.push({ v: `${faNum(h.rate)}٪`, l: 'نرخ تکمیل' });
    }
    if (h.focusMinutes) chips.push({ v: faNum(h.focusMinutes), l: 'دقیقه تمرکز' });
    chips.push({ v: faNum(h.activeDays), l: `روز فعال از ${faNum(h.days)}` });
    if (h.streak > 0) chips.push({ v: faNum(h.streak), l: 'روز پیاپی' });
    /* The streak is not one of the window's numbers — it is about today. The code
       above appends it last, and only when there is a run worth showing, so it is
       lifted back out here and handed to the pill beside the chart, label and
       all, instead of being counted as something the range produced. */
    const streakChip = h.streak > 0 ? chips.pop() : null;
    head.innerHTML = chips.map(c => `<div class="stat-chip"><b>${c.v}</b><span>${c.l}</span></div>`).join('');

    const streakWrap = $('#streakChip');
    const streakVal = $('#streakVal');
    if (streakWrap) streakWrap.classList.toggle('hot', !!streakChip);
    if (streakVal) {
      streakVal.textContent = streakChip
        ? `${streakChip.v} ${streakChip.l}${h.streakFreezes ? ` · با ${faNum(h.streakFreezes)} مرخصی` : ''}`
        : 'اولین تیک رو بزن';
    }
  }

  paintChart(model);

  /* ── تمرکز ── */
  const f = model.focus;
  paintSection('#statsFocus', 'تمرکز', f.count ? [
    line('جلسه‌ها', faNum(f.count)),
    line('دقیقه‌ها', faNum(f.minutes)),
    f.avgMin ? line('میانگین هر جلسه', `${faNum(f.avgMin)} دقیقه`) : '',
    f.bestMin ? line('بهترین جلسه', `${faNum(f.bestMin)} دقیقه`) : '',
    f.completed ? line('به کار واقعی رسید', `${faNum(f.completed)} از ${faNum(f.count)}`) : '',
  ].join('') : '', f.count ? `${faNum(f.daysActive)} روز · ${faNum(f.count)} جلسه` : '');

  /* ── دسته‌ها ── */
  paintSection('#statsCats', 'دسته‌ها', model.cats.length ? model.cats.map(c =>
    `<div class="stat-barrow"><span class="stat-barrow-name">${c.label}</span>
      <span class="stat-barrow-track"><i style="width:${c.pct}%;background:${c.color}"></i></span>
      <b>${faNum(c.count)}</b><i class="stat-barrow-pct">${faNum(c.pct)}٪</i></div>`
  ).join('') : '', `${faNum(h.done)} کار دسته‌بندی‌شده`);

  /* ── مطالعه ── */
  const r = model.reading;
  paintSection('#statsRead', 'مطالعه', (r.minutes || r.pages || r.marks) ? [
    r.minutes ? line('دقیقهٔ مطالعه', faNum(r.minutes)) : '',
    r.pages ? line('صفحه‌های خوانده‌شده', faNum(r.pages)) : '',
    r.marks ? line('یادداشت و هایلایت', faNum(r.marks)) : '',
    r.booksOpen ? line('کتاب‌های در جریان', faNum(r.booksOpen)) : '',
  ].join('') : '');

  /* ── حال ── */
  const moodMax = Math.max(...model.mood.dist, 1);
  paintSection('#statsMood', 'حال', model.mood.days ? [
    line('میانگین حال', `${faNum(Math.round(model.mood.avg * 10) / 10)} از ${faNum(MOODS.length)}`, `${faNum(model.mood.days)} روز ثبت شده`),
    `<div class="stat-moods">${MOODS.map((m, i) =>
      `<div class="stat-mood"><span class="mdot" style="background:${m.color}"></span>
        <span class="stat-mood-bar"><i style="height:${Math.round((model.mood.dist[i] / moodMax) * 100)}%;background:${m.color}"></i></span>
        <b>${faNum(model.mood.dist[i])}</b></div>`).join('')}</div>`,
  ].join('') : '');

  /* ── بهترین‌ها و وقت‌شناسی ── */
  const best = [];
  if (model.best.day) best.push(line('پربارترین روز', `${faNum(model.best.day.count)} کار`, model.best.day.label));
  if (model.best.weekday) best.push(line('بهترین روز هفته', model.best.weekday.name, `${faNum(model.best.weekday.count)} کار`));
  if (h.bestStreak > 1) best.push(line('بلندترین زنجیرهٔ این بازه', `${faNum(h.bestStreak)} روز`));
  if (model.timing.dated) {
    best.push(line('سر وقت تمام شد', `${faNum(model.timing.onTimePct)}٪`,
      model.timing.late ? `${faNum(model.timing.late)} کار از موعد گذشته` : 'همه سر وقت'));
  }
  paintSection('#statsBest', 'بهترین‌ها', best.join(''));

  paintHistory(model);

  /* ── Empty window: one honest sentence instead of a wall of zeros ── */
  const empty = $('#statsEmpty');
  const body = $('#statsBody');
  if (empty) empty.hidden = model.hasAny;
  if (body) body.hidden = !model.hasAny;
}

const escapeText = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── سابقهٔ تمرکز ──
   The archive now lives here, under the window the reader is looking through:
   filter the page to three months and the sessions listed are the three months'
   sessions. Each row keeps the record's own truth — what the work was, how long
   the session ran, how it felt, and whether it reached the task — rather than a
   bare duration. */
function paintHistory(model) {
  const wrap = $('#statsHistory');
  const list = $('#statsHistoryList');
  if (!wrap || !list) return;
  const sessions = model.focus.sessions || [];
  wrap.hidden = sessions.length === 0;
  if (!sessions.length) { list.innerHTML = ''; return; }

  const shown = historyExpanded ? sessions : sessions.slice(0, HISTORY_PREVIEW);
  list.innerHTML = shown.map(s => {
    const face = RATING_FACE[s.rating] || '•';
    const title = s.taskTitle ? escapeText(s.taskTitle) : 'بدون کار مشخص';
    const label = RATING_LABEL[s.rating] || '';
    return `<div class="stat-session">
      <span class="stat-session-face" title="${escapeText(label)}" aria-hidden="true">${face}</span>
      <span class="stat-session-title">${title}</span>
      ${s.taskCompleted ? '<span class="stat-session-done" title="به کار واقعی رسید">✓</span>' : ''}
      <span class="stat-session-when">${historyDayLabel(s.startedAt)}</span>
      <span class="stat-session-min">${faNum(s.actualDurationMin)} دقیقه</span>
    </div>`;
  }).join('');

  const count = $('#statsHistoryCount');
  const extra = sessions.length - HISTORY_PREVIEW;
  if (count) count.textContent = `${faNum(sessions.length)} جلسه · ${faNum(model.focus.minutes)} دقیقه`;
  const more = $('#statsHistoryMore');
  if (more) {
    more.hidden = extra <= 0;
    if (extra > 0) more.textContent = historyExpanded ? 'کمتر' : `نمایش ${faNum(extra)} جلسهٔ قدیمی‌تر`;
  }
}

export function initStats() {
  $('#statsHistoryMore')?.addEventListener('click', () => {
    historyExpanded = !historyExpanded;
    renderStats(true);
  });
  /* An empty window keeps the same warm companion the other empty states show. */
  const slot = $('#statsEmpty .insights-empty-char');
  if (slot && !slot.innerHTML) slot.innerHTML = qorqoriMarkup('default');
  subscribe(() => {
    if ($('#page-stats')?.classList.contains('active')) renderStats();
  });
}
