/* ═══ Jalali calendar grid — the shared month, tested ═══
   js/jalalical.js is the only place in the app that knows where a Persian
   month starts and how many days it has, and two features now depend on it:
   the deadline picker and the birthday calendar. A mistake here is not one
   broken picker, it is two calendars quietly disagreeing with each other and
   with the reader's own wall calendar — which is the kind of bug nobody
   notices until they are looking for a date that is not where the app says it
   is. So the arithmetic is pinned here rather than trusted. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderMonthGrid, renderMonthHead, stepMonth, WEEKDAYS } from '../js/jalalical.js';
import { jalaliToDate, jalaliDaysInMonth } from '../js/jalali.js';
import { dayKey } from '../js/utils.js';

/* The grid writes innerHTML and then binds clicks by querying it, so these
   tests hand it the two things it actually uses. Nothing here needs a real
   document, and pulling one in would only test the shim. */
const makeHost = () => ({ innerHTML: '', querySelectorAll: () => [] });
const paint = (host, opts) => renderMonthGrid(host, opts);
const count = (host, re) => (host.innerHTML.match(re) || []).length;

test('the week starts on Saturday, in the order Persian writes it', () => {
  assert.equal(WEEKDAYS.join(''), 'شیدسچپج');
});

test('every month starts on the right weekday', () => {
  /* The leading blanks are the whole question. getDay() is 0 for Sunday, so
     Saturday lands at column 0 after the +1 and the %7 wrap. Checking all
     twelve months catches a calendar that is right by luck in one of them. */
  const host = makeHost();
  for (let jm = 1; jm <= 12; jm++) {
    for (const jy of [1403, 1404, 1405]) {
      paint(host, { jy, jm, keyOf: (y, m, d) => String(d) });
      const want = (jalaliToDate(jy, jm, 1).getDay() + 1) % 7;
      assert.equal(count(host, /cal-blank/g), want, `${jy}/${jm} starts with ${want} blanks`);
    }
  }
});

test('a month is drawn with exactly as many days as it has', () => {
  const host = makeHost();
  for (let jm = 1; jm <= 12; jm++) {
    paint(host, { jy: 1403, jm, keyOf: (y, m, d) => String(d) });
    assert.equal(count(host, /class="cal-day/g), jalaliDaysInMonth(1403, jm), `1403/${jm}`);
  }
});

test('Esfand offers its 30th day in a leap year and not in a common one', () => {
  /* The grid is faithful to the year it is given, which is the whole contract:
     a month is drawn with the days it actually has. The birthday calendar
     follows the reader's own year rather than a convenient one, so this is
     what decides whether 30 Esfand is on screen — and a grid that quietly
     invented that day would put a date on a wall calendar that has not
     arrived yet. */
  const host = makeHost();
  paint(host, { jy: 1403, jm: 12, keyOf: (y, m, d) => String(d) });
  assert.equal(count(host, /class="cal-day/g), 30, '1403 is a leap year');
  paint(host, { jy: 1405, jm: 12, keyOf: (y, m, d) => String(d) });
  assert.equal(count(host, /class="cal-day/g), 29, '1405 is a common year');
});

test('the days carry the identity the caller gave them', () => {
  /* A deadline keys on the Gregorian day; a birthday keys on MM-DD. The grid
     must not invent a shape of its own, which is why keyOf is a parameter. */
  const host = makeHost();
  paint(host, { jy: 1405, jm: 7, keyOf: (y, m, d) => dayKey(jalaliToDate(y, m, d)) });
  assert.match(host.innerHTML, /data-key="2026-09-23"/);
  paint(host, { jy: 1405, jm: 7, keyOf: (y, m, d) => String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') });
  assert.match(host.innerHTML, /data-key="07-01"/);
});

test('a chosen day and today are marked, and only when they are there', () => {
  const host = makeHost();
  paint(host, { jy: 1405, jm: 7, keyOf: (y, m, d) => String(d), selectedKey: '12', todayKey: '12' });
  assert.equal(count(host, /class="cal-day today sel"/), 1);
  /* Nothing stored and nothing today: a plain month, which is what a reader
     who has not chosen anything should see. */
  paint(host, { jy: 1405, jm: 7, keyOf: (y, m, d) => String(d) });
  assert.equal(count(host, /\bcal-day (today|sel)\b/), 0);
});

test('the title can hide the year', () => {
  /* The birthday calendar shows no year, because the stored date has none —
     printing one would invite a reader to pick it and then throw it away. */
  const host = makeHost();
  renderMonthHead(host, { jy: 1405, jm: 7, showYear: false });
  assert.match(host.innerHTML, /مهر/);
  assert.doesNotMatch(host.innerHTML, /۱۴۰۵/);
  renderMonthHead(host, { jy: 1405, jm: 7, showYear: true });
  assert.match(host.innerHTML, /مهر ۱۴۰۵/);
});

test('month navigation wraps at both ends of the year', () => {
  assert.deepEqual(stepMonth(1405, 1, -1), { jy: 1404, jm: 12 });
  assert.deepEqual(stepMonth(1405, 12, 1), { jy: 1406, jm: 1 });
  assert.deepEqual(stepMonth(1405, 7, 1), { jy: 1405, jm: 8 });
  assert.deepEqual(stepMonth(1405, 7, -1), { jy: 1405, jm: 6 });
  /* Twelve steps in either direction is the year exactly, which is what makes
     the calendar able to reach every month from any month. */
  let jy = 1405, jm = 5;
  for (let i = 0; i < 12; i++) { const n = stepMonth(jy, jm, 1); jy = n.jy; jm = n.jm; }
  assert.deepEqual({ jy, jm }, { jy: 1406, jm: 5 });
});

test('a grid built for one year is not silently usable as another', () => {
  /* Why the birthday calendar follows the reader's own year. Drawing a month
     is cheap, but the weekday columns are the part a reader checks their
     birthday against, and they come out of the year. Pinned to the wrong year
     a grid is not slightly off — every one of the twelve months shifts, and
     the app disagrees with the reader's own calendar on every single day they
     might tap. This is the measurement that rule was decided on. */
  let wrong = 0;
  for (let jm = 1; jm <= 12; jm++) {
    if ((jalaliToDate(1405, jm, 1).getDay() + 1) % 7 !==
        (jalaliToDate(1403, jm, 1).getDay() + 1) % 7) wrong++;
  }
  assert.equal(wrong, 12, 'pinning the grid to another year breaks all twelve months');
});
