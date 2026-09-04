export const APP_TITLE = 'دَفتَرچه — لیست کارهای خودمون';

export const STORAGE_KEYS = {
  tasks:   'daftarche-v1',
  name:    'daftarche-name',
  theme:   'theme',
  history: 'daftarche-history',
  moods:   'daftarche-moods',
  pomo:    'daftarche-pomo',
};

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
};