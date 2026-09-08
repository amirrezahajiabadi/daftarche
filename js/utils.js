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

/* ═══ Estimated Duration ═══ */

export const DUR_MIN = 1;
export const DUR_MAX = 480;

/* Parse a user-supplied duration (minutes). Returns a positive integer
   between 1 and 480, or null when absent/invalid. */
export const parseDurationMin = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= DUR_MIN && n <= DUR_MAX ? n : null;
};

/* Human-readable Persian label for a duration, e.g. 30 → «۳۰ دقیقه»، 90 → «۱ ساعت و ۳۰ دقیقه» */
export const formatDuration = min => {
  const m = parseDurationMin(min);
  if (m === null) return null;
  if (m < 60) return `${faNum(m)} دقیقه`;
  const h = Math.floor(m / 60), r = m % 60;
  return r === 0 ? `${faNum(h)} ساعت` : `${faNum(h)} ساعت و ${faNum(r)} دقیقه`;
};