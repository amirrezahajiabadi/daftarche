/* Jalali ↔ Gregorian: every date picker, label and week boundary in the app
   goes through js/jalali.js, so a wrong day here is wrong everywhere. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gregorianToJalali, jalaliToGregorian, isValidJalali, jalaliDaysInMonth,
  dateToJalali, jalaliToDate, formatJalali, JALALI_MONTHS,
} from '../js/jalali.js';

test('known Nowruz anchors', () => {
  assert.deepEqual(gregorianToJalali(2024, 3, 20), { jy: 1403, jm: 1, jd: 1 });
  assert.deepEqual(gregorianToJalali(2025, 3, 21), { jy: 1404, jm: 1, jd: 1 });
  assert.deepEqual(gregorianToJalali(2026, 3, 21), { jy: 1405, jm: 1, jd: 1 });
});

test('a known mid-year date: 30 Sep 2026 is 8 Mehr 1405', () => {
  assert.deepEqual(gregorianToJalali(2026, 9, 30), { jy: 1405, jm: 7, jd: 8 });
  assert.deepEqual(dateToJalali(new Date(2026, 8, 30)), { jy: 1405, jm: 7, jd: 8 });
});

test('the leap day: 30 Esfand exists in 1403 (=20 Mar 2025) but not in 1404', () => {
  assert.equal(isValidJalali(1403, 12, 30), true);
  assert.deepEqual(jalaliToGregorian(1403, 12, 30), { gy: 2025, gm: 3, gd: 20 });
  assert.equal(isValidJalali(1404, 12, 30), false);
  assert.equal(jalaliDaysInMonth(1403, 12), 30);
  assert.equal(jalaliDaysInMonth(1404, 12), 29);
});

test('month lengths: 31 for the first six, 30 for the next five', () => {
  for (let m = 1; m <= 6; m++) assert.equal(jalaliDaysInMonth(1404, m), 31, 'month ' + m);
  for (let m = 7; m <= 11; m++) assert.equal(jalaliDaysInMonth(1404, m), 30, 'month ' + m);
});

test('impossible dates are rejected', () => {
  assert.equal(isValidJalali(1404, 13, 1), false);
  assert.equal(isValidJalali(1404, 0, 1), false);
  assert.equal(isValidJalali(1404, 1, 32), false);
  assert.equal(isValidJalali(1404, 7, 31), false);   // Mehr has 30
  assert.equal(isValidJalali(1404, 1.5, 1), false);
  assert.equal(isValidJalali('1404', 1, 1), false);
});

test('round trip over every day from 1990 to 2100 (Gregorian) — and days advance by exactly one', () => {
  let prev = null;
  for (let t = Date.UTC(1990, 0, 1); t <= Date.UTC(2100, 11, 31); t += 864e5) {
    const d = new Date(t);
    const gy = d.getUTCFullYear(), gm = d.getUTCMonth() + 1, gd = d.getUTCDate();
    const j = gregorianToJalali(gy, gm, gd);
    assert.deepEqual(jalaliToGregorian(j.jy, j.jm, j.jd), { gy, gm, gd }, `${gy}-${gm}-${gd}`);
    assert.ok(isValidJalali(j.jy, j.jm, j.jd));
    if (prev) {
      const nextDay = (j.jy === prev.jy && j.jm === prev.jm && j.jd === prev.jd + 1)
        || (j.jy === prev.jy && j.jm === prev.jm + 1 && j.jd === 1 && prev.jd === jalaliDaysInMonth(prev.jy, prev.jm))
        || (j.jy === prev.jy + 1 && j.jm === 1 && j.jd === 1 && prev.jm === 12 && prev.jd === jalaliDaysInMonth(prev.jy, 12));
      assert.ok(nextDay, `not consecutive at ${gy}-${gm}-${gd}`);
    }
    prev = j;
  }
});

test('jalaliToDate and formatJalali', () => {
  const d = jalaliToDate(1405, 7, 8);
  assert.equal(d.getFullYear(), 2026); assert.equal(d.getMonth(), 8); assert.equal(d.getDate(), 30);
  assert.equal(JALALI_MONTHS.length, 12);
  assert.equal(formatJalali(1405, 7, 8), '۱۴۰۵/۰۷/۰۸');   // Persian digits, zero-padded
});
