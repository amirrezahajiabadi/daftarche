export const APP_TITLE = 'دَفتَرچه — لیست کارهای خودمون';

export const STORAGE_KEYS = {
  tasks:   'daftarche-v1',
  name:    'daftarche-name',
  theme:   'theme',
  history: 'daftarche-history',
  moods:   'daftarche-moods',
  pomo:    'daftarche-pomo',
  session: 'daftarche-focus-session',
  focusHistory: 'daftarche-focus-history',
  frogDismissed: 'daftarche-frog-dismissed',
  penWidth: 'daftarche-pen-width',
  statsRange: 'daftarche-stats-range',
  cardStyle: 'daftarche-card-style',
  themeModes: 'daftarche-theme-modes',
  ledger: 'daftarche-ledger',
  achievements: 'daftarche-achievements',
  freeze: 'daftarche-streak-freeze',
};

/* ═══ Themes ═══
   Eight colours the interface can be painted in: four drawn for daylight and
   four for the dark. Six of them are real palettes taken from coolors.co's
   trending list, every value in css/base.css coming from those five anchors or
   from a blend of them (see the table there). The other two are the notebook
   itself: «کاغذ» and «شب» are the paper and the lamp this app was drawn in,
   written down here like the rest so both halves of the table have one.

   `mode` is the half of the table a theme belongs to, and it is not decoration:
   it decides three things at once. The picker shows a light/dark switch and then
   only the four themes of the chosen half, so eight choices are answered in two
   taps. The one-tap switch in the header walks between the two halves, returning
   to the last theme used in the other one. And every dark-only rule in the CSS
   hangs off html[data-mode="dark"] instead of naming a theme, so adding a fifth
   dark theme costs no new rule anywhere.

   `palette` names the block of raw colours in css/base.css, the same table the
   share card's templates are cut from. The keys are written into html[data-theme]
   and into the card panel, so they must match the blocks in css/base.css in name
   and in order. */
export const THEMES = [
  { key: 'paper', label: 'کاغذ',    mode: 'light', palette: 'paper' },
  { key: 'lilac', label: 'یاسی',    mode: 'light', palette: 'lilac' },
  { key: 'blush', label: 'گلاب',    mode: 'light', palette: 'blush' },
  { key: 'sage',  label: 'نعناع',   mode: 'light', palette: 'sage'  },
  { key: 'night', label: 'شب',      mode: 'dark',  palette: 'night' },
  { key: 'gold',  label: 'طلایی',   mode: 'dark',  palette: 'gold'  },
  { key: 'ocean', label: 'اقیانوس', mode: 'dark',  palette: 'ocean' },
  { key: 'plum',  label: 'بادمجان', mode: 'dark',  palette: 'plum'  },
];

export const THEME_KEYS = THEMES.map(t => t.key);
export const THEME_MODES = ['light', 'dark'];
export const DEFAULT_THEME = 'paper';
/* The dark end of the table, and the first of the two halves the one-tap switch
   in the header walks between. */
export const NIGHT_THEME = 'night';

/* A key an older build wrote down, mapped to the nearest theme that replaced it.
   «light» was the warm paper and «paper» still is it; «forest» was the green and
   «sage» is; «dark» was the lamp-lit dark and «night» still is. «شیری» was a
   brighter version of that same warm paper and «paper» is the one that stayed —
   the two were a shade apart, which is precisely why one of them had to go, so
   whoever chose it lands on the paper they were already looking at. None of
   these meanings changed under anyone's feet, which is the point of giving the
   notebook's own two themes their old names back: «شب» is the warm night it
   always was, and the navy-and-gold one that briefly held the name is «طلایی». */
const THEME_ALIASES = { dark: 'night', light: 'paper', forest: 'sage', cream: 'paper' };

/* A stored or shared value, made safe: an unknown key comes back empty so the
   caller can fall back to the default instead of painting nothing. */
export const normalizeTheme = key => {
  const k = THEME_ALIASES[key] || key;
  return THEME_KEYS.includes(k) ? k : '';
};

export const themeByKey = key => THEMES.find(t => t.key === key) || null;

/* Which half a key belongs to. A key nobody recognises is answered with the
   default theme's half rather than nothing, so a caller always has a mode. */
export const modeOf = key => {
  const t = themeByKey(normalizeTheme(key));
  return t ? t.mode : themeByKey(DEFAULT_THEME).mode;
};

export const themesOfMode = mode => THEMES.filter(t => t.mode === mode);

export const P_CYCLE = { low: 'mid', mid: 'high', high: 'low' };
export const P_LABEL = { low: 'کم', mid: 'متوسط', high: 'زیاد' };

export const CATS = [
  { key: 'study',    label: 'درس',     color: '#4e93d8' },
  { key: 'project',  label: 'پروژه',   color: '#9a6ff0' },
  { key: 'home',     label: 'خونه',    color: '#7fb069' },
  { key: 'shopping', label: 'خرید',    color: '#eab13c' },
  { key: 'health',   label: 'سلامت',   color: '#ef6f8e' },
  { key: 'misc',     label: 'متفرقه',  color: '#a79c8a' },
];

export const MOODS = [
  { label: 'حالوم خرابه مشتی', sub: 'ناراحت نباش، یه روز خوب میاد!', color: '#e4584f' },
  { label: 'هعی',               sub: '',                                color: '#f07850' },
  { label: 'بد نیستم',          sub: '',                                color: '#eab13c' },
  { label: 'خوبم',              sub: '',                                color: '#a8c66c' },
  { label: 'میزان میزان',       sub: 'همیشه میزان باشی گل!',           color: '#7fb069' },
];

export const FACES = [
  `<circle cx="12" cy="12" r="9.5" stroke-width="2"/><circle cx="8.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><path d="M7 8.5l3-1.5" stroke-width="2" stroke-linecap="round"/><path d="M17 8.5l-3-1.5" stroke-width="2" stroke-linecap="round"/><path d="M8.5 17c1-1.8 2.2-2.5 3.5-2.5s2.5.7 3.5 2.5" stroke-width="2" stroke-linecap="round"/>`,
  `<circle cx="12" cy="12" r="9.5" stroke-width="2"/><circle cx="8.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><path d="M7.5 8l3 .5" stroke-width="2" stroke-linecap="round"/><path d="M16.5 8l-3 .5" stroke-width="2" stroke-linecap="round"/><path d="M9 16h6" stroke-width="2" stroke-linecap="round"/>`,
  `<circle cx="12" cy="12" r="9.5" stroke-width="2"/><circle cx="8.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><path d="M9.5 15.5c.8.6 1.6.9 2.5.9s1.7-.3 2.5-.9" stroke-width="2" stroke-linecap="round"/>`,
  `<circle cx="12" cy="12" r="9.5" stroke-width="2"/><path d="M7 10.5c.5-1 1.2-1.5 2-1.5s1.5.5 2 1.5" stroke-width="2" stroke-linecap="round"/><path d="M13 10.5c.5-1 1.2-1.5 2-1.5s1.5.5 2 1.5" stroke-width="2" stroke-linecap="round"/><path d="M8.5 15c1 1.5 2.2 2.2 3.5 2.2s2.5-.7 3.5-2.2" stroke-width="2" stroke-linecap="round"/>`,
  `<circle cx="12" cy="12" r="9.5" stroke-width="2"/><path d="M8.5 9l.6 1.2 1.3.2-1 .9.3 1.3-1.2-.7-1.2.7.3-1.3-1-.9 1.3-.2z" fill="currentColor" stroke="none"/><path d="M15.5 9l.6 1.2 1.3.2-1 .9.3 1.3-1.2-.7-1.2.7.3-1.3-1-.9 1.3-.2z" fill="currentColor" stroke="none"/><path d="M8 14.5c1.1 2 2.4 3 4 3s2.9-1 4-3" stroke-width="2" stroke-linecap="round"/><circle cx="6.5" cy="14" r="1.2" fill="currentColor" opacity=".2" stroke="none"/><circle cx="17.5" cy="14" r="1.2" fill="currentColor" opacity=".2" stroke="none"/>`,
];

export const WEEKDAY_LETTERS = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];

export const ICONS = {
  grip:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`,
  clock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 13V9"/><path d="M12 5V3M9 3h6"/></svg>`,
  trash: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M10 11v6M14 11v6"/></svg>`,
  bell:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>`,
};