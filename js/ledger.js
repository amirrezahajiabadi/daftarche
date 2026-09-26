/* ═══ Ledger — the day book ═══
   One small record per day, and the only place in the app that answers "what
   happened on the 12th of Mehr". Everything the achievements, the records and
   the weekly scoreboard need is read from here, instead of being re-derived
   from the live stores every time — because two of those stores are not
   reliable as history:

     · the focus archive is capped at 100 sessions (js/focushistory.js), so a
       reader with a year behind them has already lost the oldest minutes;
     · a task can be deleted, and a deleted task takes its tick out of every
       count that was read straight off the list.

   The rule that makes this safe is a single line: **a day keeps the highest
   value it ever showed.** Live data is still preferred whenever it is larger
   (nothing is thrown away), and the ledger is a floor under it — so deleting a
   task or trimming the session archive can never lower a number, and a badge
   can never be earned twice by ticking and un-ticking the same task.

   The ledger is a floor, not a second source of truth: if it is missing,
   corrupt or empty, every number is still computed from the live records. It
   only ever adds back what was lost.

   What is deliberately NOT stored here: reading minutes, pages, notes, moods
   and the days the app was opened. Those live in stores that are neither
   capped nor trimmed (the book itself carries its own per-day stats), so they
   are read straight from the source and the ledger stays small. */

import { state } from './state.js';
import { STORAGE_KEYS, CATS } from './constants.js';
import { loadFreeze } from './store.js';
import { dayKey, shiftKey } from './utils.js';
import { getBooks, bookComplete } from './library.js';
import { getHistory } from './focushistory.js';
import { dateToJalali } from './jalali.js';

export const LEDGER_VERSION = 1;

/* ── Freezes («مرخصی») ──
   The one mechanism that makes a streak a thing worth protecting: one missed
   day does not end it. The numbers follow the research rather than taste —
   apps that let a streak be repaired hold it roughly half again as long — and
   they are deliberately stingy, because a freeze that is always available is
   just a streak that cannot be lost. */
export const FREEZE_LIMIT = 2;       // at most this many are kept at once
export const FREEZE_EARN_EVERY = 30; // one is earned per this many active days

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isKey = k => typeof k === 'string' && DAY_RE.test(k);
const pos = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

/* ── Day arithmetic on keys (DST-proof: stepped by calendar, never by ms) ── */

const keyToDate = key => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};



const daysApart = (a, b) => Math.round((keyToDate(b) - keyToDate(a)) / 864e5);

/* ── Storage ──
   Anything unreadable falls back to an empty book rather than throwing: a
   ledger that cannot be parsed must cost the reader nothing but the floors. */

export function readLedger() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.ledger)); } catch { /* unreadable */ }
  if (!raw || typeof raw !== 'object' || raw.v !== LEDGER_VERSION || !raw.days || typeof raw.days !== 'object') {
    return { v: LEDGER_VERSION, seededAt: null, days: {} };
  }
  const days = {};
  for (const [k, v] of Object.entries(raw.days)) {
    if (!isKey(k) || !v || typeof v !== 'object') continue;
    days[k] = {
      done: pos(v.done), focusMin: pos(v.focusMin), sessions: pos(v.sessions),
    };
  }
  return {
    v: LEDGER_VERSION,
    seededAt: isKey(raw.seededAt) ? raw.seededAt : null,
    days,
  };
}

function writeLedger(led) {
  try { localStorage.setItem(STORAGE_KEYS.ledger, JSON.stringify(led)); } catch { /* storage full/unavailable */ }
}

/* ── Writing a floor ──
   `bumpDay(key, { done: 1 })` raises that field if the new value is higher and
   leaves it alone otherwise. There is no way to lower a floor through this
   function, which is the whole point of it. */
export function bumpDay(key, patch) {
  if (!isKey(key) || !patch) return;
  const led = readLedger();
  const day = led.days[key] || { done: 0, focusMin: 0, sessions: 0 };
  let changed = false;
  for (const [k, v] of Object.entries(patch)) {
    const n = pos(v);
    if (n > (day[k] || 0)) { day[k] = n; changed = true; }
  }
  if (!changed) return;
  led.days[key] = day;
  writeLedger(led);
}

/* ── Remembering, from the two places a number can be lost ──
   Both of these read the live count *after* the change and raise the floor.
   Reading the live count instead of adding one is what keeps a task that is
   ticked, un-ticked and ticked again from counting three times: the live count
   never goes above the number of tasks that are done today, and the floor can
   never go below the highest it has seen. */
export function rememberDone(now = new Date()) {
  const key = dayKey(now);
  let n = 0;
  for (const t of Array.isArray(state.tasks) ? state.tasks : []) {
    if (!t || !t.done) continue;
    const ts = Number(t.doneAt);
    if (Number.isFinite(ts) && ts > 0 && dayKey(new Date(ts)) === key) n++;
  }
  bumpDay(key, { done: n });
}

export function rememberFocus(now = new Date()) {
  const key = dayKey(now);
  let minutes = 0, sessions = 0;
  for (const s of getHistory()) {
    if (dayKey(new Date(Number(s.startedAt) || Date.now())) !== key) continue;
    minutes += pos(s.actualDurationMin);
    sessions++;
  }
  bumpDay(key, { focusMin: minutes, sessions });
}

/* ── The canonical streak, as today's numbers ──
   One definition, asked for by name: the stats page, the achievements page and
   anything else that prints a streak all come through here. */
export function streakToday(now = new Date()) {
  return collectTotals(now).streak;
}

/* ── Collection: what the app knows about every day ──
   One pass over the six live sources, then the floors are lifted in. The result
   is day-aligned and sorted ascending, so every consumer (streak, records,
   weekly board) walks the same array. */

const emptyDay = key => ({
  key, done: 0, dated: 0, onTime: 0, focusMin: 0, sessions: 0,
  readMin: 0, pages: 0, notes: 0, mood: 0, opened: 0, freeze: false,
});

export function collectTotals(now = new Date()) {
  const today = dayKey(now);
  const days = new Map();
  const day = key => {
    if (!isKey(key)) return null;
    if (!days.has(key)) days.set(key, emptyDay(key));
    return days.get(key);
  };

  /* · tasks — ticks, and the punctuality of the ticks that had a deadline */
  const tasks = (Array.isArray(state.tasks) ? state.tasks : []).filter(t => t && typeof t === 'object');
  const catsDone = new Map();
  for (const t of tasks) {
    if (!t.done) continue;
    const cat = typeof t.cat === 'string' && t.cat ? t.cat : 'misc';
    catsDone.set(cat, (catsDone.get(cat) || 0) + 1);
    const ts = Number(t.doneAt);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    const d = day(dayKey(new Date(ts)));
    if (!d) continue;
    d.done++;
    if (isKey(t.dueDate)) {
      d.dated++;
      if (dayKey(new Date(ts)) <= t.dueDate) d.onTime++;
    }
  }

  /* · opened days — every day the app was used (its own store, never trimmed) */
  for (const k of Array.isArray(state.history) ? state.history : []) {
    const d = isKey(k) ? day(k) : null;
    if (d) d.opened = 1;
  }

  /* · moods — the mood of a day can be changed but never removed */
  for (const [k, v] of Object.entries(state.moods && typeof state.moods === 'object' ? state.moods : {})) {
    const d = isKey(k) ? day(k) : null;
    const n = Number(v);
    if (d && Number.isInteger(n) && n >= 1 && n <= 5) d.mood = n;
  }

  /* · reading — each book carries its own per-day pages and minutes */
  const books = getBooks();
  let readMinutes = 0, pages = 0, notes = 0, booksDone = 0;
  for (const b of books) {
    if (bookComplete(b)) booksDone++;
    notes += (Array.isArray(b.highlights) ? b.highlights.length : 0)
      + (Array.isArray(b.notes) ? b.notes.length : 0);
    for (const [k, s] of Object.entries(b.stats && typeof b.stats === 'object' ? b.stats : {})) {
      if (!s || typeof s !== 'object') continue;
      const m = pos(s.minutes), p = pos(s.pages);
      readMinutes += m; pages += p;
      const d = isKey(k) ? day(k) : null;
      if (d) { d.readMin += m; d.pages += p; }
    }
  }

  /* · focus — the archive is capped, so these two are the reason the ledger exists */
  const history = getHistory();
  let focusMinutes = 0, longest = 0, longestAt = null, second = 0, hard = 0, dawn = 0;
  for (const s of history) {
    const min = pos(s.actualDurationMin);
    focusMinutes += min;
    if (min > longest) {
      second = longest; longest = min;
      longestAt = Number.isFinite(Number(s.startedAt)) && Number(s.startedAt) > 0 ? Number(s.startedAt) : null;
    } else if (min > second) second = min;
    if (s.rating === 'hard' && s.taskCompleted) hard++;
    const started = new Date(pos(s.startedAt));
    if (started.getHours() < 4) dawn++;
    const d = day(dayKey(started));
    if (!d) continue;
    d.sessions++;
    d.focusMin += min;
  }

  /* ── Floors ──
     live-first: whichever of the two is larger wins, so nothing is lost and
     nothing is counted twice. */
  const led = readLedger();
  for (const [k, v] of Object.entries(led.days)) {
    const d = day(k);
    if (!d) continue;
    d.done = Math.max(d.done, v.done);
    d.sessions = Math.max(d.sessions, v.sessions);
    d.focusMin = Math.max(d.focusMin, v.focusMin);
  }

  /* ── Derived, day by day ──
     A day is *active* when anything at all happened on it — a tick, a focus
     session, a page read, or simply the app being opened. That is the same
     thing the reader means by «I used it that day», and it is the only
     definition the streak, the records and the weekly board use. */
  const ordered = [...days.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const active = new Set(ordered.filter(d => d.done > 0 || d.focusMin > 0 || d.opened || d.readMin > 0).map(d => d.key));

  /* The all-time tick count is the sum of the days, not the length of the list:
     a day that was worked is a day that was worked, whether or not the task that
     proved it is still in the list a month later. */
  const doneTotal = ordered.reduce((n, d) => n + d.done, 0);

  const streak = streakInfo(active, now, { freeze: loadFreeze() });
  for (const k of streak.frozen) {
    if (days.has(k)) days.get(k).freeze = true;
  }

  let activeDays = 0, openedDays = 0, moodDays = 0, goodMoodDays = 0;
  let bigDays = 0, clearDays = 0, dated = 0, onTime = 0, inboxZero = 0;
  let focusBigDays = 0, recordDays = 0, runningMax = 0;
  let bestDay = null, bestFocusDay = null, bestGoodRun = 0, run = 0;
  const monthTicks = new Map();
  const monthKeyOf = k => k.slice(0, 7);

  for (const d of ordered) {
    if (d.done > 0 || d.focusMin > 0 || d.opened || d.readMin > 0) activeDays++;
    if (d.opened) openedDays++;
    if (d.mood) { moodDays++; if (d.mood >= 4) { goodMoodDays++; run++; if (run > bestGoodRun) bestGoodRun = run; } else run = 0; }
    else run = 0;
    if (d.done >= 5) bigDays++;
    if (d.focusMin >= 300) focusBigDays++;
    /* A record day is one that beat every day before it — the reader's own past
       as the opponent. The first day on the books is not a record. */
    if (d.done > runningMax) { if (runningMax > 0) recordDays++; runningMax = d.done; }
    dated += d.dated; onTime += d.onTime;
    monthTicks.set(monthKeyOf(d.key), (monthTicks.get(monthKeyOf(d.key)) || 0) + d.done);
    if (d.done > 0 && (!bestDay || d.done > bestDay.done)) bestDay = d;
    if (d.focusMin > 0 && (!bestFocusDay || d.focusMin > bestFocusDay.focusMin)) bestFocusDay = d;
  }

  /* A day of an untouched list: three ticks or more and nothing left due on it. */
  const dueLeft = new Map();
  for (const t of tasks) {
    if (t.done || !isKey(t.dueDate)) continue;
    dueLeft.set(t.dueDate, (dueLeft.get(t.dueDate) || 0) + 1);
  }
  for (const d of ordered) {
    if (d.done >= 3 && !dueLeft.get(d.key)) clearDays++;
    if (d.done >= 3 && !dueLeft.get(d.key) && d.dated > 0) inboxZero++;
  }

  /* ── Extras that are not per-day ── */
  let morning = 0;
  for (const t of tasks) {
    const ts = Number(t.doneAt);
    if (!t.done || !Number.isFinite(ts) || ts <= 0) continue;
    if (new Date(ts).getHours() < 7) morning++;
  }
  const catsWith5 = CATS.filter(c => (catsDone.get(c.key) || 0) >= 5).length;

  let bestMonth = null;
  for (const [k, v] of monthTicks) if (!bestMonth || v > bestMonth.value) bestMonth = { key: k, value: v };

  /* Coming back: a gap of two weeks or more that was still followed by a day
     of work. Leaving is easy; this counts the other thing. */
  let returns = 0;
  const activeKeys = [...active].sort();
  for (let i = 1; i < activeKeys.length; i++) {
    if (daysApart(activeKeys[i - 1], activeKeys[i]) >= 14) returns++;
  }

  /* A complete month: every day of a Jalali month, from the day the reader
     walked in to the day it ended, was an active one. A month the reader is
     still inside counts too — it is checked on the same rule, against the days
     that have actually happened. Short fragments are left out (MIN_MONTH), so
     joining in the last week of a month cannot earn it. */
  const MIN_MONTH = 25;
  const monthSeen = new Map(), monthLive = new Map();
  if (ordered.length) {
    const firstKey = ordered[0].key;
    const span = daysApart(firstKey, today) + 1;
    for (let i = 0; i < span; i++) {
      const k = shiftKey(firstKey, i);
      const j = dateToJalali(keyToDate(k));
      const mk = `${j.jy}-${j.jm}`;
      monthSeen.set(mk, (monthSeen.get(mk) || 0) + 1);
      if (active.has(k)) monthLive.set(mk, (monthLive.get(mk) || 0) + 1);
    }
  }
  let perfectMonths = 0;
  for (const [mk, seen] of monthSeen) {
    if (seen >= MIN_MONTH && (monthLive.get(mk) || 0) === seen) perfectMonths++;
  }

  /* ── The weekly board: this week against the one before it, and the season ──
     A week starts on Saturday, which is what the stats page already means by a
     week and what a Persian reader expects to see. */
  const weekStartKey = key => {
    const d = keyToDate(key);
    d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
    return dayKey(d);
  };
  const weeks = [];
  for (const d of ordered) {
    const wk = weekStartKey(d.key);
    let w = weeks.find(x => x.key === wk);
    if (!w) { w = { key: wk, done: 0, focusMin: 0, readMin: 0, active: 0, focusDays: 0 }; weeks.push(w); }
    w.done += d.done; w.focusMin += d.focusMin; w.readMin += d.readMin;
    if (d.focusMin > 0) w.focusDays++;
    if (d.done > 0 || d.focusMin > 0 || d.opened || d.readMin > 0) w.active++;
  }
  weeks.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  /* Weeks that were actually lived in: five active days out of seven, or five
     days with a focus session on them. A week is the unit a reader plans in, so
     it gets its own two badges rather than being inferred from days. */
  let weeksClean = 0, weeksFocus = 0;
  for (const w of weeks) {
    if (w.active >= 5) weeksClean++;
    if (w.focusDays >= 5) weeksFocus++;
  }

  const scoreOf = w => w.done + Math.round(w.focusMin * 1.5) + w.readMin + w.active * 5;

  return {
    now, today,
    days: ordered,
    active, streak, weeks,
    score: scoreOf,
    weekStartKey,
    totals: {
      done: doneTotal,
      activeDays, openedDays, bestStreak: streak.best,
      task: {
        done: doneTotal, dated, onTime,
        onTimePct: dated > 0 ? Math.round((onTime / dated) * 100) : null,
        bigDays, clearDays, morning, inboxZero, recordDays,
      },
      focus: { sessions: history.length, minutes: focusMinutes, longest, longestAt, second, hard, dawn, bigDays: focusBigDays },
      read: { minutes: readMinutes, pages, notes, books: books.length, booksDone },
      mood: { days: moodDays, goodDays: goodMoodDays, bestRun: bestGoodRun },
      cats: { with5: catsWith5, total: CATS.length },
      consistency: { weeksClean, weeksFocus, returns, perfectMonths },
      best: {
        day: bestDay ? { key: bestDay.key, value: bestDay.done } : null,
        focusDay: bestFocusDay ? { key: bestFocusDay.key, value: bestFocusDay.focusMin } : null,
        month: bestMonth,
      },
    },
  };
}

/* ═══ Streak — with a freeze, and only where one is deserved ═══
   The rule, in order:
     · a day is a link in the chain when something was done on it;
     · a single missed day between two links can be repaired, but only while
       there is a freeze in hand: one is earned per FREEZE_EARN_EVERY active
       days and at most FREEZE_LIMIT are kept, so a long streak has spares and
       a new one has none;
     · a day in progress is never a missed day — today not being finished yet
       cannot break anything, and cannot be repaired either.

   Everything here is derived from the day set, never written down: the same
   history always yields the same freezes, and a reader who clears their data
   does not leave an empty freeze behind. */
export function streakInfo(activeKeys, now = new Date(), { freeze = true } = {}) {
  const set = activeKeys instanceof Set ? activeKeys : new Set(activeKeys || []);
  const today = dayKey(now);
  const keys = [...set].filter(isKey).sort();
  const frozen = new Set();
  let earned = 0, used = 0, current = 0, best = 0;

  if (!keys.length) return { current: 0, best: 0, frozen, earned: 0, used: 0, available: 0, length: 0 };

  /* A closed calendar: from the first active day to today, every day either
     active, frozen, or empty. */
  const first = keys[0];
  const length = daysApart(first, today) + 1;
  const on = new Set(keys);

  /* Earned from the whole history, not from however much had happened by the
     time of a gap: thirty active days earn one freeze, and at most FREEZE_LIMIT
     are ever in hand. */
  earned = Math.min(FREEZE_LIMIT, Math.floor(on.size / FREEZE_EARN_EVERY));

  const filled = new Set(on);
  if (freeze && earned > 0) {
    /* Repaired newest first: the streak a reader is standing on right now is the
       one worth protecting, not the one they had in Ordibehesht. Only a single
       missed day with a link on both sides can be repaired, and never today —
       a day still being lived is not a missed day. */
    for (let i = length - 2; i >= 1 && used < earned; i--) {
      const k = shiftKey(first, i);
      if (on.has(k) || frozen.has(k)) continue;
      const prev = shiftKey(first, i - 1);
      const next = shiftKey(first, i + 1);
      if (!(on.has(prev) || frozen.has(prev))) continue;
      if (!(on.has(next) || frozen.has(next))) continue;
      frozen.add(k); filled.add(k); used++;
    }
  }

  /* Current: back from today (or yesterday, if today has nothing yet). */
  let d = on.has(today) || frozen.has(today) ? today : shiftKey(today, -1);
  while (filled.has(d)) { current++; d = shiftKey(d, -1); }

  /* Best: the longest unbroken run anywhere in the calendar. */
  let run = 0;
  for (let i = 0; i < length; i++) {
    if (filled.has(shiftKey(first, i))) { run++; if (run > best) best = run; } else run = 0;
  }

  return {
    current, best, frozen,
    earned,
    used,
    available: Math.max(0, earned - used),
    length,
  };
}
