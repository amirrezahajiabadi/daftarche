/* ═══ Pure Helper Functions ═══ */

export const $ = s => document.querySelector(s);

export const faNum = n => n.toLocaleString('fa-IR');

export const faDigits = s => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

export const dayKey = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const dueKeyFromOffset = off => {
  const d = new Date();
  d.setDate(d.getDate() + Number(off));
  return dayKey(d);
};

/* For a more accurate search: normalize Arabic variants of yeh/kaf to their Persian forms, and lowercase Latin letters */
export const normalizeFa = s =>
  String(s).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک');