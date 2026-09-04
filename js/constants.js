/* ═══ ثابت‌ها و داده‌های استاتیک اپ ═══ */

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
  { label: 'خراب',         color: '#e4584f' },
  { label: 'نه‌چندان خوب', color: '#f07850' },
  { label: 'معمولی',       color: '#eab13c' },
  { label: 'خوب',          color: '#a8c66c' },
  { label: 'عالی',         color: '#7fb069' },
];

export const FACES = [
  `<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none"/><path d="M8.2 8.4l2-1.1M15.8 8.4l-2-1.1"/><path d="M8.5 16.6c1-1.3 2.2-2 3.5-2s2.5.7 3.5 2"/>`,
  `<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none"/><path d="M8.7 16.2c1-1 2.1-1.5 3.3-1.5s2.3.5 3.3 1.5"/>`,
  `<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none"/><path d="M8.7 15.3h6.6"/>`,
  `<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none"/><path d="M8.5 14.3c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2"/>`,
  `<circle cx="12" cy="12" r="9"/><path d="M7.6 10.4c.4-.9 1.1-1.4 1.9-1.4s1.5.5 1.9 1.4"/><path d="M12.6 10.4c.4-.9 1.1-1.4 1.9-1.4s1.5.5 1.9 1.4"/><path d="M8 14c1.1 1.9 2.4 2.8 4 2.8s2.9-.9 4-2.8"/>`,
];

export const WEEKDAY_LETTERS = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];

/* آیکون‌های مشترک تسک‌ها */
export const ICONS = {
  grip:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`,
  clock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 13V9"/><path d="M12 5V3M9 3h6"/></svg>`,
  trash: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M10 11v6M14 11v6"/></svg>`,
};