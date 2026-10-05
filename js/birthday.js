/* ═══ Birthday — one day a year, and only because the reader asked ═══
   A date someone writes down themselves, and the single day of the year the app
   does something it never does otherwise.

   Four decisions carry the whole feature, and each is a refusal as much as a
   choice.

   **It is opt-in and silent.** Nothing here ever asks for the date, and no hint
   of it exists outside the one settings row the reader has to open and find. An
   app that says «تولد کیه؟ تا بهت تبریک بگم» is trading a personal fact for a
   decoration, and the answer it deserves is no. The row sits quietly, says what
   the date is for, and the only moment the app acknowledges it is the day.

   **The 24 hours are the reader's calendar day**, not twenty-four hours counted
   from whenever the app happened to be open. Someone who opens the notebook at
   23:40 on their birthday gets the whole evening; someone who opens it at 00:20
   gets the rest of that day. The occasion is the day, not the session — so the
   test is a plain comparison of month and day on the device's own clock.

   **The greeting happens once.** The day it was shown is written down beside the
   date itself, so opening the app five times in one day is still one greeting.
   That record is a bare MM-DD with no year, and that is exactly why next year's
   still arrives: nothing about it has to expire.

   **The theme is a day, not a ninth theme.** It rides on the root as
   data-day=birthday, painted from the palette table like anything else, and it is
   deliberately absent from THEMES: the reader never chose it, so it must not
   appear in the picker, and when the day is over it is simply removed — their own
   theme is exactly where they left it, because it was never replaced.

   Everything with a date in it is a pure function, so the rule can be tested by
   feeding it dates instead of waiting a year for one. */

import { dateToJalali, jalaliToDate, jalaliDaysInMonth, JALALI_MONTHS } from "./jalali.js";
import { $, faDigits } from "./utils.js";
import { renderMonthGrid, renderMonthHead, stepMonth, walkGridKeys } from "./jalalical.js";
import { loadName } from "./store.js";
import { loadBirthday, saveBirthday, loadBirthdaySeen, saveBirthdaySeen } from "./store.js";
import { qorqoriMarkup } from "./qorqori.js";

const DAY = "birthday";

/* The oldest year the picker will offer. Jalali 1250 is the 1300s in the
   Gregorian calendar, so this allows a reader to be 130 and no more — old enough
   that nobody legitimate is refused, new enough that the year cannot be a typo
   four digits wide. Exported because the picker bounds its stepper with it and
   the tests pin it, and a bound that lives in two places is a bound that will
   be changed in one of them. */
export const MIN_BIRTH_YEAR = 1250;

/* ── The stored shape ──
   A Jalali Y-M-D, with the year optional. The month and day are what the
   greeting turns on — the same day every year, which is why the year is never
   part of the greeting key — but knowing it is what lets the card say «۲۷
   ساله‌ت» instead of the same words every year.

   So the year is stored when the reader gives it and absent when they do not,
   and both are valid. That is the whole contract: an existing record with no
   year keeps working unchanged, the greeting gets more precise, and nobody is
   made to hand over a year they would rather not say.

   A day that cannot exist in the month it claims is refused — accepting «۳۱
   تیر» would mean the greeting silently never arrives, and nobody could
   tell why. */
export function normalizeBirthday(raw) {
  if (raw === null || raw === undefined || raw === '') return null;

  let m = raw.m, d = raw.d, y = raw.y;

  /* A string is a date as a person writes or says it: «۱۲/۰۷», «۱۲-۰۷», «۰۷/۱۲», and with a year in
     front «۱۳۷۰/۰۷/۱۲». Digits are pulled out of all of it and read by how many there
     are:

       eight year month day, both zero-padded — «۱۳۷۰/۰۷/۱۲», ۱۳۷۰۰۷۱۲
       six   the same with a bare month, ۱۳۷۰۷۱۲
             — the year is four digits and is read first, because it is the
             only unambiguous place to start: a leading run of three or four
             cannot be a month.
       four  month day — the form the settings row has always handed over.
       three a one-digit month and a two-digit day — the same date with the
             leading zero left off.
       two   refused.

     Two digits can only be split by guessing which half was meant, and a
     guess that quietly lands on ۱۲/۱۲ is worse than no answer. */
  if (typeof raw === 'string') {
    const fa = '۰۱۲۳۴۵۶۷۸۹';
    const digits = raw
      .replace(/[^0-9۰-۹]/g, '')
      .replace(/[۰-۹]/g, ch => String(fa.indexOf(ch)))
      .slice(0, 8);
    if (digits.length >= 6) {
      y = Number(digits.slice(0, 4));
      m = Number(digits.slice(4, digits.length === 8 ? 6 : 5));
      d = Number(digits.slice(-2));
    } else if (digits.length === 4) {
      m = Number(digits.slice(0, 2));
      d = Number(digits.slice(2));
    } else if (digits.length === 3) {
      m = Number(digits.slice(0, 1));
      d = Number(digits.slice(1));
    } else return null;
  }

  m = Math.floor(Number(m));
  d = Math.floor(Number(d));
  if (!Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  /* The year is optional, and when it is there it has to be a year somebody could
     have been born in: not in the future, and not before this calendar was in use
     at all. Both bounds are refused rather than stored, because a wrong year here
     produces a card that says the reader is four years old or ninety — and a
     card that greets once has no second chance to correct itself.

     The upper bound is this year, not a constant, and that is the one place the
     function reads the clock. It has to: a birthday next year is a birthday, and
     refusing a year because it was written in an earlier version of this file
     would be refusing the reader their own age. */
  let ny = null;
  if (y !== null && y !== undefined && y !== '') {
    ny = Math.floor(Number(y));
    if (!Number.isInteger(ny) || ny < MIN_BIRTH_YEAR) return null;
    if (ny > dateToJalali(new Date()).jy) return null;
  }

  /* The ceiling is the longest the month can ever be, and that is what keeps 30
     Esfand. Esfand is 29 days in a common year and 30 in a leap one; no year is
     consulted here, and none should be, because a birthday is the same day every
     year. Asking one particular year instead — and 1404, the year this was first
     written in, is a common one — would refuse 30 Esfand outright on this device and
     accept it on someone else's, for a date the calendar only sometimes has. */
  if (d > (m < 7 ? 31 : 30)) return null;
  /* y is null rather than absent when the reader did not give one, so the stored
     record always has the same three keys and two code paths that both mean
     «no year» cannot drift apart. */
  return ny === null ? { y: null, m, d } : { y: ny, m, d };
}

const pad2 = n => String(n).padStart(2, '0');

/* The key a greeting is recorded under, or null when the day is not today. One
   function, so the greeter and the record can never disagree about which day they
   are talking about. */
export function birthdayKey(date, stored) {
  const b = normalizeBirthday(stored);
  if (!b) return null;
  const j = dateToJalali(date);
  return j.jm === b.m && j.jd === b.d ? pad2(j.jm) + '-' + pad2(j.jd) : null;
}

/* How old the reader turned on a given date, or null when there is no year to go
   on. Deliberately in Jalali years, because that is the calendar they think in:
   a Persian birthday is the same number every year and does not depend on where
   the year happens to start relative to the Gregorian one.

   Exact on the day, and only on the day. On 1379/07/12 the answer is 1379-1370
   with no counting and no birthday-has-not-happened-yet correction — the caller
   only ever asks about a date the birthday key already matched, so the one case
   that correction exists for cannot arrive. It is also why this returns null
   rather than a guess: a card that says «۳س ساله‌ت» to somebody whose year was never
   recorded is worse than a card that says nothing about the age at all. */
export function birthdayAge(date, stored) {
  const b = normalizeBirthday(stored);
  if (!b || b.y === null) return null;
  const age = dateToJalali(date).jy - b.y;
  return age >= 0 ? age : null;
}

/* Is this the day, and has it not already been greeted? The whole feature in one
   predicate — which is also what the tests drive. */
export function isBirthday(date, stored, seen) {
  const key = birthdayKey(date, stored);
  return !!key && key !== seen;
}

/* ── The day on the document ──
   data-day is the root third face, after the theme and the mode. Setting it is the
   entire mechanism; removing it is the entire way back. Nothing about the theme
   itself is touched, so the reader own colours are still underneath. */
export function applyBirthdayDay(active) {
  const root = document.documentElement;
  if (!root) return;
  if (active) root.dataset.day = DAY;
  else delete root.dataset.day;
}

/* ── The one entry point ──
   Called at boot and again whenever the date turns while the app is open.
   Idempotent by construction: once a day has been greeted and recorded, every later
   call the same day finds the record and returns, so a re-render, a navigation or a
   resumed session can never greet anyone twice. */
export function checkBirthday(opts) {
  const o = opts || {};
  const now = o.now || new Date();
  const stored = (o && "stored" in o) ? o.stored : loadBirthday();
  const seen = (o && "seen" in o) ? o.seen : loadBirthdaySeen();

  /* Two questions, and the order they are asked in is the whole feature.

     First: is it today? That decides the colours, and it stays true for every
     hour of the reader's calendar day. Second: has the greeting already been
     shown? That decides the card, and it stops being true the moment the day
     is written down.

     Asking only the second — which is all one boolean can say — means that reopening
     the app at noon on your birthday takes the day's colours away again. The
     occasion is the day, not the session, so the day has to be re-applied from
     the first question and only the card is allowed to be one-shot. */
  const today = !!birthdayKey(now, stored);
  applyBirthdayDay(today);
  if (!today || !isBirthday(now, stored, seen)) return false;

  /* Written down before the sheet is shown, not after it is dismissed: a reader
     who closes the tab on the greeting has still been greeted, and must not find
     the same card waiting for them tomorrow. */
  const key = birthdayKey(now, stored);
  if (!o.dryRun) saveBirthdaySeen(key);

  if (!o.dryRun) showBirthdayCard(o.after);
  return true;
}


/* ── The greeting itself ──
   The one moment the app acknowledges the date, and it is built from parts the
   app already has: the .overlay contract every other dialog uses, the same
   ruled-paper surface as the Decision card, and قورقوری already celebrating.

   The name is the reader's own and is written with textContent. It came out of
   a field they typed into, so it is never interpolated into markup — a reader
   whose name contains an angle bracket gets a bracket, not an element. */
function showBirthdayCard(after) {
  const overlay = $('#bdOverlay');
  if (!overlay) return;

  const char = $('#bdChar');
  const name = $('#bdName');
  if (char) char.innerHTML = qorqoriMarkup('celebrating');

  const who = loadName().trim();
  if (name) {
    /* With no name set the line is simply left empty rather than showing a
       placeholder: «تولدت مبارک» is the greeting, and the name was never
       asked for. */
    name.textContent = who;
    name.hidden = !who;
  }

  /* The age, if the reader gave a year to work it out from. This is the only
     reason the calendar asks for one: without it the card says the same words
     every year, and «۲۷ ساله‌ت» is the one thing a birthday greeting has that a
     reminder does not.

     Shown from the first birthday onwards and never at zero. A reader whose year
     is this one is somebody's newborn, and «۰ ساله‌ت» on their first calendar birthday is a
     joke that lands as a bug. The line is removed from the layout entirely
     rather than left blank, so the card does not carry a gap for a sentence it
     decided not to say. */
  const ageLine = $('#bdAge');
  if (ageLine) {
    const age = birthdayAge(new Date(), loadBirthday());
    ageLine.textContent = age === null ? '' : faDigits(age) + ' ساله‌ت';
    ageLine.hidden = age === null || age < 1;
  }

  /* Both ways out detach both listeners. Escape is the reason this is explicit:
     `{ once: true }` on the click would only be consumed if the reader pressed
     the button, so anyone who closed the card with the keyboard would carry a
     live listener into next year's card — and a second Escape would then close a
     card that was already gone. */
  const go = $('#bdGo');
  const close = () => {
    overlay.hidden = true;
    go?.removeEventListener('click', close);
    document.removeEventListener('keydown', onKey);
    if (typeof after === 'function') after();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };

  go?.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  overlay.hidden = false;
  go?.focus();
}

/* ── The settings row ──
   A month grid, not a text field. «۰۷/۱۲» is a format nobody remembers under
   pressure and gets rejected for getting the digits wrong; a calendar has no
   format to get wrong. The grid is the one js/duepicker.js already uses
   (js/jalalical.js), so the two calendars in this app can never disagree about
   where a month starts.

   Two things are deliberately different from the deadline picker:

     · there is a year stepper above the grid, because a birthday is the one date
       here whose year is worth knowing: it is the only thing that lets the
       greeting say how many years this is. It was absent before, and the month
       title carried no year to compensate — the stored date was MM-DD, so a year
       printed there would have been thrown away.
     · there are no «today / tomorrow» buttons. Those answer «how soon is this
       due?», which is a question about a deadline and not about a birthday.

   The year is still optional, but it stopped saying so with a button. There used
   to be a fourth control that read «I do not know», and it was defensible: a
   reader who set a month and a day without a year still got the greeting they
   were promised. What it actually produced was a row of four buttons where one
   of them meant «leave this alone», and a button whose whole job is to be
   pressed when nothing is wanted is a button that gets pressed by accident.
   Saying nothing about the year now says the same thing: the button reads
   «سال؟» until a year is chosen, and a reader who walks past it stores no year
   and still gets their greeting. */
let viewJY = 0, viewJM = 1;

/* The year the reader is choosing, kept separately from viewJY. They are not the
   same thing, and the difference is the whole reason this works:

     viewJY is the year the grid is DRAWN in, because a month has a different
     shape and different weekdays in different years — اسفند is 29 days in a common
     year and 30 in a leap one, and the grid must not lie about that.
     pickYear is the year that gets STORED, or null for «I don't know».

   So stepping the year moves both — the grid has to follow, or it would be offering
   days from the wrong year — while pressing the skip button moves only pickYear and
   leaves the grid where it is. Reading one off the other is what made this worth
   spelling out: with a single variable, «I don't know» cannot be expressed without
   pretending the grid is in some year the reader never chose. */
let pickYear = null;

/* The day the arrow keys are standing on, and where a repaint should put focus
   back to. Null means «nowhere in particular», and every repaint falls back to
   the chosen day — so this only has to be set when focus is genuinely moving. */
let rovingKey = null;
let restoreFocus = null;
let wantsAutofocus = false;

/* The chosen day as the grid's own key, or null. One helper because the grid,
   the settings row and the roving tab stop all have to agree on which day is
   selected, and three separate pad2() calls are three chances to disagree. */
function storedKey() {
  const stored = normalizeBirthday(loadBirthday());
  return stored ? pad2(stored.m) + '-' + pad2(stored.d) : null;
}

/* The day Tab should land on in the month about to be drawn, or null if this
   file has no opinion.

   Every candidate is checked against the month on screen, and that check is the
   whole function. rovingKey survives between openings on purpose — it is where
   the reader walked to — but the month they walked to is not necessarily the
   month the next opening shows: close on آبان after looking there, and reopening
   goes back to the stored month in مهر. Handing the grid a key that names no day
   in it makes renderMonthGrid fall through to «no day matches», every button
   comes out tabindex="-1", and the calendar becomes something a keyboard can
   only reach by clicking. That was measured, not assumed: reopening after
   arrowing to another month left zero Tab stops in the grid.

   The fallback chain is the same one the reader would choose: where the cursor
   already is, else the date they came to set, else today if it is on screen,
   else the first of the month. */
function activeDayKey() {
  const inView = k => !!k && k.slice(0, 2) === pad2(viewJM);
  return [rovingKey, storedKey(), todayInView()].find(inView)
    || bdKeyOf(viewJY, viewJM, 1);
}

function openBirthdayPicker() {
  const overlay = $('#bdPickOverlay');
  const cal = $('#bdCal');
  if (!overlay || !cal || !overlay.hidden) return;

  const stored = normalizeBirthday(loadBirthday());
  /* The grid follows the reader's own year, and shows no year in its title.
     Both are the same point: the stored date is a month and a day, so the reader
     picks a month and a day. Following the real year is what keeps the weekday
     columns true — pin the grid to any other year and every one of the twelve
     months would mislabel which day falls on which column, which is exactly the
     kind of wrong a person checks their birthday against. */
  viewJY = dateToJalali(new Date()).jy;
  viewJM = stored ? stored.m : dateToJalali(new Date()).jm;
  /* Opening on a year the reader chose nothing about would store a wrong one by
     accident, so an absent year opens on this year — visible in the stepper and
     adjustable — rather than on some invented default birth year. The record
     stays yearless unless the reader walks the stepper or presses «this year». */
  pickYear = stored ? stored.y : null;
  if (pickYear !== null) viewJY = pickYear;

  /* Focus starts on the day the reader came to change, and it is asked for with
     the attribute js/modal.js already looks for rather than with a focus()
     call. The reason is order: modal.js watches every dialog's hidden attribute
     and puts focus where it thinks it belongs the moment it opens, which is
     after this function returns — so a focus() call made here is silently
     undone a few milliseconds later. What it puts focus on, with nothing asked,
     is the first control in the card, which is the ‹ arrow. That means opening
     the calendar and pressing ArrowRight moved the month instead of the day,
     and Tab started from the top. Marking the day says «this one» in the only
     language modal.js reads. */
  /* render() cannot be trusted to leave anything alone: renderMonthHead writes
     over the whole of #bdCal's markup, so the grid from the last open is gone
     by the time this function gets to the buttons below. Hence the flag, and
     hence render() applying it to the buttons it just drew. */
  wantsAutofocus = true;
  render();
  overlay.hidden = false;
}

function closeBirthdayPicker() {
  const overlay = $('#bdPickOverlay');
  if (overlay) overlay.hidden = true;
  /* Every way out of this dialog goes through here — the close button, the scrim,
     Escape, and the two that close it after acting — so this is the one place
     the axis has to be reset. It was not, and the symptom was a reader who
     pressed «بستن» while looking at the year grid and found the year grid again
     on reopening, having asked for their birthday. Measured, not guessed. */
  yearMode = false;
}

/* A day here is identified by MM-DD — the same shape it is stored in — so the
   selection survives a repaint without translating anything. */
const bdKeyOf = (jy, jm, jd) => pad2(jm) + '-' + pad2(jd);
const bdLabelOf = (jy, jm, jd) => faDigits(jd) + ' ' + JALALI_MONTHS[jm - 1];

/* ── The year row ──
   Three controls and one number, in this order and for these reasons:

     ‹ year   walks back one year, and is disabled at the oldest year anybody
              could have been born in. Not at 1: an unbounded stepper invites a
              reader who slips to ۳۰۰ into a birthday the app will then greet
              them on for the next three centuries.
     ۱۴۰۵     the year itself, and a button — the way in to the year grid, which
              shows a decade at a time. It reads the year that is STORED rather
              than the one the month grid below happens to be drawn in, because
              those two are allowed to differ and a button showing the second
              would be claiming a birth year the reader never chose. With nothing
              stored it reads «سال؟», which is the whole of what the removed
              fourth button used to say.
     year ›   walks forward one year, disabled at this year, because nobody is
              born in the future and letting the stepper go there would store a
              year normalizeBirthday then refuses.

   The arrows stayed even though the year grid can now set a year too, because
   they are the same job in a different currency: one press is one year, which
   beats paging a decade and hunting when the year is close to the one on
   screen. Both name what they do in their accessible label, which is the test
   this project holds its own two-controls-for-one-job rule to — they are not
   two silent ways to do the same thing.

   Pressing an arrow also moves viewJY, because the grid below has to show the
   year the reader is choosing — Esfand is a different length either way. That
   is why this is drawn inside render() rather than kept beside it: one repaint,
   one truth. */
function yearRow() {
  const thisYear = dateToJalali(new Date()).jy;
  const shown = viewJY;

  const row = document.createElement('div');
  row.className = 'bd-year';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'سال تولد');

  const back = yearBtn('‹', 'یک سال قبل', 'bd-year-step');
  back.disabled = shown <= MIN_BIRTH_YEAR;
  back.onclick = () => { stepYear(-1); };

  /* It reads the year that is STORED, not the one the month grid is drawn in.
     The two can differ on purpose — the month grid follows viewJY so its
     weekdays are true, while a yearless record leaves pickYear at null — and a
     button showing viewJY would be claiming a birth year the reader never
     chose. «سال؟» says what the removed fourth button said, without being a
     control that has to be pressed in order to mean it.

     No data-autofocus here, on purpose: the grid's chosen day claims that
     attribute in render(), and modal.js takes the first one it finds. Giving it
     to both would silently move the keyboard's landing point from the day the
     reader came to change to the year above it. */
  const now = yearBtn(pickYear === null ? 'سال؟' : faDigits(pickYear),
    pickYear === null ? 'سال تولدت را انتخاب کن'
                      : 'سال تولد: ' + faDigits(pickYear) + ' — انتخاب سال دیگر',
    'bd-year-now');
  now.onclick = openYearGrid;

  const fwd = yearBtn('›', 'یک سال بعد', 'bd-year-step');
  fwd.disabled = shown >= thisYear;
  fwd.onclick = () => { stepYear(1); };

  row.append(back, now, fwd);
  return row;
}

function yearBtn(text, label, cls) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.setAttribute('aria-label', label);
  return b;
}

/* One year, in both places at once. Kept as a function rather than inlined twice
   because «the number on the button» and «the number the grid is drawn in» must
   not be able to disagree — and a reader who steps to ۱۳۷۹ and then steps back to
   today has to end up with thisYear stored, not with one of the two. */
function stepYear(dir) {
  const thisYear = dateToJalali(new Date()).jy;
  const next = viewJY + dir;
  if (next < MIN_BIRTH_YEAR || next > thisYear) return;
  viewJY = next;
  pickYear = next;
  render();
  focusYearRow();
}

/* Put the keyboard back on the row after a repaint. Same reasoning as
   restoreFocus in the month arrows above, and for the same measured reason: a
   repaint deletes the button that had it, and the browser then drops focus to
   the body, where the arrow keys answer nothing. */
function focusYearRow() {
  const b = $('#bdCal')?.querySelector('.bd-year-now');
  if (b) b.focus();
}

/* ── The year grid ──
   Clicking the year opens this, and it is the same sheet of paper as the month
   grid underneath it with one axis left. Ten years, five across, a decade at a
   time.

   A decade rather than a century or a free-scrolling wheel, for three reasons
   that are really one reason: ten years is the unit a person keeps a birth year
   in — «the seventies» — so a reader who knows their decade finds it in one or
   two presses of the arrow; five across fits the card the month grid already
   fits without a single new breakpoint; and ten is a number that can be shown,
   so nothing here needs a slider or a spinner that hides the value being picked.

   It is a mode inside the same card rather than a second overlay. Two stacked
   dialogs means two focus traps, two Escape keys and two scrims to reason about,
   for a choice that takes one of maybe sixteen taps — and the reader never
   loses sight of the month they already picked, which is the thing they came
   here to confirm. Coming back is one button and it says «back to the month».

   Bounds are the same two the stepper used: MIN_BIRTH_YEAR at the bottom, this
   year at the top, because nobody is born in the future and normalizeBirthday
   refuses the years above it anyway. */
let yearMode = false;
/* The first year of the decade on screen. A separate variable from viewJY
   because paging the grid must not move the month: a reader browsing decades
   who then presses «back» should land on the month they chose, not on whatever
   year they happened to stop browsing in. */
let decadeStart = 0;

const decadeOf = y => Math.floor(y / 10) * 10;
const thisJalaliYear = () => dateToJalali(new Date()).jy;

function openYearGrid() {
  /* Opening on the decade that holds the stored year is the whole point of a
     decade grid — it is where the answer is — and with nothing stored, on this
     one, which is the decade a young reader is most likely in. */
  decadeStart = decadeOf(pickYear === null ? thisJalaliYear() : pickYear);
  yearMode = true;
  render();
  focusYearCell(activeYear());
}

function closeYearGrid() {
  yearMode = false;
  render();
  focusYearRow();
}

/* Which year the keyboard should land on when the grid opens or repaints: the
   one already chosen if it is on this page, else this year if it is, else the
   first year shown. Same fallback shape as activeDayKey, for the same reason —
   a roving tab stop pointing at a year that is not on screen leaves the grid
   with no Tab stop at all. */
function activeYear() {
  const last = decadeStart + YEARS_PER_PAGE - 1;
  const onScreen = y => y >= decadeStart && y <= last;
  return [pickYear, thisJalaliYear(), decadeStart].find(onScreen) ?? decadeStart;
}

const YEARS_PER_PAGE = 10;
const YEAR_COLS = 5;

function renderYearGrid(cal) {
  const thisYear = thisJalaliYear();
  const active = activeYear();

  /* The same head the month grid uses, with the same two arrows and the same
     live region — a decade is the thing that changed, so it is what the title
     announces. Reusing the classes rather than writing a second head is what
     makes this look like the same calendar instead of a second dialog that
     happens to be nearby. */
  cal.innerHTML = `
    <div class="cal-head">
      <button type="button" class="cal-nav" aria-label="دههٔ قبل"${decadeStart <= MIN_BIRTH_YEAR ? ' disabled' : ''}>‹</button>
      <strong class="cal-title" aria-live="polite">دههٔ ${faDigits(decadeStart)}</strong>
      <button type="button" class="cal-nav" aria-label="دههٔ بعد"${decadeStart + YEARS_PER_PAGE > thisYear ? ' disabled' : ''}>›</button>
    </div>
    <div class="bd-years" role="group" aria-label="سال‌های دههٔ ${faDigits(decadeStart)}"></div>`;

  const grid = cal.querySelector('.bd-years');
  for (let i = 0; i < YEARS_PER_PAGE; i++) {
    const y = decadeStart + i;
    /* Past years are not drawn at all rather than drawn disabled: a decade that
       runs into the future would show six years nobody can pick, and a reader
       counting cells to work out which ones are real would be doing arithmetic
       the picker should have done. */
    if (y > thisYear) break;
    const cls = ['bd-year-cell',
      y === thisYear ? 'now' : '',
      y === pickYear ? 'sel' : ''].filter(Boolean).join(' ');
    const tab = y === active ? ' tabindex="0"' : ' tabindex="-1"';
    grid.insertAdjacentHTML('beforeend',
      `<button type="button" class="${cls}" data-year="${y}" aria-label="سال ${faDigits(y)}"${tab}>${faDigits(y)}</button>`);
  }

  const [prev, next] = cal.querySelectorAll('.cal-head .cal-nav');
  if (prev) prev.onclick = () => stepDecade(-1);
  if (next) next.onclick = () => stepDecade(1);

  grid.querySelectorAll('.bd-year-cell').forEach(b => {
    b.onclick = () => chooseYear(Number(b.dataset.year));
  });

  /* Two ways out, because there are two things a reader might want next and only
     one of them is cancelling. «سال جاری» is the shortcut the middle button used
     to be — reaching this year from 1250 is thirteen presses of the arrow — and
     it stays hidden when this decade already holds it, for the same reason the
     month grid hides its quick buttons when they would be redundant. */
  const quick = document.createElement('div');
  quick.className = 'cal-quick';
  if (decadeStart !== decadeOf(thisYear)) {
    const now = document.createElement('button');
    now.type = 'button';
    now.className = 'cal-q';
    now.textContent = 'سال جاری';
    now.onclick = () => chooseYear(thisYear);
    quick.appendChild(now);
  }
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'cal-q';
  back.textContent = 'برگشت به ماه';
  back.onclick = closeYearGrid;
  quick.appendChild(back);
  cal.appendChild(quick);

  bindYearKeys(cal);
}

function stepDecade(dir) {
  const thisYear = thisJalaliYear();
  const next = decadeStart + dir * YEARS_PER_PAGE;
  /* Same two bounds as the arrows on the month grid, for the same reason: the
     picker has to be able to reach 1250 and must not be able to reach next
     year. */
  if (next < MIN_BIRTH_YEAR || next + YEARS_PER_PAGE > thisYear + 1) return;
  decadeStart = next;
  render();
  focusYearCell(activeYear());
}

/* A year chosen here becomes the stored year AND the year the month grid is
   drawn in — the two are separate variables precisely so that browsing decades
   does not have to move either, but choosing one moves both, because after this
   the reader is back on the month grid and its weekday columns have to be true
   for the year they just picked. */
function chooseYear(y) {
  const thisYear = thisJalaliYear();
  if (y < MIN_BIRTH_YEAR || y > thisYear) return;
  pickYear = y;
  viewJY = y;
  yearMode = false;
  render();
  focusYearRow();
}

/* Put the keyboard on a year, and make it the one Tab stop. Called after every
   repaint of this grid for the reason restoreFocus exists in the month grid: a
   repaint deletes the button that had focus, and focus falls to the body, where
   the arrow keys answer nothing. */
function focusYearCell(y) {
  const grid = $('#bdCal')?.querySelector('.bd-years');
  if (!grid) return;
  grid.querySelectorAll('.bd-year-cell').forEach(b => {
    b.tabIndex = Number(b.dataset.year) === y ? 0 : -1;
  });
  grid.querySelector('.bd-year-cell[data-year="' + y + '"]')?.focus();
}

/* Arrow keys, and the same RTL the day grid uses: in a right-to-left row the
   arrow that points right reaches the EARLIER cell, so the keys are not simply
   «right means plus». Up and down step a whole column of five, which is the
   shape of the grid rather than a guess at a week. PageUp and PageDown step a
   decade, which is the same thing the arrows on the head do.

   This is a small walker rather than the shared walkGridKeys, and that is a
   deliberate exception: that one moves in real days across month boundaries,
   which is the entire reason it exists and none of which applies to a row of
   consecutive years. */
function bindYearKeys(cal) {
  const grid = cal?.querySelector('.bd-years');
  if (!grid) return;
  grid.onkeydown = e => {
    const cell = document.activeElement;
    if (!cell || !cell.closest || !cell.closest('.bd-year-cell') || !grid.contains(cell)) return;
    const y = Number(cell.dataset.year);

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      gotoYear(y + (e.key === 'ArrowLeft' ? 1 : -1));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      gotoYear(y + (e.key === 'ArrowDown' ? YEAR_COLS : -YEAR_COLS));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      stepDecade(e.key === 'PageDown' ? 1 : -1);
    }
  };
}

/* Move to a year, crossing into the next or previous decade when the step walks
   off the page rather than stopping at the edge — so a reader holding the arrow
   key crosses decades the way they cross months in the grid below. */
function gotoYear(y) {
  const thisYear = thisJalaliYear();
  if (y < MIN_BIRTH_YEAR || y > thisYear) return;
  const last = decadeStart + YEARS_PER_PAGE - 1;
  if (y < decadeStart || y > last) {
    decadeStart = decadeOf(y);
    render();
  }
  focusYearCell(y);
}

function render() {
  const cal = $('#bdCal');
  if (!cal) return;

  /* One repaint, one truth, whichever axis is showing. renderYearGrid rewrites
     #bdCal wholesale too, so the two modes cannot both be half-drawn: the branch
     is here rather than inside the month code because everything below it —
     wantsAutofocus, the restoreFocus block, the clear button — is about the
     month, and a year grid drawn underneath them would inherit a footer that
     clears a date the reader came here to keep. */
  if (yearMode) {
    renderYearGrid(cal);
    return;
  }

  const stored = normalizeBirthday(loadBirthday());

  renderMonthHead(cal, {
    jy: viewJY,
    jm: viewJM,
    /* The year is printed here as well as in the stepper under it, and both say
       the same thing on purpose: the title is what a screen reader announces when
       the month changes, and «مهر» alone does not tell a keyboard user which year the grid they
       are now in belongs to. */
    showYear: true,
    /* Each arrow remembers that it was the thing pressed. renderMonthHead
       rewrites this markup wholesale, so the button the reader is holding Enter
       on ceases to exist on click — and a keyboard needs to land on the same
       arrow in the new month, or one press of ‹ throws focus out of the dialog
       and every arrow key after it does nothing. See the note at the foot of
       render(). */
    onPrev: () => { const n = stepMonth(viewJY, viewJM, -1); restoreFocus = 'prev'; viewJY = n.jy; viewJM = n.jm; render(); },
    onNext: () => { const n = stepMonth(viewJY, viewJM, 1); restoreFocus = 'next'; viewJY = n.jy; viewJM = n.jm; render(); },
  });

  /* The stepper, drawn before the grid and in the same place on every repaint, so
     the year cannot be a thing that appears and disappears depending on whether a
     year happens to be stored. Every button is rebuilt rather than reused:
     render() rewrites #bdCal wholesale, so a retained button would keep a
     listener pointing at the view of the month before the last one. */
  cal.appendChild(yearRow());

  const grid = document.createElement('div');
  renderMonthGrid(grid, {
    jy: viewJY,
    jm: viewJM,
    keyOf: bdKeyOf,
    labelOf: bdLabelOf,
    selectedKey: storedKey(),
    /* Today is worth marking here in a way it is not in a task list: this is
       the day the greeting will arrive, so seeing it lit up answers «is my
       setting right?» without a test. */
    todayKey: todayInView(),
    /* The one day Tab can land on. Which one it is is decided by whoever is
       moving around the grid, and left here as the day already chosen — so a
       repaint that is not a move (opening, clearing) puts the reader back on the
       date they came to look at rather than on the first of the month. */
    activeKey: activeDayKey(),
    onPick: pickDay,
  });
  cal.appendChild(grid);

  /* Clearing lives at the foot of the calendar rather than in the settings row,
     for the same reason «بدون مهلت» does in the deadline picker: the calendar is
     where the reader is already looking, and a second way to do the same thing
     in a second place is how the two drift apart.

     It says what it clears. A bare «پاک کردن» under a grid reads as «close
     this», and the button right below it closes the dialog — two controls, one
     word, two meanings. And it only exists when there is something stored, so
     the foot of the card is never offering to remove a date that is not there. */
  const foot = document.createElement('button');
  foot.type = 'button';
  foot.className = 'cal-clear';
  foot.id = 'bdCalClear';
  foot.textContent = 'پاک کردن تاریخ تولد';
  foot.hidden = !stored;
  cal.appendChild(foot);
  foot.onclick = () => { clearBirthday(); closeBirthdayPicker(); };

  bindGridKeys();

  /* A repaint throws away the button that had focus — including the month arrow
     the reader just pressed, because renderMonthHead rewrites its own markup —
     and a focused element that no longer exists drops the browser back on the
     body. So every repaint asks where focus was and puts it back on the same
     thing in the new markup. Skipping this is not a cosmetic problem: without
     it, pressing ‹ or › once strands the keyboard on the page behind the dialog
     and the arrow keys stop answering entirely. */
  if (wantsAutofocus) {
    wantsAutofocus = false;
    /* The day the reader came to change: the one already stored, else today if
       it is on screen, else the first of the month. Asked for with the
       attribute js/modal.js already looks for, because a focus() call here is
       undone milliseconds later — modal.js puts focus on whatever it decides
       the moment the dialog opens, which is after this function returns, and
       with nothing asked for that is the first control in the card. Before
       this, that was the ‹ arrow: opening the calendar and pressing ArrowRight
       moved the month instead of the day, and Tab started from the top. */
    const start = activeDayKey();
    const target = cal.querySelector('.cal-day[data-key="' + start + '"]')
      || cal.querySelector('.cal-day');
    if (target) {
      rovingKey = target.dataset.key;
      target.setAttribute('data-autofocus', '');
    }
  }

  const back = restoreFocus;
  restoreFocus = null;
  if (back === 'prev' || back === 'next') {
    cal.querySelectorAll('.cal-nav')[back === 'prev' ? 0 : 1]?.focus();
  } else if (typeof back === 'string' && back) {
    focusDayOf(back);
  }
}

/* Draw the month a day is in, and put the keyboard on that day. The two are one
   operation because they always happen together: a day outside the month on
   screen is a day that cannot be focused, since focusing it would either throw
   the focus or silently land on a different day of the month that is drawn. */
function goToDay(jy, jm, jd) {
  const key = bdKeyOf(jy, jm, jd);
  rovingKey = key;
  if (jy !== viewJY || jm !== viewJM) {
    restoreFocus = key;
    viewJY = jy;
    viewJM = jm;
    render();
  } else {
    focusDayOf(key);
  }
}

/* The one place that moves the roving tab stop. It is not cosmetic: the grid is
   redrawn whenever the month changes, and the redraw puts tabindex="0" back on
   whatever day render() decided — so without this, arrow around for a while and
   then Tab out and back, and the keyboard returns to the day the month opened on
   instead of the one the reader walked to. */
function focusDayOf(key) {
  const cal = $('#bdCal');
  if (!cal || !key) return;
  cal.querySelectorAll('.cal-day').forEach(b => {
    if (b.dataset.key === key) b.tabIndex = 0;
    else b.tabIndex = -1;
  });
  const btn = cal.querySelector('.cal-day[data-key="' + key + '"]');
  if (btn) btn.focus();
}

/* Arrow keys, because a grid is a grid and a keyboard should be able to walk
   it: left/right move a day, up/down move a week. Enter or Space picks, which is
   what every button in this app already answers to, so this only adds the
   directions. PageUp/PageDown step a month, which is the one thing here that is
   tedious by hand — twelve taps of an arrow to cross a year.

   The walker itself is js/jalalical.js's, shared with the deadline picker. Two
   copies of this would be two answers to the same keypress, and a reader who
   found that the left arrow moved forward in one calendar would be surprised
   in the other. All this file supplies is where the day it lands on goes. */
function bindGridKeys() {
  walkGridKeys($('#bdCal'), {
    view: () => ({ jy: viewJY, jm: viewJM }),
    onGoto: goToDay,
  });
}

/* Today, as an MM-DD key — but only while the month on screen is the month
   today is in. Answering «۰۷-۱۲» while the reader is looking at آبان would put
   a highlighted square on a day that is not this year, and would quietly
   suggest the stored date matches it. Returning null instead means the grid
   simply shows no highlighted day, which is the truth. */
function todayInView() {
  const j = dateToJalali(new Date());
  if (j.jm !== viewJM) return null;
  return pad2(j.jm) + '-' + pad2(j.jd);
}

function pickDay(key) {
  const [m, d] = String(key).split('-').map(Number);
  /* pickYear, not viewJY: the reader may have walked the grid into another year to
     look at it and then pressed skip on the year row, and what they asked to store
     is the answer to the year question — not whichever year the month happened to
     be drawn in. */
  const b = normalizeBirthday({ y: pickYear, m, d });
  if (!b) return;

  saveBirthday(b);
  closeBirthdayPicker();
  renderBirthdayRow();
  /* Someone who picks today's date has just decided the app greets them now,
     rather than on the next reload — waiting would make the row feel broken. */
  checkBirthday();
}

/* ── The settings row ── */
/* The one control in this row is the date itself (index.html), so this only has
   to say what is stored. There is no «پاک کردن» here any more: clearing lives at the foot of
   the calendar, where the reader is when they are looking at the date. Two
   controls for one job is how two of them end up disagreeing. */
export function renderBirthdayRow() {
  const label = $('#bdDate');
  const stored = normalizeBirthday(loadBirthday());

  if (label) {
    label.textContent = stored ? birthdayLabel(stored) : '';
    label.classList.toggle('empty', !stored);
    /* The whole row is now the control, so the button carries what pressing it
       does. Without this a screen reader announces «۱۲ مهر, button» and leaves the reader to work out
       what kind. */
    const btn = $('#bdPick');
    if (btn) btn.setAttribute('aria-label', stored
      ? 'تاریخ تولد: ' + label.textContent + ' — برای تعویض کن'
      : 'تاریخ تولدت را ثبت کن');
  }
}

/* «۱۲ مهر ۱۳۷۰» — day and month first, because that is the part that comes round
   every year, and the year after, because that is the part the reader had to go
   and choose. A date with no year says «۱۲ مهر» and stops, which is still honest. */
function birthdayLabel(stored) {
  const b = normalizeBirthday(stored);
  if (!b) return '';
  const md = faDigits(pad2(b.d)) + ' ' + JALALI_MONTHS[b.m - 1];
  return b.y === null ? md : md + ' ' + faDigits(b.y);
}

function clearBirthday() {
  saveBirthday(null);
  renderBirthdayRow();
  /* Removing the date on the day itself takes the day off with it, rather than
     leaving a reader celebrating a birthday they just deleted. */
  checkBirthday();
}

/* ── The day turning over ──
   The app is left open across midnight, or put in the background and opened
   hours later. Both are the same question — what day is it now — asked two
   ways: a slow timer for the app sitting in the foreground, and the moment it
   comes back to the foreground for everything else. This follows the precedent
   in js/notifications.js rather than inventing a second one. */
let lastDay = null;

export function watchDayChange() {
  const tick = () => {
    const day = new Date().getDate();
    if (day === lastDay) return;
    lastDay = day;
    checkBirthday();
  };
  tick();
  setInterval(tick, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}

export function initBirthday() {
  renderBirthdayRow();
  watchDayChange();

  const openBtn = $('#bdPick');
  const overlay = $('#bdPickOverlay');
  const closeBtn = $('#bdPickClose');

  openBtn?.addEventListener('click', openBirthdayPicker);
  closeBtn?.addEventListener('click', closeBirthdayPicker);

  /* The calendar is a modal like any other, so it takes the same three
     escapes every other overlay here does: the close button, a tap on the
     scrim, and the Escape key. Each detaches its own listener, because a
     picker left wired after it closed would answer the next Escape as well —
     and would do it on top of whichever overlay opened next. */
  const onBackdrop = e => { if (e.target === overlay) closeBirthdayPicker(); };
  const onKey = e => {
    if (e.key !== 'Escape' || !overlay || overlay.hidden) return;
    closeBirthdayPicker();
    openBtn?.focus();
  };
  overlay?.addEventListener('click', onBackdrop);
  document.addEventListener('keydown', onKey);
}
