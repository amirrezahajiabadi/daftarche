/* ═══ Achievements — the catalogue and the rules (no DOM) ═══
   Everything the badges mean lives in this one file, and nothing in it touches
   the page, the storage or the clock directly. It is handed a *book* (the day
   ledger plus its totals, built by js/ledger.js) — so the whole ladder from
   «اولین تیک» to «کامل‌کننده» can be reasoned about, and tested, by feeding it
   numbers instead of waiting a year for real ones.

   Three ideas hold the catalogue together:

     · every badge is a **ladder**, not a tick — one to four rungs, from برنز to
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
   the rest of the interface (fill:none, round caps, currentColor).

   Every badge has its own. They used to share seventeen, which meant the shelf
   was not a set of pictures but a set of repeated words — five badges wore the
   same tick, three the same book, and a reader scanning the page could not tell
   «روزِ کار» from «روزِ شلوغ» by shape at all. One icon per badge is what makes
   the grid readable before the text is.

   Drawn to the same rules as the characters in assets/characters: the meaning
   comes from shape alone, so there is no fill, no gradient and no glow here —
   a badge that only reads in one theme's accent is a badge that disappears in
   the other seven.

   The last five are the records row (js/achievements.js recordsOf), which has
   its own vocabulary — a day, a week, a streak, a session — and reuses the
   original shapes on purpose. */
const ICONS = {
  /* ── شروع: the first of something ── */
  foot:     '<path d="M9 20.5c-1.9 0-3-1.4-2.6-3.6.4-2.2 2.4-4 4.4-4s3.4 1.4 3 3.6c-.4 2.2-2.4 4-4.8 4z"/><circle cx="9" cy="7.5" r="1.6"/><circle cx="13" cy="5.5" r="1.5"/><circle cx="17" cy="7" r="1.5"/>',
  lamp:     '<path d="M9 3.5h6M12 3.5v3"/><path d="M7.5 18.5h9l-1.2-6.2a3.8 3.8 0 0 0-1.5-2.5h-3.6a3.8 3.8 0 0 0-1.5 2.5z"/><path d="M9.5 21h5"/>',
  slip:     '<path d="M5.5 3.5h13v17l-6.5-3-6.5 3z"/><path d="M9 8.5h6M9 12h4"/>',
  spine:    '<path d="M6 3.5h12a1 1 0 0 1 1 1v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M4 17.5h15"/><path d="M8.5 3.5v14"/>',
  compass:  '<circle cx="12" cy="12" r="8.5"/><path d="m14.5 9.5-2 5-3 2 2-5z"/>',

  /* ── پیوستگی: the days themselves ── */
  flame:    '<path d="M12 2c1.2 3-.3 4.9-1.7 6.6C8.9 10.3 8 11.9 8 13.8a4.5 4.5 0 0 0 9 0c0-1.9-.9-3.5-2.3-5.2C13.3 6.9 11.8 5 12 2z"/>',
  sprout:   '<path d="M12 21v-8"/><path d="M12 13c0-3.3-2.7-6-6-6 0 3.3 2.7 6 6 6z"/><path d="M12 15c0-2.8 2.2-5 5-5 0 2.8-2.2 5-5 5z"/>',
  wipe:     '<rect x="3.5" y="4.5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4"/><rect x="6" y="12" width="2.4" height="2.4" rx=".6"/><rect x="10.3" y="12" width="2.4" height="2.4" rx=".6"/><rect x="14.6" y="12" width="2.4" height="2.4" rx=".6"/><rect x="6" y="16" width="2.4" height="2.4" rx=".6"/><rect x="10.3" y="16" width="2.4" height="2.4" rx=".6"/>',
  return:   '<path d="M3.5 12a8.5 8.5 0 1 1 2.6 6.1"/><path d="M3 6v6h6"/>',

  /* ── کار ── */
  strike:   '<path d="M4 7h9M4 12h16M4 17h11"/><path d="M16.5 15.5l2 2 3.5-3.5"/>',
  piled:    '<path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z"/><path d="M3.5 12l8.5 4.5 8.5-4.5"/><path d="M3.5 16l8.5 4.5 8.5-4.5"/>',
  bare:     '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M8.5 8.5h7"/>',
  stamp:    '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.5l3.5 2"/><path d="M12 3.5V2M20.5 12H19"/>',
  tray:     '<path d="M3.5 6.5h17v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 10.5h17"/><path d="M9.5 14.5h5"/>',

  /* ── تمرکز ── */
  beam:     '<path d="M12 2.5v4.5"/><circle cx="12" cy="12" r="4"/><path d="M4 20.5h16"/><path d="M8.5 21.5a5 5 0 0 1 0-7M15.5 21.5a5 5 0 0 0 0-7"/>',
  longhand: '<circle cx="12" cy="13" r="8"/><path d="M12 13V7.5"/><path d="M12 5.5V3M9 3h6"/>',
  five:     '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4"/><path d="M7.5 13h2M11.5 13h2M15.5 13h1M7.5 16.5h2M11.5 16.5h2M15.5 16.5h1"/>',
  anvil:    '<path d="M14 3.5l-6.5 8h4.5l-1.5 3.5h6l-1.5-3.5h4.5z"/><path d="M4 20.5h16"/>',

  /* ── مطالعه ── */
  reading:  '<path d="M12 6.5C10.6 5 8.6 4.5 6.5 4.5H4v13h2.5c2.1 0 4.1.5 5.5 1.5 1.4-1 3.4-1.5 5.5-1.5H20v-13h-2.5c-2.1 0-4.1.5-5.5 2z"/><path d="M12 6.5v12.5"/>',
  flip:     '<path d="M4 5.5a2 2 0 0 1 2-2h7l3 3v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M13 3.5v3h3"/><path d="M8 19.5c3 0 4.5-1.2 4.5-3.5-1.7 0-4.5.5-4.5 3.5z"/>',
  shelf:    '<path d="M3.5 4h17"/><path d="M3.5 20h17"/><path d="M3.5 4v16"/><path d="M6 17V7.5h2.5V17M10 17V5h2.5v12M14 17v-8h2.5v8M18 17V9.5H20"/>',
  volume:   '<path d="M4.5 6.5h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11z"/><path d="M17.5 9.5l3-2.5v11l-3-2.5"/><path d="M8 3.5h5"/>',

  /* ── حال ── */
  noted:    '<circle cx="12" cy="12" r="8.5"/><circle cx="9.5" cy="10.5" r="1"/><circle cx="14.5" cy="10.5" r="1"/><path d="M9 14.5c1.2 1.2 2 1.7 3 1.7s1.8-.5 3-1.7"/><path d="M12 3.5v-2M20.5 12h2"/>',
  sun:      '<circle cx="12" cy="13" r="4"/><path d="M12 4v2M4.5 13h-2M21.5 13h-2M6.2 6.7L4.8 5.3M17.8 6.7l1.4-1.4M3 20h18"/>',
  chainup:  '<path d="M4 17.5l4.5-5 3.5 3 7-8"/><path d="M15.5 7.5h3.5V4"/>',

  /* ── افسانه‌ای: months of something ── */
  dawn:     '<path d="M4 18h16"/><path d="M7.5 18a4.5 4.5 0 0 1 9 0"/><path d="M12 5V3M5.5 8L4 6.5M18.5 8L20 6.5"/><path d="M9.5 21h5"/>',
  moon:     '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/><path d="M17 4l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  dragon:   '<path d="M12 2.5c1.5 3.5-.5 5.5-2 7.5C8.5 11.7 7.5 13.5 7.5 15.5a5 5 0 0 0 10 0c0-2-.9-3.8-2.5-5.7C13.5 7.7 11.5 5.5 12 2.5z"/><path d="M10 17.5c.5 1 1.2 1.5 2 1.5s1.5-.5 2-1.5"/>',
  flag:     '<path d="M5.5 21V3.5"/><path d="M5.5 4.5h13l-2.5 4 2.5 4h-13"/>',
  full:     '<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4"/><path d="M7.5 13h2M11.5 13h2M15 13h2M7.5 16.5h2M11.5 16.5h2M15 16.5h2"/>',

  /* ── رکوردها: the records row's own vocabulary ── */
  check:    '<path d="M20 6L9 17l-5-5"/>',
  star:     '<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>',
  clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  book:     '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  pen:      '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  grid:     '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  target:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>',
  bolt:     '<path d="M13 2L4.5 13H11l-1 9 8.5-11H12z"/>',
  layers:   '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13.5l3.5 2L12 18.5l5.5-3L21 13.5"/>',
  trophy:   '<path d="M8 4h8v4.5a4 4 0 0 1-8 0z"/><path d="M8 5H5.5A2.5 2.5 0 0 0 8 9.5M16 5h2.5A2.5 2.5 0 0 1 16 9.5"/><path d="M10.5 12.5h3v4h-3zM8 19.5h8"/>',
  smile:    '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none"/><path d="M8.5 14.5c1 1.6 2.1 2.4 3.5 2.4s2.5-.8 3.5-2.4"/>',
  back:     '<path d="M9 6l-6 6 6 6"/><path d="M3 12h13a5 5 0 0 1 5 5v1"/>',
  crown:    '<path d="M3 18h18l-1.6-9-4.4 4-3-6-3 6-4.4-4z"/><path d="M4.5 21h15"/>',
};

/* The wrapper the paths above are written for. Every one of them is bare markup
   — a <path>, a <circle>, or a few together — and a bare <path> dropped straight
   into the page is not a picture: HTML has no drawing context for it, the
   browser parses it as unknown inline content and nothing is painted. So the
   paths stay unwrapped in the table (that is what makes them readable and
   editable as one line each) and the frame is added here, once, on the way out.

   It is the same wrapper `ICONS` in js/constants.js uses, and the same one the
   stylesheet already targets: css/achievements.css sizes `.achv-medal svg`,
   `.achv-detail-medal svg` and `.achv-unlock-medal svg` and paints them with
   stroke/fill/stroke-width on this element. Nothing there needed changing —
   the drawing attributes live on the <svg>, so every badge picks up the theme's
   colour through `currentColor` and inherits the earned/locked treatment from
   its own medal disc. */
const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
const SVG_CLOSE = '</svg>';

/* Wrapped once, at module load, rather than on every call: the catalogue is
   fixed, so the same eighteen strings are built eighteen times either way and
   the table below becomes the only place a raw path is allowed to exist. */
const WRAPPED = Object.fromEntries(
  Object.entries(ICONS).map(([k, body]) => [k, SVG_OPEN + body + SVG_CLOSE])
);

export const iconOf = key => WRAPPED[key] || WRAPPED.star;

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
  { id: 'first-step', family: 'start', kind: 'base', icon: 'foot', title: 'نخستین قدم', unit: 'کار',
    how: 'کار تیک بزن', tiers: [1, 10, 100], value: t => t.done },
  { id: 'first-focus', family: 'start', kind: 'base', icon: 'lamp', title: 'چراغ روشن', unit: 'نشست',
    how: 'یک نشست تمرکز را تا آخر ببر', tiers: [1, 10, 100], value: t => t.focus.sessions },
  { id: 'first-note', family: 'start', kind: 'base', icon: 'slip', title: 'یادگار', unit: 'یادداشت',
    how: 'یک یادداشت یا هایلایت بساز', tiers: [1, 25, 100, 400], value: t => t.read.notes },
  { id: 'first-book', family: 'start', kind: 'base', icon: 'spine', title: 'کتابِ تمام‌شده', unit: 'کتاب',
    how: 'یک کتاب را تمام کن', tiers: [1, 3, 10, 25], value: t => t.read.booksDone },
  { id: 'tour-intro', family: 'start', kind: 'base', icon: 'compass', title: 'آشنایی با دفترچه', unit: 'بار',
    how: 'تور راهنمای دفترچه را تمام کن', tiers: [1], value: t => t.tourDone,
    rewards: ['theme:lilac'] },

  /* ── پیوستگی: the days themselves ── */
  { id: 'chain', family: 'streak', kind: 'base', icon: 'flame', title: 'پشت‌سرهم', unit: 'روز',
    how: 'روزهای پیاپی را بلند کن', tiers: [3, 7, 30, 100], value: t => t.bestStreak },
  { id: 'active-days', family: 'streak', kind: 'base', icon: 'sprout', title: 'روزِ کار', unit: 'روز',
    how: 'روزهایی که دفترچه باز شده', tiers: [7, 30, 100, 365], value: t => t.activeDays },
  { id: 'clean-weeks', family: 'streak', kind: 'skilled', icon: 'wipe', title: 'هفتهٔ منظم', unit: 'هفته',
    how: 'هفته‌هایی با ۵ روز فعال یا بیشتر', tiers: [4, 12, 52], value: t => t.consistency.weeksClean },
  { id: 'returned', family: 'streak', kind: 'skilled', icon: 'return', title: 'برگشتم', unit: 'بار',
    how: 'بعد از دو هفته دوری برگرد', tiers: [1, 3, 10], value: t => t.consistency.returns },

  /* ── کار ── */
  { id: 'done', family: 'work', kind: 'base', icon: 'strike', title: 'کارهای انجام‌شده', unit: 'کار',
    how: 'کار تیک بزن', tiers: [10, 50, 200, 500], value: t => t.done },
  { id: 'big-day', family: 'work', kind: 'skilled', icon: 'piled', title: 'روزِ شلوغ', unit: 'روز',
    how: 'روزهایی با ۵ کار یا بیشتر', tiers: [1, 10, 30, 100], value: t => t.task.bigDays },
  { id: 'clear-day', family: 'work', kind: 'skilled', icon: 'bare', title: 'روز بی‌مانده', unit: 'روز',
    how: 'روزی که صف کارها خالی ماند', tiers: [1, 5, 20, 60], value: t => t.task.clearDays },
  { id: 'on-time', family: 'work', kind: 'skilled', icon: 'stamp', title: 'بموقع', unit: '٪',
    how: 'کارهای تاریخ‌دار را قبل از مهلت بزن (حداقل ۲۰ کار)',
    tiers: [70, 90], value: t => (t.task.dated >= 20 ? t.task.onTimePct || 0 : 0) },
  { id: 'categorized', family: 'work', kind: 'skilled', icon: 'tray', title: 'دسته‌بندی‌شده', unit: 'دسته',
    how: 'در هر دسته ۵ کار انجام بده', tiers: [3, 6], value: t => t.cats.with5 },

  /* ── تمرکز ── */
  { id: 'focus-minutes', family: 'focus', kind: 'base', icon: 'beam', title: 'کانون', unit: 'دقیقه',
    how: 'دقیقه‌های تمرکز را جمع کن', tiers: [60, 600, 3000, 10000], value: t => t.focus.minutes },
  { id: 'long-session', family: 'focus', kind: 'base', icon: 'longhand', title: 'جلسهٔ بلند', unit: 'دقیقه',
    how: 'یک نشست طولانی‌تر بگذار', tiers: [25, 50, 90, 150], value: t => t.focus.longest },
  { id: 'focus-weeks', family: 'focus', kind: 'skilled', icon: 'five', title: 'هفتهٔ تمرکز', unit: 'هفته',
    how: 'هفته‌هایی با ۵ روز تمرکز', tiers: [2, 8, 26], value: t => t.consistency.weeksFocus },
  { id: 'hard-worker', family: 'focus', kind: 'skilled', icon: 'anvil', title: 'سخت و ساخته', unit: 'نشست',
    how: 'نشست‌هایی که سخت بودند و تمام شدند', tiers: [10, 25, 60], value: t => t.focus.hard },

  /* ── مطالعه ── */
  { id: 'read-minutes', family: 'read', kind: 'base', icon: 'reading', title: 'دقیقهٔ خواندن', unit: 'دقیقه',
    how: 'مطالعه کن', tiers: [60, 600, 3000, 10000], value: t => t.read.minutes },
  { id: 'pages', family: 'read', kind: 'base', icon: 'flip', title: 'صفحه‌خوان', unit: 'صفحه',
    how: 'صفحه ورق بزن', tiers: [100, 1000, 5000, 20000], value: t => t.read.pages },
  { id: 'shelf', family: 'read', kind: 'skilled', icon: 'shelf', title: 'قفسه‌ساز', unit: 'کتاب',
    how: 'کتاب‌هایی که به کتابخانه اضافه می‌کنی', tiers: [3, 10, 30], value: t => t.read.books },
  { id: 'finished', family: 'read', kind: 'skilled', icon: 'volume', title: 'کتابِ بسته', unit: 'کتاب',
    how: 'کتاب را تا صفحهٔ آخر بخوان', tiers: [1, 5, 20, 50], value: t => t.read.booksDone },

  /* ── حال ── */
  { id: 'mood-days', family: 'mood', kind: 'base', icon: 'noted', title: 'حالِ ثبت‌شده', unit: 'روز',
    how: 'حال روزت را ثبت کن', tiers: [7, 30, 120, 365], value: t => t.mood.days },
  { id: 'mood-good-days', family: 'mood', kind: 'skilled', icon: 'sun', title: 'روزهای خوب', unit: 'روز',
    how: 'روزهایی با حال خوب', tiers: [20, 100, 365], value: t => t.mood.goodDays },
  { id: 'mood-run', family: 'mood', kind: 'legend', icon: 'chainup', title: 'زنجیرهٔ خوب', unit: 'روز',
    how: 'روزهای پیاپی با حال خوب', tiers: [7, 30, 100], value: t => t.mood.bestRun },

  /* ── افسانه‌ای: months of something, never a week ── */
  { id: 'early-bird', family: 'legend', kind: 'legend', icon: 'dawn', title: 'سحرخیز', unit: 'بار',
    how: 'کار قبل از ۷ صبح تیک بزن', tiers: [5, 20, 60], value: t => t.task.morning },
  { id: 'night-owl', family: 'legend', kind: 'legend', icon: 'moon', title: 'شب‌زنده‌دار', unit: 'بار',
    how: 'بعد از نیمه‌شب تمرکز کن', tiers: [3, 10, 30], value: t => t.focus.dawn },
  { id: 'dragon', family: 'legend', kind: 'legend', icon: 'dragon', title: 'اژدها', unit: 'روز',
    how: 'روزی ۳۰۰ دقیقه تمرکز، تمرکز است', tiers: [1, 5, 20], value: t => t.focus.bigDays },
  { id: 'record-breaker', family: 'legend', kind: 'legend', icon: 'flag', title: 'رکوردشکن', unit: 'بار',
    how: 'روزی بساز که از همهٔ روزهای قبلت بهتر باشد', tiers: [3, 10, 25], value: t => t.task.recordDays },
  { id: 'perfect-month', family: 'legend', kind: 'legend', icon: 'full', title: 'کامل‌کننده', unit: 'ماه',
    how: 'یک ماه را کامل زندگی کن — هر روزش فعال باشد', tiers: [1, 3, 12], value: t => t.consistency.perfectMonths },
];

/* ═══ Rewards ═══
   An achievement can open one or more things outside the shelf. The catalogue
   stores stable reward ids; this table owns how each reward is described and
   lets future features use the same lock, picker and celebration contract. */
export const REWARDS = Object.freeze({
  'theme:lilac': Object.freeze({
    id: 'theme:lilac', kind: 'theme', key: 'lilac', label: 'یاسی', area: 'settings',
    lockedText: 'هنوز تنونستی "یاسی" رو بدست بیاری!',
    unlockText: 'تم «یاسی» در بخش تنظیمات برات باز شد!',
  }),
});

export const rewardOf = id => REWARDS[id] || null;
/* String ids mean the first rung; { id, tier } can target a future higher rung.
   The same rules work for themes and features without adding separate flags. */
const rewardRules = achievement => (achievement?.rewards || []).map(rule =>
  typeof rule === 'string' ? { id: rule, tier: 1 } : rule);
export const rewardsOf = (achievement, tier = Infinity) => rewardRules(achievement)
  .filter(rule => rule.tier <= tier).map(rule => rewardOf(rule.id)).filter(Boolean);
export const rewardRequirements = rewardId => ACHIEVEMENTS.flatMap(a =>
  rewardRules(a).filter(rule => rule.id === rewardId).map(rule => ({ achievement: a, tier: rule.tier })));
export const hasReward = (state, rewardId) => {
  if (!rewardOf(rewardId) || !state?.unlocked) return false;
  return rewardRequirements(rewardId).some(({ achievement, tier }) =>
    Number(state.unlocked[achievement.id]?.tier) >= tier);
};
export const unlockedRewards = state => Object.values(REWARDS).filter(r => hasReward(state, r.id));
export const rewardFor = (kind, key) => Object.values(REWARDS)
  .find(r => r.kind === kind && r.key === key) || null;

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
