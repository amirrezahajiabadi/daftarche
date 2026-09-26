/* ═══ Achievements — the catalogue and the rules (no DOM) ═══
   Everything the badges mean lives in this one file, and nothing in it touches
   the page, the storage or the clock directly. It is handed a *book* (the day
   ledger plus its totals, built by js/ledger.js) — so the whole ladder from
   «اولین تیک» to «کامل‌کننده» can be reasoned about, and tested, by feeding it
   numbers instead of waiting a year for real ones.

   Three ideas hold the catalogue together:

     · every badge is a **ladder**, not a tick — two to four rungs, from برنز to
       الماس. A reader who has taken one step always has a next step written
       down in front of them, which is the whole difference between a trophy
       shelf and a reason to come back;
     · the rungs are on the things a reader cannot fake — punctuality, minutes
       actually spent, days actually shown up for. Counting raw ticks is how a
       points system turns into a machine for ticking off two-minute chores,
       so volume alone never climbs higher than «ماهر»;
     · nothing ever goes down. A tier reached is a tier kept (see js/ledger.js
       for the floors that make it true), which is what lets the badges be read
       as a record of a life rather than a scoreboard to be lost.

   `kind` is honest about how hard a badge is rather than pretending to know how
   rare it is: the app has one reader and no server, so «افسانه‌ای» says "this
   takes months", and never claims "only 3% of people". */

import { dayKey, shiftKey } from './utils.js';

/* ── Icons ── one 24×24 stroke path per idea, in the same outline language as
   the rest of the interface (fill:none, round caps, currentColor). */
const ICONS = {
  check: '<path d="M20 6L9 17l-5-5"/>',
  star: '<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>',
  flame: '<path d="M12 2c1.2 3-.3 4.9-1.7 6.6C8.9 10.3 8 11.9 8 13.8a4.5 4.5 0 0 0 9 0c0-1.9-.9-3.5-2.3-5.2C13.3 6.9 11.8 5 12 2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>',
  bolt: '<path d="M13 2L4.5 13H11l-1 9 8.5-11H12z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13.5l3.5 2L12 18.5l5.5-3L21 13.5"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>',
  sun: '<circle cx="12" cy="14" r="4"/><path d="M12 4v2M4.5 14h-2M21.5 14h-2M6.2 7.7L4.8 6.3M17.8 7.7l1.4-1.4M3 20h18"/>',
  trophy: '<path d="M8 4h8v4.5a4 4 0 0 1-8 0z"/><path d="M8 5H5.5A2.5 2.5 0 0 0 8 9.5M16 5h2.5A2.5 2.5 0 0 1 16 9.5"/><path d="M10.5 12.5h3v4h-3zM8 19.5h8"/>',
  smile: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none"/><path d="M8.5 14.5c1 1.6 2.1 2.4 3.5 2.4s2.5-.8 3.5-2.4"/>',
  back: '<path d="M9 6l-6 6 6 6"/><path d="M3 12h13a5 5 0 0 1 5 5v1"/>',
  crown: '<path d="M3 18h18l-1.6-9-4.4 4-3-6-3 6-4.4-4z"/><path d="M4.5 21h15"/>',
};

export const iconOf = key => ICONS[key] || ICONS.star;

/* ── Families ── the tabs of the page, in the order a reader makes progress. */
export const FAMILIES = [
  { key: 'start', label: 'شروع' },
  { key: 'streak', label: 'پیوستگی' },
  { key: 'work', label: 'کار' },
  { key: 'focus', label: 'تمرکز' },
  { key: 'read', label: 'مطالعه' },
  { key: 'mood', label: 'حال' },
  { key: 'legend', label: 'افسانه‌ای' },
];

/* The four rungs, always in this order. A badge with two rungs simply stops at
   نقره — the names are positions, not promises. */
export const TIER_NAMES = ['برنز', 'نقره', 'طلا', 'الماس'];

/* How hard a badge is, said out loud and without pretending. Not «شروع» for the
   easiest rung: that is the name of the first family, and a chip that repeats
   the tab it sits under says nothing. */
export const KIND_LABEL = { base: 'پایه', skilled: 'ماهر', legend: 'افسانه‌ای' };

/* ═══ The catalogue ═══
   id      — stable key: it is what gets written down when a tier is reached
   unit    — what is being counted, used by the page to say «۱۲ از ۳۰ کار»
   how     — the sentence a locked badge shows: what would open it
   value   — read from the totals; a pure function of the book, never of time */
export const ACHIEVEMENTS = [
  /* ── شروع: open on the first day, so the shelf is never empty ── */
  { id: 'first-step', family: 'start', kind: 'base', icon: 'check', title: 'نخستین قدم', unit: 'کار',
    how: 'کار تیک بزن', tiers: [1, 10, 100], value: t => t.done },
  { id: 'first-focus', family: 'start', kind: 'base', icon: 'clock', title: 'چراغ روشن', unit: 'نشست',
    how: 'یک نشست تمرکز را تا آخر ببر', tiers: [1, 10, 100], value: t => t.focus.sessions },
  { id: 'first-note', family: 'start', kind: 'base', icon: 'pen', title: 'یادگار', unit: 'یادداشت',
    how: 'یک یادداشت یا هایلایت بساز', tiers: [1, 25, 100, 400], value: t => t.read.notes },
  { id: 'first-book', family: 'start', kind: 'base', icon: 'book', title: 'کتاب‌خوان', unit: 'کتاب',
    how: 'یک کتاب را تمام کن', tiers: [1, 3, 10, 25], value: t => t.read.booksDone },

  /* ── پیوستگی: the days themselves ── */
  { id: 'chain', family: 'streak', kind: 'base', icon: 'flame', title: 'پشت‌سرهم', unit: 'روز',
    how: 'روزهای پیاپی را بلند کن', tiers: [3, 7, 30, 100], value: t => t.bestStreak },
  { id: 'active-days', family: 'streak', kind: 'base', icon: 'calendar', title: 'روزهای فعال', unit: 'روز',
    how: 'روزهایی که دفترچه باز شده', tiers: [7, 30, 100, 365], value: t => t.activeDays },
  { id: 'clean-weeks', family: 'streak', kind: 'skilled', icon: 'grid', title: 'هفتهٔ پاک', unit: 'هفته',
    how: 'هفته‌هایی با ۵ روز فعال یا بیشتر', tiers: [4, 12, 52], value: t => t.consistency.weeksClean },
  { id: 'returned', family: 'streak', kind: 'skilled', icon: 'back', title: 'برگشتم', unit: 'بار',
    how: 'بعد از دو هفته دوری برگرد', tiers: [1, 3, 10], value: t => t.consistency.returns },

  /* ── کار ── */
  { id: 'done', family: 'work', kind: 'base', icon: 'check', title: 'کارِ انجام‌شده', unit: 'کار',
    how: 'کار تیک بزن', tiers: [10, 50, 200, 500], value: t => t.done },
  { id: 'big-day', family: 'work', kind: 'skilled', icon: 'bolt', title: 'روز پرکار', unit: 'روز',
    how: 'روزهایی با ۵ کار یا بیشتر', tiers: [1, 10, 30, 100], value: t => t.task.bigDays },
  { id: 'clear-day', family: 'work', kind: 'skilled', icon: 'layers', title: 'روز بی‌مانده', unit: 'روز',
    how: 'روزی که صف کارها خالی ماند', tiers: [1, 5, 20, 60], value: t => t.task.clearDays },
  { id: 'on-time', family: 'work', kind: 'skilled', icon: 'target', title: 'بموقع', unit: '٪',
    how: 'کارهای تاریخ‌دار را قبل از مهلت بزن (حداقل ۲۰ کار)',
    tiers: [70, 90], value: t => (t.task.dated >= 20 ? t.task.onTimePct || 0 : 0) },
  { id: 'categorized', family: 'work', kind: 'skilled', icon: 'grid', title: 'دسته‌بند', unit: 'دسته',
    how: 'در هر دسته ۵ کار انجام بده', tiers: [3, 6], value: t => t.cats.with5 },

  /* ── تمرکز ── */
  { id: 'focus-minutes', family: 'focus', kind: 'base', icon: 'clock', title: 'کانون', unit: 'دقیقه',
    how: 'دقیقه‌های تمرکز را جمع کن', tiers: [60, 600, 3000, 10000], value: t => t.focus.minutes },
  { id: 'long-session', family: 'focus', kind: 'base', icon: 'target', title: 'نشست بلند', unit: 'دقیقه',
    how: 'یک نشست طولانی‌تر بگذار', tiers: [25, 50, 90, 150], value: t => t.focus.longest },
  { id: 'focus-weeks', family: 'focus', kind: 'skilled', icon: 'calendar', title: 'هفتهٔ متمرکز', unit: 'هفته',
    how: 'هفته‌هایی با ۵ روز تمرکز', tiers: [2, 8, 26], value: t => t.consistency.weeksFocus },
  { id: 'hard-worker', family: 'focus', kind: 'skilled', icon: 'flame', title: 'سخت و ساخته', unit: 'نشست',
    how: 'نشست‌هایی که سخت بودند و تمام شدند', tiers: [10, 25, 60], value: t => t.focus.hard },

  /* ── مطالعه ── */
  { id: 'read-minutes', family: 'read', kind: 'base', icon: 'book', title: 'دقیقهٔ مطالعه', unit: 'دقیقه',
    how: 'مطالعه کن', tiers: [60, 600, 3000, 10000], value: t => t.read.minutes },
  { id: 'pages', family: 'read', kind: 'base', icon: 'layers', title: 'صفحه‌شمار', unit: 'صفحه',
    how: 'صفحه ورق بزن', tiers: [100, 1000, 5000, 20000], value: t => t.read.pages },
  { id: 'shelf', family: 'read', kind: 'skilled', icon: 'book', title: 'قفسه‌ساز', unit: 'کتاب',
    how: 'کتاب‌هایی که به کتابخانه اضافه می‌کنی', tiers: [3, 10, 30], value: t => t.read.books },
  { id: 'finished', family: 'read', kind: 'skilled', icon: 'trophy', title: 'تمامش کردی', unit: 'کتاب',
    how: 'کتاب را تا صفحهٔ آخر بخوان', tiers: [1, 5, 20, 50], value: t => t.read.booksDone },

  /* ── حال ── */
  { id: 'mood-days', family: 'mood', kind: 'base', icon: 'smile', title: 'حالِ ثبت‌شده', unit: 'روز',
    how: 'حال روزت را ثبت کن', tiers: [7, 30, 120, 365], value: t => t.mood.days },
  { id: 'mood-good-days', family: 'mood', kind: 'skilled', icon: 'sun', title: 'روزهای میزان', unit: 'روز',
    how: 'روزهایی با حال خوب', tiers: [20, 100, 365], value: t => t.mood.goodDays },
  { id: 'mood-run', family: 'mood', kind: 'legend', icon: 'star', title: 'زنجیرهٔ خوب', unit: 'روز',
    how: 'روزهای پیاپی با حال خوب', tiers: [7, 30, 100], value: t => t.mood.bestRun },

  /* ── افسانه‌ای: months of something, never a week ── */
  { id: 'early-bird', family: 'legend', kind: 'legend', icon: 'sun', title: 'سحرخیز', unit: 'بار',
    how: 'کار قبل از ۷ صبح تیک بزن', tiers: [5, 20, 60], value: t => t.task.morning },
  { id: 'night-owl', family: 'legend', kind: 'legend', icon: 'moon', title: 'شب‌زنده‌دار', unit: 'بار',
    how: 'بعد از نیمه‌شب تمرکز کن', tiers: [3, 10, 30], value: t => t.focus.dawn },
  { id: 'dragon', family: 'legend', kind: 'legend', icon: 'flame', title: 'اژدها', unit: 'روز',
    how: 'روزی ۳۰۰ دقیقه تمرکز، تمرکز است', tiers: [1, 5, 20], value: t => t.focus.bigDays },
  { id: 'record-breaker', family: 'legend', kind: 'legend', icon: 'crown', title: 'رکوردشکن', unit: 'بار',
    how: 'روزی بساز که از همهٔ روزهای قبلت بهتر باشد', tiers: [3, 10, 25], value: t => t.task.recordDays },
  { id: 'perfect-month', family: 'legend', kind: 'legend', icon: 'calendar', title: 'کامل‌کننده', unit: 'ماه',
    how: 'یک ماه را کامل زندگی کن — هر روزش فعال باشد', tiers: [1, 3, 12], value: t => t.consistency.perfectMonths },
];

export const byId = id => ACHIEVEMENTS.find(a => a.id === id) || null;
export const TOTAL_STEPS = ACHIEVEMENTS.reduce((n, a) => n + a.tiers.length, 0);
export const TOTAL_BADGES = ACHIEVEMENTS.length;

/* ═══ Stored state ═══
   Deliberately tiny: which tier was reached, and on which day. The *value* is
   never stored — it is recomputed from the book every time, so the stored file
   can never disagree with the data behind it.

   baselineAt is the day the shelf was first assembled. Everything already
   earned on that day is written down as unlocked with `at: null` — a badge the
   reader had already won before the shelf existed is not news, and twenty
   celebration sheets on the first launch is how a feature announces that it
   has nothing to say. */
export const emptyState = () => ({ v: 1, baselineAt: null, unlocked: {}, recSeen: {} });

export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return emptyState();
  const unlocked = {};
  const src = raw.unlocked && typeof raw.unlocked === 'object' ? raw.unlocked : {};
  for (const a of ACHIEVEMENTS) {
    const e = src[a.id];
    if (!e || typeof e !== 'object') continue;
    const tier = Math.max(0, Math.min(a.tiers.length, Math.floor(Number(e.tier) || 0)));
    if (!tier) continue;
    unlocked[a.id] = { tier, at: typeof e.at === 'string' ? e.at : null };
  }
  const recSeen = {};
  for (const [k, v] of Object.entries(raw.recSeen && typeof raw.recSeen === 'object' ? raw.recSeen : {})) {
    if (typeof v === 'string') recSeen[k] = v;
  }
  return {
    v: 1,
    baselineAt: typeof raw.baselineAt === 'string' ? raw.baselineAt : null,
    unlocked, recSeen,
  };
}

/* ═══ Score and rank ═══
   The one number that says "you are further along than you were", and the
   table that explains it. Weights are not secret and not arbitrary: minutes
   and punctuality outrank raw volume, which is the only defence a points
   system has against being played. */
export const SCORE_PARTS = [
  { key: 'done', label: 'کار انجام‌شده', weight: 1, of: t => t.done },
  { key: 'focus', label: 'دقیقهٔ تمرکز', weight: 1.5, of: t => t.focus.minutes },
  { key: 'read', label: 'دقیقهٔ مطالعه', weight: 1, of: t => t.read.minutes },
  { key: 'notes', label: 'یادداشت', weight: 3, of: t => t.read.notes },
  { key: 'days', label: 'روز فعال', weight: 5, of: t => t.activeDays },
  { key: 'streak', label: 'بلندترین پیوستگی', weight: 2, of: t => t.bestStreak },
];

export const RANKS = [
  { at: 0, name: 'تازه‌کار' },
  { at: 150, name: 'قدم‌زن' },
  { at: 500, name: 'کوشا' },
  { at: 1200, name: 'منظم' },
  { at: 2500, name: 'کاردان' },
  { at: 5000, name: 'استاد' },
  { at: 10000, name: 'افسانه‌ای' },
];

export const partsOf = t => SCORE_PARTS.map(p => ({ ...p, value: p.of(t), points: Math.round(p.of(t) * p.weight) }));

export const scoreOf = t => partsOf(t).reduce((n, p) => n + p.points, 0);

export function rankOf(score) {
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (score >= RANKS[k].at) i = k;
  const rank = RANKS[i];
  const next = RANKS[i + 1] || null;
  const floor = rank.at;
  const pct = next ? Math.max(0, Math.min(1, (score - floor) / (next.at - floor))) : 1;
  return {
    index: i, name: rank.name, floor, score,
    next: next ? { name: next.name, at: next.at } : null,
    left: next ? next.at - score : 0,
    pct,
  };
}

/* ═══ Records — the reader's own past, as the opponent ═══
   Six numbers that only ever move up, each with the runner-up kept beside it:
   «رکورد قبلی» is what the current number had to beat, and a record that was
   set today is `fresh` — the only case that gets celebrated. */
const zero = { key: null, done: 0, focusMin: 0, readMin: 0, active: 0, focusDays: 0 };

/* The runs of consecutive active (or frozen) days, longest first. */
export function streakRuns(book) {
  const filled = book.days
    .filter(d => d.done > 0 || d.focusMin > 0 || d.opened || d.readMin > 0 || d.freeze)
    .map(d => d.key)
    .sort();
  const runs = [];
  for (const k of filled) {
    const last = runs[runs.length - 1];
    /* A frozen day is a link too — that is the whole point of one. */
    if (last && shiftKey(last.end, 1) === k) { last.length++; last.end = k; }
    else runs.push({ start: k, length: 1, end: k });
  }
  return runs.sort((a, b) => b.length - a.length);
}

export function recordsOf(book) {
  const t = book.totals;
  const maxOf = (list, of, skipKey = null) => list.reduce((best, d) => {
    if (d.key === skipKey) return best;
    const v = of(d);
    return v > best.value ? { value: v, key: d.key } : best;
  }, { value: 0, key: null });

  const cuts = book.score;
  const weeks = book.weeks;
  const bestWeek = weeks.reduce((b, w) => (cuts(w) > b.value ? { value: cuts(w), key: w.key } : b), { value: 0, key: null });
  const prevWeek = maxOf(weeks.map(w => ({ key: w.key, v: cuts(w) })).filter(w => w.key !== bestWeek.key), d => d.v);
  const bestDay = t.best.day;
  const dayPrev = maxOf(book.days, d => d.done, bestDay ? bestDay.key : null);
  const focusPrev = maxOf(book.days, d => d.focusMin, t.best.focusDay ? t.best.focusDay.key : null);
  const months = new Map();
  for (const d of book.days) months.set(d.key.slice(0, 7), (months.get(d.key.slice(0, 7)) || 0) + d.done);
  const monthBest = [...months.entries()].reduce((b, [k, v]) => (v > b.value ? { value: v, key: k } : b), { value: 0, key: null });
  const monthPrev = [...months.entries()].filter(([k]) => k !== monthBest.key)
    .reduce((b, [k, v]) => (v > b.value ? { value: v, key: k } : b), { value: 0, key: null });

  const runs = streakRuns(book);
  const todayMonth = book.today.slice(0, 7);
  const weekKey = book.weekStartKey(book.today);
  const list = [
    { key: 'day', label: 'بهترین روز', icon: 'bolt', unit: 'کار', value: t.best.day ? t.best.day.value : 0, at: t.best.day ? t.best.day.key : null, prev: dayPrev.value, prevAt: dayPrev.key },
    { key: 'week', label: 'بهترین هفته', icon: 'calendar', unit: 'امتیاز', value: bestWeek.value, at: bestWeek.key, prev: prevWeek.value, prevAt: prevWeek.key },
    { key: 'streak', label: 'بلندترین پیوستگی', icon: 'flame', unit: 'روز', value: t.bestStreak, at: runs[0] ? runs[0].end : null, prev: runs[1] ? runs[1].length : 0, prevAt: runs[1] ? runs[1].end : null },
    { key: 'focus-day', label: 'بهترین روز تمرکز', icon: 'clock', unit: 'دقیقه', value: t.best.focusDay ? t.best.focusDay.value : 0, at: t.best.focusDay ? t.best.focusDay.key : null, prev: focusPrev.value, prevAt: focusPrev.key },
    { key: 'session', label: 'بلندترین نشست', icon: 'target', unit: 'دقیقه', value: t.focus.longest, at: t.focus.longestAt ? dayKey(new Date(t.focus.longestAt)) : null, prev: t.focus.second, prevAt: null },
    { key: 'month', label: 'بهترین ماه', icon: 'trophy', unit: 'کار', value: monthBest.value, at: monthBest.key, prev: monthPrev.value, prevAt: monthPrev.key },
  ];

  return list.map(r => ({
    ...r,
    /* Set right now: today's day-record, this week's week-record, the month we
       are inside, a streak still running, a session from today. */
    fresh: !!r.at && (
      r.key === 'week' ? r.at === weekKey
        : r.key === 'month' ? r.at === todayMonth
          : r.key === 'streak' ? book.streak.current === r.value && r.value > 0
            : r.at === book.today
    ),
  }));
}

/* ═══ This week against the last one, and the season's score sheet ═══
   The competitive surface a single-player app can honestly have: a weekly
   head-to-head with the previous week, and a running tally of who has been
   winning. No rivals are invented and no other reader is implied — the opponent
   is the person the reader was last week. */
export function weekBoard(book) {
  const weeks = book.weeks;
  const curKey = book.weekStartKey(book.today);
  const prevKey = shiftKey(curKey, -7);
  const find = k => weeks.find(w => w.key === k) || zero;
  const cur = find(curKey), prev = find(prevKey);
  const lines = [
    { key: 'done', label: 'کار انجام‌شده', a: cur.done, b: prev.done },
    { key: 'focus', label: 'دقیقهٔ تمرکز', a: cur.focusMin, b: prev.focusMin },
    { key: 'read', label: 'دقیقهٔ مطالعه', a: cur.readMin, b: prev.readMin },
    { key: 'active', label: 'روز فعال', a: cur.active, b: prev.active },
  ].map(l => ({ ...l, dir: l.a === l.b ? 0 : l.a > l.b ? 1 : -1 }));

  const scoreA = book.score(cur), scoreB = book.score(prev);
  const outcome = scoreA === scoreB ? 0 : scoreA > scoreB ? 1 : -1;

  /* The season: every week judged against the one before it. Weeks with nothing
     in either side are not matches, so a break is not a run of defeats. */
  let wins = 0, losses = 0, draws = 0, run = 0, bestRun = 0;
  for (let i = 1; i < weeks.length; i++) {
    const a = book.score(weeks[i]), b = book.score(weeks[i - 1]);
    if (!a && !b) continue;
    if (a > b) { wins++; run++; if (run > bestRun) bestRun = run; }
    else if (a < b) { losses++; run = 0; }
    else { draws++; run = 0; }
  }

  return {
    cur, prev, lines, scoreA, scoreB, outcome,
    season: { wins, losses, draws, run, bestRun },
  };
}

/* ═══ The league-shaped hole ═══
   Nothing in the interface claims there are friends to compete with — there is
   no server and no other reader. But the day ledger already carries everything
   a leaderboard row would need, so that future is a `select` away rather than a
   rewrite: one period, one score, the four numbers behind it. A Supabase table
   of exactly these fields (see js/store.js) turns the weekly board above into a
   real one without changing a single number in this file. */
export function leagueSnapshot(book, periodKey = null) {
  const period = periodKey || book.weekStartKey(book.today);
  const w = book.weeks.find(x => x.key === period) || zero;
  return {
    period,
    score: book.score(w),
    done: w.done,
    focusMin: w.focusMin,
    readMin: w.readMin,
    activeDays: w.active,
    bestStreak: book.totals.bestStreak,
  };
}

/* ═══ Evaluation ═══
   One pass over the catalogue against one book. Returns everything the page
   needs and nothing it has to work out for itself:

     rows     — every badge, with the tier reached and the distance to the next
     earned   — badges opened, out of the total
     steps    — rungs climbed, out of every rung that exists
     newly    — tiers reached since the last time this ran (empty on the very
                first run: that is the baseline, not an achievement)
     records  — the six records, each knowing whether it was just broken */
export function evaluate(book, state) {
  const t = book.totals;

  const rows = ACHIEVEMENTS.map(a => {
    const value = Math.max(0, Number(a.value(t)) || 0);
    let reached = 0;
    for (const th of a.tiers) if (value >= th) reached++;
    const stored = state.unlocked[a.id];
    const tier = Math.max(reached, stored ? stored.tier : 0);   // never goes down
    const nextGoal = tier < a.tiers.length ? a.tiers[tier] : null;
    const floor = tier > 0 ? a.tiers[tier - 1] : 0;
    const span = nextGoal === null ? 1 : Math.max(1, nextGoal - floor);
    const pct = nextGoal === null ? 1 : Math.max(0, Math.min(1, (value - floor) / span));
    return {
      a, value, tier,
      nextGoal,
      left: nextGoal === null ? 0 : Math.max(0, nextGoal - value),
      pct,
      at: stored ? stored.at : null,
      raised: reached > (stored ? stored.tier : 0),
      open: tier > 0,
      complete: nextGoal === null,
    };
  });

  const earned = rows.filter(r => r.open).length;
  const steps = rows.reduce((n, r) => n + r.tier, 0);
  const score = scoreOf(t);

  return {
    rows, earned, steps,
    total: ACHIEVEMENTS.length,
    totalSteps: TOTAL_STEPS,
    score, rank: rankOf(score), parts: partsOf(t),
    /* On the baseline run nothing is "new" — every badge that was already
       earned is written down as old, silently. */
    newly: state.baselineAt ? rows.filter(r => r.raised) : [],
    records: recordsOf(book),
  };
}

/* Badges closest to their next rung, for the summary card and the page's own
   rail. Only the ones with something left are interesting, and a badge already
   complete cannot be closer to anything. */
export function nearest(rows, n = 3) {
  return rows
    .filter(r => !r.complete && r.nextGoal !== null)
    .sort((a, b) => (b.pct - a.pct) || (a.left - b.left))
    .slice(0, n);
}
