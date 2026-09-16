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