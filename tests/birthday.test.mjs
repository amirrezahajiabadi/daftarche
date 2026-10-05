/* ═══ Birthday — the rule, tested with dates instead of a year ═══
   Everything here is a pure function, so the one day a year the app does
   something it never otherwise does can be exercised on an ordinary Tuesday by
   handing it a date. What is not tested here is the card and the settings row:
   those are the parts that need a screen, and pretending otherwise with a fake
   DOM would only test the fake.

   The three cases marked REGRESSION were each a real defect in the first
   version of this feature, found by reading it rather than by running it. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeBirthday, birthdayKey, birthdayAge, isBirthday, MIN_BIRTH_YEAR } from '../js/birthday.js';
import { moveDays } from '../js/jalalical.js';
import { jalaliToDate, jalaliDaysInMonth, dateToJalali } from '../js/jalali.js';
import { readFileSync } from 'node:fs';

/* 4 October 2026 is 1405/07/12 — a fixed date, so the tests do not start failing
   on New Year's Eve. */
const TODAY = new Date(2026, 9, 4);
const BDAY = { y: 1379, m: 7, d: 12 };
/* The same date with no year: a record written before the picker asked, which has
   to keep working unchanged. */
const NOYEAR = { m: 7, d: 12 };

test('a birthday is read in either script, and either way is MM/DD', () => {
  assert.deepEqual(normalizeBirthday('12/07'), { y: null, m: 12, d: 7 });
  assert.deepEqual(normalizeBirthday('۱۲/۰۷'), { y: null, m: 12, d: 7 });
  assert.deepEqual(normalizeBirthday('12-07'), { y: null, m: 12, d: 7 });
  assert.deepEqual(normalizeBirthday('۱۲ ۰۷'), { y: null, m: 12, d: 7 });
});

test('a date may leave out the leading zero on the month', () => {
  assert.deepEqual(normalizeBirthday('۷/۱۲'), { y: null, m: 7, d: 12 });
  assert.deepEqual(normalizeBirthday('7/12'), { y: null, m: 7, d: 12 });
});

test('two digits alone are refused rather than guessed at', () => {
  /* REGRESSION: the first version read slice(0,2) as the month and slice(-2) as
     the day, so «۱۲» silently became 12/12 — a birthday the reader never wrote, on a day they
     were never asked about. */
  assert.equal(normalizeBirthday('۱۲'), null);
  assert.equal(normalizeBirthday('12'), null);
});

test('a day the month cannot hold is refused', () => {
  assert.equal(normalizeBirthday('07/31'), null);   // Mehr has 30
  assert.equal(normalizeBirthday('13/01'), null);   // no month 13
  assert.equal(normalizeBirthday('01/00'), null);
  assert.equal(normalizeBirthday('00/05'), null);
  assert.deepEqual(normalizeBirthday('01/31'), { y: null, m: 1, d: 31 });
});

test('30 Esfand is kept, because some years have it', () => {
  /* REGRESSION: the first version asked jalaliDaysInMonth(1404, m) for the
     ceiling, and 1404 is a common year — so 30 Esfand was refused outright on
     this device and accepted on another. A birthday is the same day every year,
     so no year may be consulted. */
  assert.deepEqual(normalizeBirthday('12/30'), { y: null, m: 12, d: 30 });
  assert.deepEqual(normalizeBirthday({ m: 12, d: 30 }), { y: null, m: 12, d: 30 });
  assert.equal(normalizeBirthday('12/31'), null);
});

test('nothing written down is no birthday', () => {
  assert.equal(normalizeBirthday(''), null);
  assert.equal(normalizeBirthday(null), null);
  assert.equal(normalizeBirthday(undefined), null);
  assert.equal(normalizeBirthday('سلام'), null);
});

test('the greeting is keyed by month and day, never by year', () => {
  assert.equal(birthdayKey(TODAY, BDAY), '07-12');
  assert.equal(birthdayKey(TODAY, { m: 7, d: 13 }), null);
  assert.equal(birthdayKey(TODAY, null), null);
  /* The key carries no year, which is what lets next year's arrive with no
     cleanup and no expiry. */
  assert.equal(birthdayKey(TODAY, BDAY).length, 5);
});

test('the day greets once, and a different year greets again', () => {
  assert.equal(isBirthday(TODAY, BDAY, ''), true);
  assert.equal(isBirthday(TODAY, BDAY, '07-12'), false);
  assert.equal(isBirthday(TODAY, BDAY, '07-11'), true);   // last year
});

test('the 24 hours are a calendar day, not 24 hours from opening', () => {
  /* 23:40 on the day and 00:20 the next morning are both still the birthday;
     the rule compares month and day on the device clock and counts nothing. */
  const late = new Date(2026, 9, 4, 23, 40);
  const early = new Date(2026, 9, 5, 0, 20);
  assert.equal(birthdayKey(late, BDAY), '07-12');
  assert.equal(birthdayKey(early, BDAY), null);
  /* And a day before, at any hour, is not it. */
  assert.equal(birthdayKey(new Date(2026, 9, 3, 23, 59), BDAY), null);
});

test('a stored date survives a round trip through the shape it is kept in', () => {
  /* What the settings row writes is exactly what it reads back: no year, two
     numbers, and nothing the calendar would refuse. */
  for (const raw of ['۱۲/۰۷', '01/31', '07/01', '12/30']) {
    const once = normalizeBirthday(raw);
    assert.deepEqual(normalizeBirthday(once), once, raw);
  }
});

/* ── The arrow keys ──
   The grid is walked with four arrow keys, and the walker is this one function.
   It is exported and tested because it is the only part of the keyboard support
   that can be wrong without looking wrong: the DOM work around it is invisible
   from a test, but a day that steps a month in the wrong direction, or lands on
   a date the month does not have, is a calendar that quietly lies. */

test('a day moves one day sideways and a week up and down', () => {
  /* RTL is the reason left is «forward»: the week is drawn ش ی د س چ پ ج from the
     right, so the arrow pointing left is the one that reaches the next day. */
  assert.deepEqual(moveDays(1405, 7, 15, 1), { jy: 1405, jm: 7, jd: 16 });
  assert.deepEqual(moveDays(1405, 7, 15, -1), { jy: 1405, jm: 7, jd: 14 });
  assert.deepEqual(moveDays(1405, 7, 15, 7), { jy: 1405, jm: 7, jd: 22 });
  assert.deepEqual(moveDays(1405, 7, 15, -7), { jy: 1405, jm: 7, jd: 8 });
});

test('stepping off the end of a month lands on a day that exists', () => {
  /* REGRESSION: the first version did this by hand — compare the day against the
     month length, call stepMonth, then focus the day it computed — and it lost
     focus completely at every boundary. Measured in a real browser: ArrowLeft on
     Mehr 30 left the keyboard on <body> with the grid showing a different month,
     so every arrow key afterwards did nothing. The reader had to click a day to
     get the keyboard back at all. */
  assert.deepEqual(moveDays(1405, 6, 31, 1), { jy: 1405, jm: 7, jd: 1 });   // Shahrivar 31 → Mehr 1
  assert.deepEqual(moveDays(1405, 7, 30, 1), { jy: 1405, jm: 8, jd: 1 });   // Mehr 30 → Aban 1
  assert.deepEqual(moveDays(1405, 7, 1, -1), { jy: 1405, jm: 6, jd: 31 });  // Mehr 1 → Shahrivar 31
  assert.deepEqual(moveDays(1405, 8, 1, -1), { jy: 1405, jm: 7, jd: 30 });  // Aban 1 → Mehr 30
});

test('a week step across a month keeps the weekday', () => {
  /* The vertical step is seven real days precisely so that it does not drift.
     A grid that moved «down» by seven days-in-the-month would walk the reader
     diagonally across the calendar, which is the failure this pins. */
  let all = true;
  for (let jm = 1; jm <= 12; jm++) {
    for (let jd = 1; jd <= 29; jd++) {
      const to = moveDays(1405, jm, jd, 7);
      const sameWeekday = (jalaliToDate(1405, jm, jd).getDay() === jalaliToDate(to.jy, to.jm, to.jd).getDay());
      const real = to.jd >= 1 && to.jd <= jalaliDaysInMonth(to.jy, to.jm);
      if (!sameWeekday || !real) all = false;
    }
  }
  assert.ok(all, 'a seven-day step must keep the weekday and land on a day the month has');
});

test('stepping crosses the year boundary in both directions', () => {
  /* ۱۴۰۵ is a common year and ۱۴۰۳ is a leap one, so the last day of the year is
     a different date in each — which is exactly why a leap-aware calendar cannot
     be faked with a hardcoded «30 Esfand». Both are checked because getting one
     right and the other wrong is the failure mode. */
  assert.deepEqual(moveDays(1405, 12, 29, 1), { jy: 1406, jm: 1, jd: 1 });   // common Esfand → Farvardin
  assert.deepEqual(moveDays(1403, 12, 30, 1), { jy: 1404, jm: 1, jd: 1 });   // leap Esfand → Farvardin
  assert.deepEqual(moveDays(1404, 1, 1, -1), { jy: 1403, jm: 12, jd: 30 });  // back into a leap Esfand
  assert.deepEqual(moveDays(1405, 1, 1, -1), { jy: 1404, jm: 12, jd: 29 });  // back into a common one
});

test('walking every day of a year never leaves the calendar', () => {
  /* The whole surface at once, from the first walker to the last: 365 days of
     Mehr to Esfand and back, each step landing on a date the calendar agrees
     with. This is the check that would have caught the focus bug, because a
     step that produced day 31 of a 30-day month is exactly what it looks for. */
  let walked = 0;
  let cur = { jy: 1405, jm: 1, jd: 1 };
  for (let i = 0; i < 365; i++) {
    assert.ok(cur.jd >= 1 && cur.jd <= jalaliDaysInMonth(cur.jy, cur.jm),
      `${cur.jy}/${cur.jm}/${cur.jd} is not a day the calendar has`);
    cur = moveDays(cur.jy, cur.jm, cur.jd, 1);
    walked++;
  }
  assert.equal(walked, 365);
  assert.deepEqual(cur, { jy: 1406, jm: 1, jd: 1 }, 'a full year of single steps returns to the same date next year');
});

/* ── The drawn calendar ──
   Two defects here were found by looking at the running app rather than the
   code, and neither can be seen from js: a hardcoded ink colour that is
   unreadable in seven of the nine palettes, and a grid whose ARIA role promised
   rows it does not have. Both are pinned by reading the stylesheet. */

const CSS = readFileSync(new URL('../css/overlays.css', import.meta.url), 'utf8');
const CAL = readFileSync(new URL('../js/jalalical.js', import.meta.url), 'utf8');
const BIRTH = readFileSync(new URL('../js/birthday.js', import.meta.url), 'utf8');

test('the chosen day wears the ink that belongs on the accent, not a fixed one', () => {
  /* REGRESSION: .cal-day.sel was written with a hardcoded #fff, which is
     unreadable in seven of the nine palettes — 1.61:1 on «طلایی»'s gold and
     2.06:1 on «شب». A calendar whose chosen day cannot be read has not answered
     the question it was opened to answer. --color-text-on-accent exists for
     exactly this and every palette declares its own value for it. */
  const sel = /\.cal-day\.sel\{([^}]*)\}/.exec(CSS);
  assert.ok(sel, 'css/overlays.css has no .cal-day.sel rule');
  assert.match(sel[1], /color:var\(--color-text-on-accent\)/,
    'the selected day must take its ink from --color-text-on-accent');
  assert.doesNotMatch(sel[1], /#[0-9a-f]{3,8}|rgba?\(/i,
    'the selected day must not hardcode an ink colour');
});

test('every day in the grid is a real touch target', () => {
  /* 44px is the WCAG 2.5.5 minimum, and it is the whole reason the grid is the
     widest thing in the card. Miss a day here and the app stores the wrong
     birthday, which then greets the reader on the wrong day once a year. */
  const day = /\.cal-day\{([^}]*)\}/.exec(CSS);
  assert.ok(day, 'css/overlays.css has no .cal-day rule');
  assert.match(day[1], /height:44px/);
  assert.match(day[1], /max-width:44px/);
});

test('the grid cannot be squeezed below 44px by a narrower card', () => {
  /* REGRESSION: the grid columns were repeat(7, 1fr), which divides whatever
     width it is handed. Narrowing the card from 380px to 340px to match a
     drawing handed back 39.14px columns, and every day quietly became a 39px
     touch target — the CSS still said 44 and the pixels said 39. Nothing about
     it is visible in review: the rule reads as though it guarantees 44.

     minmax(44px, 1fr) makes 44 a floor instead of a suggestion, and the card
     is wide enough (7×44 + 6×4 + 2×20 = 372) for the floor to be reachable in
     the first place. Both halves are asserted: the floor, and the width that
     pays for it. A narrower card would make one of them fail loudly. */
  const grid = /\.cal-grid\{([^}]*)\}/.exec(CSS);
  assert.ok(grid, 'css/overlays.css has no .cal-grid rule');
  assert.match(grid[1], /repeat\(7,\s*minmax\(44px,\s*1fr\)\)/,
    'the columns must floor at 44px, or a narrower card silently shrinks every target');
  const day = /\.cal-day\{([^}]*)\}/.exec(CSS);
  assert.match(day[1], /min-width:44px/, 'a cell must not shrink below the floor');
  assert.doesNotMatch(grid[1], /repeat\(7,\s*1fr\)/, 'the old shrinkable columns are gone');

  /* The week header has to use the same columns, or its letters drift off the
     day each one names — the failure being invisible precisely because each
     letter is still perfectly centred in something. */
  const week = /\.cal-week\{([^}]*)\}/.exec(CSS);
  assert.match(week[1], /minmax\(44px,\s*1fr\)/, 'the weekday row must use the columns the grid uses');
  const blank = /\.cal-blank\{([^}]*)\}/.exec(CSS);
  assert.match(blank[1], /min-width:44px/, 'a leading blank must hold the same column width');

  /* And the card has to be wide enough for the floor to fit: the grid needs
     7×44 + 6×4 = 332, plus 20px of padding on each side. The rule lives on
     .cal-card now — the frame both pickers share — because a width that only
     the birthday card obeyed was exactly how the deadline card came to be too
     narrow and left its columns overlapping. */
  const card = /\.cal-card\{([^}]*)\}/.exec(CSS);
  assert.ok(card, 'css/overlays.css has no .cal-card rule — the shared frame is gone');
  const maxW = /max-width:(\d+)px/.exec(card[1]);
  /* The shorthand reads top before side, so matching the first number in
     `padding:24px 20px` would read the top and quietly check the wrong
     padding — which is how the first version of this assertion passed on a
     card that was 8px too narrow. The side padding is the second value. */
  const padShorthand = /padding:(\d+)px\s+(\d+)px/.exec(card[1]);
  assert.ok(maxW && padShorthand, 'the birthday card must declare a max-width and a padding');
  const side = Number(padShorthand[2]);
  assert.ok(Number(maxW[1]) >= 332 + 2 * side,
    `the card is ${maxW[1]}px with ${side}px side padding — too narrow for 44px days (needs ${332 + 2 * side}px)`);
});

test('the month arrows are the size the design asks for, with the 44px kept', () => {
  /* The drawing this follows has a 32px square with a hairline border. So the
     box is 32px — and the 44px target moves into an invisible ::after inset by
     6px all round, which is 32 + 12 = 44.

     These are two claims that cancel out if either is dropped alone, which is
     why both are asserted rather than just the one that is visible: an arrow
     shrunk to 32px with no inset is a 32px target, and an arrow with the inset
     but sized 44px is not the design any more. */
  const nav = /\.cal-nav\{([^}]*)\}/.exec(CSS);
  assert.match(nav[1], /width:32px/, 'the arrow box is 32px as drawn');
  assert.match(nav[1], /height:32px/);
  assert.match(nav[1], /position:relative/, 'the ::after touch target needs a positioned ancestor');
  assert.match(nav[1], /border:1px solid/, 'the border is a hairline, not 1.5px');
  assert.match(nav[1], /background:transparent/, 'the square is not filled');
  const target = /\.cal-nav::after\{([^}]*)\}/.exec(CSS);
  assert.ok(target, 'css/overlays.css has no .cal-nav::after, so the arrow is a 32px target');
  assert.match(target[1], /inset:-6px/, '32px box + 6px each side = the 44px minimum');
});

test('the month head is a wrapper, because the layout rule needs one', () => {
  /* REGRESSION: css/overlays.css lays the head out with flex on .cal-head, but
     renderMonthHead wrote the three children straight into the host and never
     emitted that class. The rule matched nothing, so the two arrows and the
     title fell into normal flow: one arrow above the month and one below it.
     Found by measuring the running picker — the arrows were 70px apart
     vertically and not on the same row at all.

     A CSS rule that matches no element is invisible in review and in a
     screenshot of the page; it only shows up as a wrong layout, so the class is
     pinned to the markup that draws it. */
  assert.match(CAL, /class="cal-head"/, 'renderMonthHead must emit the wrapper the layout rule needs');
  assert.match(CAL, /\.cal-head \.cal-nav/, 'and its own arrows must be found inside that wrapper');
  const head = /\.cal-head\{([^}]*)\}/.exec(CSS);
  assert.ok(head, 'css/overlays.css has no .cal-head rule');
  assert.match(head[1], /display:flex/, 'the wrapper is what puts the three on one row');
  /* And the title must be allowed to grow, or space-between stops centring it
     and the month drifts as its name changes length. */
  const title = /\.cal-title\{([^}]*)\}/.exec(CSS);
  assert.match(title[1], /flex:1 1 auto/, 'the title takes the slack between the two arrows');
  assert.match(title[1], /text-align:center/);
});

test('the grid claims a role it can actually honour', () => {
  /* role="grid" requires rows and gridcells. This markup has neither — it is a
     row of buttons laid out by CSS — so a screen reader announced «grid» and
     then had no rows to walk. A labelled group of thirty named buttons is
     announced correctly, and the day labels are already «۱۲ مهر». */
  assert.doesNotMatch(CAL, /role="grid"/, 'js/jalalical.js still claims role=grid without rows');
  assert.match(CAL, /class="cal-grid" role="group"/);
  assert.match(CAL, /aria-label="روزهای /, 'the group is named so it is announced as something');
});

test('the grid is one Tab stop, and only when the caller says so', () => {
  /* Roving tabindex: thirty tabbable days means thirty presses of Tab to cross
     a calendar. It is opt-in because the other caller (the deadline picker) has
     no arrow-key handler of its own — with every day at -1 its grid would be
     unreachable by Tab entirely. */
  assert.match(CAL, /activeKey = null/, 'activeKey must default to off');
  assert.match(CAL, /day\.key === activeKey \? ' tabindex="0"' : ' tabindex="-1"'/);
});

test('the month title announces itself when the month changes', () => {
  /* Without this, arrowing through twelve months replaced the grid with nothing
     saying which month it now was. */
  assert.match(CAL, /class="cal-title" aria-live="polite"/);
});

test('the birthday month carries no year into the grid', () => {
  /* The stored date is MM-DD. Printing ۱۴۰۵ over the grid invites the reader to
     pick a year that is then thrown away. */
  assert.match(CAL, /showYear = true/, 'showYear still exists for the deadline picker');
});

test('the roving tab stop is always a day the month on screen actually has', () => {
  /* REGRESSION: rovingKey is deliberately kept between openings — it is where
     the reader walked to — but the month they walked to is not necessarily the
     month the next opening draws. Close on Aban, reopen on the stored month in
     Mehr, and the grid was handed a key naming a day it does not contain. Every
     button then came out tabindex="-1" and the calendar could only be reached
     by clicking. Measured in a browser before the fix: zero Tab stops.

     The rule is therefore not «the remembered day» but «the remembered day, if
     it is in the month being drawn». Pinned here as the shape of the check so a
     later simplification of activeDayKey() has to argue with this line. */
  assert.match(BIRTH, /function activeDayKey\(\)/);
  const body = BIRTH.slice(
    BIRTH.indexOf('function activeDayKey()'),
    BIRTH.indexOf('function activeDayKey()') + 700,
  );
  assert.match(body, /inView/, 'the candidate must be checked against the month on screen');
  assert.match(body, /pad2\(viewJM\)/, 'the check has to name the month being drawn');
  assert.match(body, /bdKeyOf\(viewJY, viewJM, 1\)/, 'and fall back to a day every month has');
});

test('both date pickers use the same card, so they cannot drift apart', () => {
  /* The deadline card was a 340px white box with 28px of padding and 28px-tall
     quick buttons; the birthday card was ruled paper at 372px. Same grid, same
     month head, same day cells, and two different objects around them — on the
     one a reader opens far more often.

     Both now carry .cal-card, which owns the width, the padding, the paper and
     the tape. The picker's own class is kept only for what is genuinely its
     own, so this asserts the shared class is present in the markup and that
     neither card smuggles a width back in on its own rule. */
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const cards = [...html.matchAll(/<div class="name-card ([^"]*cal-card[^"]*)"/g)].map(m => m[1]);
  assert.ok(cards.length === 2, `expected 2 cards on .cal-card, found ${cards.length}`);
  assert.ok(cards.some(c => c.includes('due-card')), 'the deadline card must carry .cal-card');
  assert.ok(cards.some(c => c.includes('bd-pick-card')), 'the birthday card must carry .cal-card');

  /* Neither picker may set its own width: that is how they diverge. */
  assert.doesNotMatch(CSS, /^\.due-card\{[^}]*max-width/m, 'the deadline card must not set its own width');
  assert.doesNotMatch(CSS, /^\.bd-pick-card\{[^}]*max-width/m, 'the birthday card must not set its own width');
});

test('the birthday card is its title and nothing above the grid', () => {
  /* The line under the title used to tell the reader what to do: take the year,
     then the month and day, and mention the year once more if they want it read
     back in the greeting. A card that opens on the thing being asked for does
     not need to be told how to use itself, and two sentences above a
     seven-column grid are what pushed the calendar itself down on a phone.

     So the paragraph is gone from the markup. What has to survive is the name of
     the dialog: aria-labelledby points at the title, and if that element were
     ever removed along with the paragraph the card would reach a screen reader
     with nothing to announce. */
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const card = /<div class="name-card cal-card bd-pick-card[^"]*"[^>]*>([\s\S]*?)<button class="skip"/.exec(html);
  assert.ok(card, 'the birthday card is not shaped the way this test expects');
  const body = card[1];
  assert.doesNotMatch(body, /<p[\s>]/, 'the birthday card must not carry a paragraph');

  const label = /aria-labelledby="([^"]+)"/.exec(card[0]);
  assert.ok(label, 'the birthday card must still name itself for a screen reader');
  assert.match(body, new RegExp('<h2 id="' + label[1] + '"'),
    'aria-labelledby must point at a title that is actually there');

  /* The deadline picker keeps its sentence, so the shared .cal-card>p rule is
     still doing work and the two cards are free to differ here on purpose. */
  const due = /<div class="name-card cal-card due-card[^"]*"[^>]*>([\s\S]*?)<button class="skip"/.exec(html);
  assert.ok(due && /<p[\s>]/.test(due[1]), 'the deadline card keeps its line of help');

  /* What the paragraph contributed to the rhythm - air under the title - now has
     to be asked for by name, or the grid sits four pixels off the heading. */
  const gap = /^\.bd-pick-card h2\{([^}]*)\}/m.exec(CSS);
  assert.ok(gap, 'css/overlays.css has no .bd-pick-card h2 rule');
  assert.match(gap[1], /margin-bottom:1[0-9]px/,
    'the title needs its own bottom margin now that nothing below it has one');
});

test('the quick buttons are as easy to hit as everything else in the card', () => {
  /* 28px, half the minimum, on the control a reader presses most: three
     quarters of the deadlines anyone sets fall in the next three days. */
  const q = /\.cal-q\{([^}]*)\}/.exec(CSS);
  assert.ok(q, 'css/overlays.css has no .cal-q rule');
  assert.match(q[1], /min-height:44px/);
  assert.match(q[1], /min-width:44px/);
  /* And in the same hairline square as the month arrows, so the card has one
     kind of small button rather than three. */
  assert.match(q[1], /border:1px solid/);
  assert.match(q[1], /background:transparent/);
});

test('both pickers walk the grid with the same shared handler', () => {
  /* Two copies of this would be two answers to the same keypress. The walker
     lives in js/jalalical.js and each picker hands it its own month. */
  assert.match(CAL, /export function walkGridKeys/, 'the shared walker has to exist');
  assert.match(BIRTH, /walkGridKeys\(\$\('#bdCal'\)/, 'the birthday picker must use it');
  const DUE = readFileSync(new URL('../js/duepicker.js', import.meta.url), 'utf8');
  assert.match(DUE, /walkGridKeys\(/, 'the deadline picker must use it too');
  /* And neither may keep a private copy of the arrow table. */
  assert.doesNotMatch(BIRTH, /const DAY_MOVE/, 'the birthday picker must not keep its own arrow table');
  assert.doesNotMatch(DUE, /const DAY_MOVE/, 'the deadline picker must not keep its own arrow table');
});

/* ── The update note ──
   «نسخهٔ جدید اومده» was the one piece of this app that looked nothing like the
   rest: a dark system toast with a heavy drop shadow, while the two date
   calendars around it are sheets of ruled paper with a strip of tape. A reader
   who has been in this notebook for a while notices that. These pin the paper
   treatment so it cannot quietly go back to being a dark bar. */

const C2 = readFileSync(new URL('../css/components2.css', import.meta.url), 'utf8');
/* The file's own line ending, so the line-splitting above finds lines on both
   CRLF and LF checkouts instead of returning the whole document as one. */
/* The file's own line ending, so the line-splitting in the test below finds lines on both a CRLF and an LF checkout instead of returning the whole
   document as one line. */
const NEWLINE = readFileSync(new URL('../index.html', import.meta.url), 'utf8').includes('\r\n') ? '\r\n' : '\n';
const ruleOf = (css, sel) => {
  const i = css.indexOf(sel + '{');
  if (i < 0) return null;
  return css.slice(i, css.indexOf('}', i));
};

const BASE_CSS = readFileSync(new URL('../css/base.css', import.meta.url), 'utf8');
const PROF_CSS = readFileSync(new URL('../css/profile.css', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/* Every rule for a selector, wherever it appears — including inside a media
   query. ruleOf returns only the first, which is exactly what hid this bug: the
   first .theme-btn is the 44px one, the second lives at max-width:480px and says
   40px, and a test that reads the first one sees a correct stylesheet. */
const allRulesOf = (css, sel) => {
  const out = [];
  let i = css.indexOf(sel + '{');
  while (i >= 0) {
    out.push(css.slice(i, css.indexOf('}', i)));
    i = css.indexOf(sel + '{', i + 1);
  }
  return out;
};

/* The mobile bug this covers: the theme button and the profile button sit side by
   side in the top corner, and only one of them had a mobile rule shrinking it to
   40px — .theme-btn, in css/base.css, under @media (max-width:480px). The avatar
   lives in css/profile.css and never got one, so below 480px every phone rendered
   a 44px button beside a 40px one. The wrapper made it worse: it was an inline
   display:flex with no align-items, so the smaller box hung off the top of the
   row instead of sitting level with its neighbour.

   Neither half of that is visible to a test that reads a single rule, which is
   why both are checked here: every declaration of the size has to agree, and the
   row they share has to say how it aligns them. */
test('the two buttons in the top corner stay the same size and level', () => {
  for (const [css, sel] of [[BASE_CSS, '.theme-btn'], [PROF_CSS, '.header-avatar']]) {
    const rules = allRulesOf(css, sel);
    assert.ok(rules.length > 0, sel + ' has no rule of its own');
    for (const rule of rules) {
      assert.match(rule, /width:44px;height:44px/,
        sel + ' is declared at two sizes — one in the base rule and one inside a ' +
        'breakpoint. Its partner has only one of those, so below that width the ' +
        'pair renders unequal. Offending rule: ' + rule.slice(0, 120));
    }
  }

  /* The row they share. align-items is the part that was missing: without it the
     shorter button sits flush to the top of the row and the pair looks crooked
     even when the widths happen to match. */
  const row = ruleOf(BASE_CSS, '.header-actions');
  assert.ok(row, 'no .header-actions rule — the pair has no shared row to align in');
  assert.match(row, /display:flex/);
  assert.match(row, /align-items:center/);
  assert.match(ruleOf(BASE_CSS, '.header-actions>*'), /flex-shrink:0/,
    'a squeezed 44px target on a narrow phone is a 40px target in all but name');

  /* And the class has to be on all three headers, not just one of them. */
  const rows = (HTML.match(/class="header-actions"/g) || []).length;
  const pairs = (HTML.match(/class="theme-btn"/g) || []).length;
  assert.equal(rows, pairs,
    'every header with a theme button needs the shared row, or that header keeps the old inline style');
  assert.ok(rows >= 3, 'the three page headers each carry the pair');
  assert.doesNotMatch(HTML, /<div style="display:flex;gap:8px">/,
    'the inline wrapper is back; alignment belongs in the stylesheet, declared once');
});

test('one sheet of paper, and every one of these is it', () => {
  /* The notebook has a piece of paper, and this app has four places that are one:
     the two date calendars, the birthday greeting and the update note. They used
     to spell the recipe out between them — a 22px ruled gradient in two files and a
     slightly different one at a different pitch in a third, plus three separate
     strips of tape in three sizes — which is four chances for «the same vibe» to
     quietly stop being true.

     So the recipe moved to .sheet-paper in css/base.css, and what is asserted here
     is that each of the four actually reads it. Compared literally, because
     «looks like paper» is not a thing a test can check and «declares sheet-paper, which
     is where the paper is written» is.

     The recipe itself is asserted once, in the next test, rather than four times:
     four assertions of the same gradient would pass just as happily if the
     gradient were something else entirely. */
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['updateToast', 'storageToast']) {
    const at = HTML.indexOf('id="' + id + '"');
    assert.ok(at > 0, id + ' is gone from index.html');
    /* Backwards from the id, because the class attribute is what is being
       asserted and it is written first in all four of these elements. */
    const tag = HTML.slice(0, at).split(NEWLINE).pop();
    assert.match(tag, /\bsheet-paper\b/,
      id + ' is not marked as paper, so it will not be paper');
  }
  assert.ok(ruleOf(CSS, '.cal-card'), 'css/overlays.css has no .cal-card rule at all');
  /* The deadline picker's card is the fifth, checked by name because it is the
     one with no id of its own to hang the assertion on. */
  assert.match(HTML, /class="name-card cal-card due-card sheet-paper"/);
  assert.match(HTML, /class="bd-card sheet-paper"/);
  /* The name card is the seventh and the first one anybody sees. It shares the
     .name-card class with five dialogs that are NOT sheets of this notebook — the
     goal sheet, the avatar picker, two achievement cards and the profile one —
     which is why the class is added here and nowhere in the stylesheet. */
  assert.match(HTML, /<div class="name-card sheet-paper" id="nameCard"/);
});

test('the name card is paper with a line to write on, not a form on a card', () => {
  /* This is the only card in the app that asks the reader to put something on the
     page themselves, so it is the one card where a boxed input is wrong: a field
     drawn on ruled paper reads as a web form laid on top of a notebook. An empty
     space with one rule under it reads as the place a name goes.

     The id rules exist for one reason, load order: .name-card is declared later in
     the same file at equal weight, so its own background would beat .sheet-paper's
     and the paper would never be seen. Measured before this: card background
     rgba(0,0,0,0) and a tape of 0x0 — the class was declared and did nothing. */
  const input = ruleOf(CSS, '#nameCard input');
  assert.ok(input, 'css/overlays.css has no #nameCard input rule');
  assert.match(input, /border-bottom:2px solid/, 'the writing line is the underline itself');
  assert.doesNotMatch(input, /border:1.5px/, 'and not a box drawn around the space');
  assert.match(input, /background:transparent/, 'the paper shows through where the box used to be');
  /* 48px, because taking the box away must not take the target with it. */
  assert.match(input, /min-height:48px/);
  /* Both focus signals, deliberately: colour alone fails a reader who cannot see
     the change, an outline alone fails a reader looking at the text. */
  assert.match(ruleOf(CSS, '#nameCard input:focus'), /border-bottom-color:var\(--color-accent\)/);
  assert.match(ruleOf(CSS, '#nameCard input:focus-visible'), /outline:2px solid/);
  /* And the button ink: a literal #fff is unreadable in the palettes whose accent
     is light, and this is the first thing anybody reads. */
  assert.match(ruleOf(CSS, '#nameCard .go'), /color:var\(--color-text-on-accent\)/);
  /* And the way out: ««بعداً می‌گم»» is what makes the card safe to open, and it measured 20px — the smallest target on the first
     screen of the app, on the one control whose whole job is being easy to hit. */
  assert.match(ruleOf(CSS, '#nameCard .skip'), /min-height:44px/);
});

test('the recipe lives in one place, and it is ruled paper with tape on it', () => {
  const BASE = readFileSync(new URL('../css/base.css', import.meta.url), 'utf8');
  const paper = ruleOf(BASE, '.sheet-paper');
  assert.ok(paper, 'css/base.css has no .sheet-paper rule — the shared recipe is gone');
  assert.match(paper, /var\(--sheet-paper\)/, 'the sheet must be the shared background token');
  assert.match(paper, /var\(--color-text-primary\)/, 'with the ordinary ink, not the dark-toast ink');
  assert.match(paper, /overflow:visible/,
    'a clipped sheet has no tape, since the tape hangs off the top edge on purpose');
  /* No drop shadow. --shadow-2 is a 50px warm-brown blur, and on a sheet this
     size it reads as an orange glow spilling past the edges rather than as the
     shadow one page casts on the next — asked for and removed. The tape carries
     the lift instead, and the border keeps the edge. */
  assert.match(paper, /box-shadow:none/,
    'the warm halo is back around the sheet');
  assert.doesNotMatch(paper, /var\(--shadow-2\)/);

  /* The recipe losing is not the same as the halo being gone. Every one of these
     classes is also declared somewhere later in the cascade — .name-card carries
     --shadow-2, and so does .toast — and at equal weight the later one wins.
     So each sheet that inherits one of those has to say box-shadow:none
     itself, and that is exactly what was measured coming back. */
  for (const [file, sel] of [['../css/overlays.css', '#nameCard'],
                              ['../css/overlays.css', '.cal-card'],
                              ['../css/components2.css', '.toast-sticky'],
                              ['../css/components2.css', 'html[data-mode="dark"] .toast-sticky']]) {
    const r = ruleOf(readFileSync(new URL(file, import.meta.url), 'utf8'), sel);
    assert.ok(r, sel + ' has no rule of its own in ' + file);
    assert.match(r, /box-shadow:none/,
      sel + ' inherits --shadow-2 from a later rule, so the warm halo survives there');
  }

  const rule = BASE.slice(BASE.indexOf('--sheet-rule:'));
  assert.match(rule, /repeating-linear-gradient/, 'the lines are the whole point');
  assert.match(rule, /22px/, 'and their pitch is fixed, so the text can sit on one');

  /* The tape: one token, one size, one tilt — checked on the recipe rather than on
     each of the four components, which is what makes it one strip rather than
     four that happen to agree today. */
  const tape = ruleOf(BASE, '.sheet-paper::before');
  assert.ok(tape, 'the sheet has no tape');
  assert.match(tape, /var\(--tape\)/);
  assert.match(tape, /--sheet-tape-w/);
  assert.match(tape, /--sheet-tape-h/);
  assert.match(tape, /rotate\(var\(--sheet-tape-tilt\)\)/);
  assert.match(BASE, /--sheet-tape-w:48px/);
  assert.match(BASE, /--sheet-tape-h:15px/);
  assert.match(BASE, /--sheet-tape-tilt:-2deg/);
});

test('no component may keep a private copy of the recipe', () => {
  /* The failure this guards against is not a wrong value, it is a second value:
     somebody adds a gradient to a sixth card, everything still looks right on the
     page they are looking at, and wrong on the other five. This file used to hold
     exactly that — css/today.css spelled out the hero's own gradient, identical to
     the calendar's down to the 22px pitch — so the hero read as themed glass next
     to a taped sheet of paper. Zero private copies is the rule; one is the recipe. */
  for (const f of ['components2.css', 'overlays.css', 'settings.css', 'tasks.css', 'today.css']) {
    const css = readFileSync(new URL('../css/' + f, import.meta.url), 'utf8');
    /* Comments are stripped first, by chopping at each opening marker rather
       than by matching one: prose about a gradient is not a second copy of one,
       and a rule that explains the recipe is allowed to name it. */
    const live = css.split('/*').map((part, i) => (i === 0 ? part : part.slice(part.indexOf('*/') + 2))).join('');
    const n = (live.match(/repeating-linear-gradient/g) || []).length;
    assert.equal(n, 0,
      `css/${f} spells out a ruled gradient of its own; the sheet recipe in css/base.css is the only one allowed to`);
  }
  /* And the hero is on the shared recipe rather than merely free of its own: a
     component can drop its gradient and still end up a bare rounded box. */
  const TODAY = readFileSync(new URL('../js/today.js', import.meta.url), 'utf8');
  assert.match(TODAY, /class="frog-hero sheet-paper frog-empty/,
    'the empty-state hero must be paper too — it is the same card');
  assert.match(TODAY, /class="frog-hero sheet-paper"/,
    'and so must the hero with a task on it');
});

test('the greeting card stops clipping, which is what was hiding its tape', () => {
  /* REGRESSION: .bd-card carried overflow:hidden while .bd-card::before sat at
     top:-8px — outside the box. The two cancelled out, so the card shipped with no
     tape on it at all while the rule that drew the tape sat in the file looking
     perfectly correct. Nothing about the card looked broken; it was simply not
     the object it claimed to be. This is .sheet-paper's overflow:visible now. */
  const bd = ruleOf(CSS, '.bd-card');
  assert.ok(bd, 'css/overlays.css has no .bd-card rule');
  assert.doesNotMatch(bd, /overflow:hidden/,
    'the greeting clips its own tape away — this is the bug the shared recipe fixed');
  assert.doesNotMatch(CSS, /\.bd-card::before\{/,
    'the tape must come from .sheet-paper, not from a private copy here');
});

test('the age is said only when there is a year to count from', () => {
  /* The card has to be able to say «۲۷ ساله‌ت», and it has to be able to say nothing at all. Both
     halves are js/birthday.js: null for a record with no year, and hidden at
     zero for a newborn, whose first calendar birthday is not an age anybody
     would print. A card that says «۰ ساله‌ت» has failed at being a greeting. */
  assert.equal(birthdayAge(TODAY, BDAY), 26, 'a year is all it takes to count');
  assert.equal(birthdayAge(TODAY, NOYEAR), null, 'no year, no age — never a guess');
  assert.equal(birthdayAge(TODAY, null), null);
  assert.equal(birthdayAge(TODAY, { y: 1500, m: 7, d: 12 }), null, 'a future year is not an age');
  /* Jalali years, so the answer does not wobble with where the year starts. */
  /* 1 January 2026 is Jalali 1404, not 1405 — the year the app is in does not
     start on 1 January, and an age that assumed it did would be a year out for
     three months of every year. */
  assert.equal(birthdayAge(new Date(2026, 0, 1), { y: 1399, m: 1, d: 2 }), 5);
  assert.match(BIRTH, /ageLine.hidden = age === null || age < 1/,
    'the line must leave the layout, not sit there empty');
  assert.match(CSS, /\.bd-age\[hidden]{display:none}/,
    'a hidden paragraph still takes its margin unless the rule says otherwise');
});

test('a year is taken, and a year nobody was born in is refused', () => {
  assert.deepEqual(normalizeBirthday({ y: 1379, m: 7, d: 12 }), { y: 1379, m: 7, d: 12 });
  assert.deepEqual(normalizeBirthday('1379/07/12'), { y: 1379, m: 7, d: 12 });
  assert.deepEqual(normalizeBirthday('1379/7/12'), { y: 1379, m: 7, d: 12 });
  assert.deepEqual(normalizeBirthday('۱۳۷۰۰۷۱۲'), { y: 1370, m: 7, d: 12 }, 'Persian digits, same answer');

  const now = dateToJalali(new Date()).jy;
  assert.equal(normalizeBirthday({ y: now + 1, m: 7, d: 12 }), null, 'nobody is born next year');
  assert.equal(normalizeBirthday({ y: MIN_BIRTH_YEAR - 1, m: 7, d: 12 }), null,
    'and nobody before the picker had an opinion about it either');
  assert.deepEqual(normalizeBirthday({ y: MIN_BIRTH_YEAR, m: 7, d: 12 }),
    { y: MIN_BIRTH_YEAR, m: 7, d: 12 }, 'the bound itself is a real year');
  /* One bound, not two: the picker steps with the same number it stops at. */
  assert.match(BIRTH, /export const MIN_BIRTH_YEAR = 1250/);
  assert.match(BIRTH, /back.disabled = shown <= MIN_BIRTH_YEAR/);
});

test('the greeting turns on the month and day, and never on the year', () => {
  /* The year was added so the card could count with it. If it leaked into the
     key, next year would find this year'+'s record, decide it had already
     greeted, and say nothing — once, and then never again. */
  assert.equal(birthdayKey(TODAY, BDAY), '07-12');
  assert.equal(birthdayKey(TODAY, NOYEAR), '07-12');
  assert.equal(birthdayKey(TODAY, BDAY), birthdayKey(TODAY, NOYEAR),
    'the year must make no difference to which day this is');
  assert.equal(birthdayKey(TODAY, BDAY).length, 5, 'still a bare MM-DD');
  /* A record written before the year was ever asked for keeps greeting. */
  assert.equal(isBirthday(TODAY, NOYEAR, ''), true);
  assert.equal(isBirthday(TODAY, BDAY, '07-12'), false, 'today was already greeted');
});

test('the year is chosen from a decade grid, and declining it is still allowed', () => {
  /* There was a fourth button on this row that read «I do not know». Removing it
     is safe only if the year is still optional without it, and the way this file
     guarantees that is by never writing a year the reader did not choose: the
     year button reads «سال؟» until one is stored, and pickDay stores whatever
     pickYear holds — null included. */
  assert.match(BIRTH, /pickYear = stored \? stored\.y : null/,
    'opening must not invent a year');
  assert.match(BIRTH, /normalizeBirthday\(\{ y: pickYear, m, d \}\)/,
    'what gets stored is the answer to the year question, not the year on screen');
  assert.match(BIRTH, /pickYear === null \? 'سال؟'/,
    'with no year stored the button has to say so, or it is claiming one the reader never chose');
  assert.doesNotMatch(BIRTH, /aria-pressed/,
    'that belonged to the removed button; nothing on this row is a toggle any more');

  /* The grid it opens: a decade, five across, so it fills its own rows and fits
     the card the month grid already fits. Ten years is the unit a person keeps a
     birth year in, which is why it is a decade and not a century. */
  assert.match(BIRTH, /const YEARS_PER_PAGE = 10/);
  assert.match(BIRTH, /const YEAR_COLS = 5/);
  assert.match(BIRTH, /const decadeOf = y => Math\.floor\(y \/ 10\) \* 10/);
  assert.match(BIRTH, /now\.onclick = openYearGrid/,
    'the year button is the way into the grid, so it has to be wired to it');

  /* The bounds are the two the stepper used, and they are asserted rather than
     assumed: the picker must reach 1250 and must not be able to reach next year,
     because normalizeBirthday refuses the years above it anyway. */
  assert.match(BIRTH, /stepDecade[\s\S]*?if \(next < MIN_BIRTH_YEAR \|\| next \+ YEARS_PER_PAGE > thisYear \+ 1\) return;/,
    'paging a decade is bounded at both ends');
  assert.match(BIRTH, /if \(y > thisYear\) break;/,
    'future years are not drawn at all, not drawn disabled');

  /* Two variables, because browsing a decade is not choosing a year. This is the
     reason the grid does not simply set viewJY as it pages: a reader who browses
     to the sixties and presses «back» must land on the month they picked. */
  assert.match(BIRTH, /let decadeStart = 0/);
  assert.match(BIRTH, /function stepDecade\(dir\)/);
  const stepDecade = BIRTH.slice(BIRTH.indexOf('function stepDecade(dir)'));
  assert.doesNotMatch(stepDecade.slice(0, stepDecade.indexOf('function chooseYear')),
    /pickYear\s*=/,
    'paging a decade must not store a year the reader only looked at');
  assert.match(BIRTH, /pickYear = y;\n {2}viewJY = y;/,
    'choosing one moves both, because the month grid after it has to be true for that year');

  /* A roving tab stop, or the ten years are ten Tab presses — and the one that
     points at a year not on screen leaves the grid with none at all. */
  assert.match(BIRTH, /function activeYear\(\)/);
  assert.match(BIRTH, /y === active \? ' tabindex="0"' : ' tabindex="-1"'/);

  /* And the two states the dialog can be left in. */
  /* Bounded to the function, and this matters: the lazy form of this assertion
     — a non-greedy match from the function name to the first yearMode = false
     — passes even when the function does not set it, because closeYearGrid
     sets it too and comes later in the file. A test that cannot tell those
     two apart is decoration. */
  const closeAt = BIRTH.indexOf('function closeBirthdayPicker()');
  const closeBody = BIRTH.slice(closeAt, BIRTH.indexOf('}', closeAt));
  assert.ok(closeBody.includes('yearMode = false;'),
    'closing while in the year grid must not leave the next open on it');
  const branchAt = BIRTH.indexOf('if (yearMode) {');
  assert.ok(branchAt > 0, 'render() has no branch for the year grid');
  const retAt = BIRTH.indexOf('return;', branchAt);
  const monthAt = BIRTH.indexOf('renderMonthGrid(grid,', branchAt);
  assert.ok(retAt > branchAt && retAt < monthAt,
    'the year mode has to return before the month grid is drawn, or the year '
    + 'grid inherits a footer button that clears a date the reader came to keep');

  /* The month title carries the year, for the same reason the arrow keys
     announce it: «مهر» alone does not say which year the grid belongs to. */
  assert.match(BIRTH, /showYear: true/);
  /* And the month arrows have to read the month back out of the step. They did
     not: this file read stepMonth's result as .mm, which is not a field it has,
     so one press of ‹ set the month to undefined and redrew the grid from it.
     duepicker.js has always read .jm correctly. */
  assert.doesNotMatch(BIRTH, /n\.mm/,
    'stepMonth returns {jy, jm}; reading .mm sets the month to undefined');
  assert.match(BIRTH, /viewJY = n\.jy; viewJM = n\.jm;/);
});

test('the settings row says one thing and offers one control', () => {
  /* The card is «تاریخ تولد», the line is one sentence, the date itself is the
     button, and there is no «انتخاب» and no «پاک کردن» beside it. Clearing lives at the foot of
     the calendar now, where the reader is when they are looking at it. */
  const H = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(H, /<strong>تاریخ تولد<\/strong>/, 'the card names the thing, not the person');
  assert.doesNotMatch(H, /<strong>خودت<\/strong>/, '«خودت» is gone as a heading');
  assert.match(H, /دفترچه دوست داره تاریخ تولدتو بدونه!/);
  assert.doesNotMatch(H, /id="bdClear"/, 'the clear button goes back beside the date');
  assert.doesNotMatch(H, /id="bdPick"[^>]*>\s*انتخاب/,
    'and the date is the control again rather than a word next to it');
  assert.doesNotMatch(BIRTH, /\('#bdClear'\)/, 'js/birthday.js must not look for a button that is gone');
  /* A real button, not a span with a handler on it: it is the only way to
     reach this feature from the keyboard now. */
  assert.match(H, /<button class="bd-date" id="bdPick"[^>]*aria-haspopup="dialog">/);
  const SCSS = readFileSync(new URL('../css/settings.css', import.meta.url), 'utf8');
  assert.match(ruleOf(SCSS, '.bd-date'), /min-height:44px/,
    'the one control this row has has to be finger-sized');
});
test('the note must not clip its own tape', () => {
  /* .toast clips with overflow:hidden so its progress bar cannot escape the
     rounded corner. The sticky variant has no bar but has a tape that hangs
     7px off the top edge on purpose, so it must opt out — measured with it
     clipped: the tape is simply not there, and the note reads as the plain
     rectangle this change was made to replace. */
  const toast = ruleOf(C2, '.toast-sticky');
  assert.match(toast, /overflow:visible/, 'clipping the note hides the tape entirely');
  /* fixed, not relative: .toast pins the note to the bottom of the screen, and
     .toast-sticky is the later rule at equal weight, so anything else silently
     turns a note that waits for an answer into one that scrolls away with the
     page — found measuring at 320px, where it landed 1024px down a 640px
     viewport. fixed also gives the tape the containing block it needs. */
  assert.match(toast, /position:fixed/,
    'the note must stay pinned to the bottom, not scroll with the page');
  /* And it must own its centring. .toast centres with inset-inline-start:50%
     plus a +50% translate, which leaves only half the viewport as the available
     width of a shrink-to-fit box — measured at 320px the note clamped itself to
     152px and set «نسخَ» on one line and «جدید» on the next. Two insets
     and an auto margin are the centring that does not eat the box. */
  assert.match(toast, /inset-inline:16px/, 'the note inherits a centring that starves it of width');
  assert.match(toast, /margin-inline:auto/);
  assert.match(toast, /width:fit-content/, 'without it the note stretches the full width instead of hugging its line');
  assert.doesNotMatch(toast, /inset-inline-start:50%/);
});

test('the note stacks rather than shattering the sentence on a narrow phone', () => {
  /* At 320px the line and the pill cannot share a row, and flex will not break it
     by itself — the text took whatever was left and broke mid-phrase. The note
     wraps instead, at the width where it was measured to stop fitting. */
  const start = C2.indexOf('@media (max-width:400px){');
  assert.ok(start > 0, 'the narrow-viewport rule is missing from css/components2.css');
  /* The whole query, not just its first rule: the wrap and the full-width line are
     separate declarations and either one alone leaves the sentence shattered. */
  const block = C2.slice(start, C2.indexOf('@media (hover', start));
  assert.match(block, /flex-wrap:wrap/, 'the note must wrap below the width it stops fitting at');
  assert.match(block, /flex:1 1 100%/, 'the line takes the full row so it is not squeezed');
  /* min-width:0 is what lets a flex item shrink past its longest word; without
     it the text column refuses to give the pill room. */
  const text = ruleOf(C2, '.toast-sticky .toast-text');
  assert.match(text, /min-width:0/, 'a flex item will not shrink below its longest word without this');
});

test('the note keeps the ink the palette declares for an accent', () => {
  /* The button was #fff, which is unreadable in seven of the nine palettes —
     the same defect the selected day in the calendar had. --color-text-on-accent
     is the token for it and every palette declares its own value. */
  const btn = ruleOf(C2, '.toast-sticky .toast-btn');
  assert.ok(btn, 'no .toast-sticky .toast-btn rule');
  assert.match(btn, /color:var\(--color-text-on-accent\)/);
  assert.doesNotMatch(btn, /color:#fff/i, 'a hardcoded ink is unreadable in most palettes');
  assert.match(btn, /min-height:44px/, 'the one control worth pressing keeps a full touch target');
});

test('the paper goes to the notes that wait for you, and only to those', () => {
  /* One rule, and this is where it is enforced: a toast that leaves on its own
     is a dark blip, a toast that stays is a note taped into the book. Splitting
     by subject instead — paper for the update prompt, dark for the storage
     warning — would make the treatment a matter of opinion, and the next sticky
     toast would be styled by whoever wrote it. */
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const toasts = [...HTML.matchAll(/<div class="([^"]*\btoast\b[^"]*)" id="([^"]+)"[\s\S]*?<\/div>/g)]
    .map((m) => ({ cls: m[1], id: m[2], body: m[0] }));
  assert.ok(toasts.length >= 5, `index.html declares ${toasts.length} toasts; the audit is looking at too few`);
  for (const t of toasts) {
    const sticky = /\btoast-sticky\b/.test(t.cls);
    if (/\btoast-bar\b/.test(t.body)) {
      assert.ok(!sticky, `${t.id} carries a dismiss bar, so it leaves on its own — it must stay a dark bar`);
    }
    if (sticky) {
      assert.match(t.body, /class="toast-btn"/,
        `${t.id} is paper, so it has to be something the reader answers`);
    }
  }
  /* Both notes that actually wait are on it, and neither is a dark bar. */
  for (const id of ['updateToast', 'storageToast']) {
    const t = toasts.find((x) => x.id === id);
    assert.ok(t, `${id} is gone from index.html`);
    assert.match(t.cls, /\btoast-sticky\b/, `${id} waits for an answer and must be paper`);
  }
});
