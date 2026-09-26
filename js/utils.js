/* ═══ Pure Helper Functions ═══ */

export const $ = s => document.querySelector(s);

export const faNum = n => n.toLocaleString('fa-IR');

export const faDigits = s => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

export const dayKey = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* A day-aligned key `n` calendar days away. Stepped by the calendar rather than
   by 86,400,000ms, because in a timezone that shifts its clock an exact day of
   milliseconds is not always the next date. */
export const shiftKey = (key, n) => {
  const [y, m, d] = String(key).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dayKey(dt);
};

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

/* ═══ Time of Day ═══
   A planned span is two minutes-past-midnight numbers, the way a duration is
   kept as one number of minutes: it sorts, it survives a locale change, and it
   needs no date attached — the task already knows which day it is for. Both
   ends or neither: a start without an end is not a span, and half a span would
   read as a bug rather than as a choice. */

export const parseTimeMin = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < 24 * 60 ? n : null;
};

/* 870 → «۱۴:۳۰». Always two digits on the hour, so a column of spans in the
   planner line up instead of shuffling. */
export const formatClock = min => {
  const m = parseTimeMin(min);
  if (m === null) return null;
  return faDigits(String(Math.floor(m / 60)).padStart(2, '0')) + ':' + faDigits(String(m % 60).padStart(2, '0'));
};

/* Both ends, in order, or nothing at all. */
export const parseTimeRange = (from, to) => {
  const a = parseTimeMin(from), b = parseTimeMin(to);
  return a !== null && b !== null && a < b ? { from: a, to: b } : null;
};

/* ═══ The Week ═══
   Saturday first — the week this app's calendar already keeps (a Jalali week),
   so the planner's first column is the day the reader's week starts on.
   getDay() counts from Sunday, hence the one-day shift. */

export const WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

export const weekStartOf = d => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 1) % 7));
  return x;
};

export const dateFromKey = key => new Date(key + 'T00:00:00');

/* Both a day key and a week key are Gregorian under the hood — the calendar the
   reader sees is Jalali, the storage is not, and one conversion point (js/jalali.js)
   keeps the two from ever disagreeing. */
export const weekKeyOf = key => dayKey(weekStartOf(dateFromKey(key)));

/* ═══ Web Push ═══ */

/* Convert a URL-safe Base64 VAPID public key to the Uint8Array that
   pushManager.subscribe expects. Pure JS — no dependencies. */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}