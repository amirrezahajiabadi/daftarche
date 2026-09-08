/* ═══ Jalali (Solar Hijri) Calendar Utilities ═══
   Exact Jalali ↔ Gregorian conversion with correct leap-year handling.
   Centralized here so every date picker / label uses the same math. */

import { faDigits } from './utils.js';

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

/* Gregorian → Jalali. Input: gy/gm/gd (1-based). Output: { jy, jm, jd } */
export function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
    + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm, jd;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + days % 31;
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + (days - 186) % 30;
  }
  return { jy, jm, jd };
}

/* Jalali → Gregorian. Input: jy/jm/jd (1-based). Output: { gy, gm, gd } */
export function jalaliToGregorian(jy, jm, jd) {
  const jy2 = jy + 1595;
  let days = -355668 + 365 * jy2 + Math.floor(jy2 / 33) * 8
    + Math.floor(((jy2 % 33) + 3) / 4) + jd
    + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal_a = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return { gy, gm, gd };
}

/* True when (jy, jm, jd) is a real Jalali date — leap-year aware.
   Uses a round-trip check so impossible dates (ماه ۱۳، روز ۳۲،
   روز نامعتبر یک ماه، اسفند ۳۰ در سال غیرکبیسه) are rejected. */
export function isValidJalali(jy, jm, jd) {
  if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd)) return false;
  if (jy < 1 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return false;
  const g = jalaliToGregorian(jy, jm, jd);
  const back = gregorianToJalali(g.gy, g.gm, g.gd);
  return back.jy === jy && back.jm === jm && back.jd === jd;
}

/* Days in a Jalali month (Esfand depends on the leap year) */
export function jalaliDaysInMonth(jy, jm) {
  if (jm < 7) return 31;
  if (jm < 12) return 30;
  return isValidJalali(jy, 12, 30) ? 30 : 29;
}

/* Gregorian Date → Jalali */
export const dateToJalali = d => gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());

/* Jalali → Gregorian Date (local midnight) */
export function jalaliToDate(jy, jm, jd) {
  const g = jalaliToGregorian(jy, jm, jd);
  return new Date(g.gy, g.gm - 1, g.gd);
}

/* «۱۴۰۵/۰۶/۲۰» with Persian digits (safe for RTL via dir="ltr" wrapper) */
export function formatJalali(jy, jm, jd) {
  return `${faDigits(jy)}/${faDigits(String(jm).padStart(2, '0'))}/${faDigits(String(jd).padStart(2, '0'))}`;
}

export const formatJalaliDate = d => {
  const j = dateToJalali(d);
  return formatJalali(j.jy, j.jm, j.jd);
};