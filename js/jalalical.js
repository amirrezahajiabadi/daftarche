/* ═══ Jalali calendar — one month grid, two callers ═══
   The Persian month grid, drawn once. Two things in the app need it: the
   deadline picker on a task, and the reader choosing their own birthday. They
   disagree about almost everything — one keeps a Gregorian day key and offers
   «today / tomorrow», the other keeps a bare MM-DD and has no quick buttons at
   all — but the part that actually does the work is identical: where the month
   starts, how many days it has, which column Saturday sits in, and what a day
   looks like once it is chosen.

   So the work is here and only here. A caller supplies what it wants around the
   grid and gets back clicks. Nothing in this file knows what a deadline is, or
   that a birthday has no year in it.

   **The grid is Saturday-first.** Persian weeks run ش ی د س چ پ ج, and because
   the whole app is RTL that order goes straight into the grid's first column.
   Getting this wrong is invisible in a screenshot and obvious to anyone who
   looks at their own calendar, so it is computed rather than hand-listed: the
   lead blanks come from the weekday of the 1st, and a leap Esfand gets its 30th
   day from jalaliDaysInMonth rather than from an assumption. */

import { faDigits } from './utils.js';
import { dateToJalali, jalaliToDate, jalaliDaysInMonth, JALALI_MONTHS } from './jalali.js';

const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']; // ش ی د س چ پ ج

/* How a caller describes one day of the month. `keyOf` gives it a stable
   identity it can compare against its own stored shape, and `labelOf` gives the
   screen reader something worth saying. Both are supplied because neither
   shape is this file's to decide. */
function dayEntries({ jy, jm, keyOf, labelOf }) {
  const days = jalaliDaysInMonth(jy, jm);
  const out = [];
  for (let d = 1; d <= days; d++) {
    out.push({
      d,
      key: keyOf(jy, jm, d),
      label: labelOf ? labelOf(jy, jm, d) : faDigits(d),
    });
  }
  return out;
}

/* The leading blanks: how many columns the month starts after Saturday. (getDay
   is 0 for Sunday, so +1 puts Saturday at 0 and %7 wraps it.) */
const leadBlanks = (jy, jm) => (jalaliToDate(jy, jm, 1).getDay() + 1) % 7;

/* The grid, into an open element. Nothing is re-fetched and nothing is stored
   here: a caller that repaints on every arrow press is exactly what the
   original picker does, and there is no reason for one caller to be cleverer. */
export function renderMonthGrid(host, opts) {
  if (!host) return;
  const {
    jy, jm,
    keyOf,
    labelOf,
    selectedKey = null,
    todayKey = null,
    activeKey = null,
    onPick,
  } = opts;

  /* role=group, not role=grid. A real ARIA grid has to declare rows and grid
     cells, and this one has neither — it is a row of buttons laid out by CSS.
     Claiming grid made a screen reader announce «grid» and then, finding no
     rows in it, say nothing useful about any of the days. A labelled group
     with thirty named buttons inside is announced correctly. */
  let html = '<div class="cal-week">';
  html += WEEKDAYS.map(w => `<span>${w}</span>`).join('');
  html += '</div><div class="cal-grid" role="group" aria-label="روزهای '
    + JALALI_MONTHS[jm - 1] + '">';

  for (let i = 0; i < leadBlanks(jy, jm); i++) html += '<span class="cal-blank"></span>';

  for (const day of dayEntries({ jy, jm, keyOf, labelOf })) {
    const cls = [
      'cal-day',
      todayKey && day.key === todayKey ? 'today' : '',
      selectedKey && day.key === selectedKey ? 'sel' : '',
    ].filter(Boolean).join(' ');
    const label = labelOf ? day.label : faDigits(day.d);
    /* Roving tabindex, and only when the caller asked for it by naming a day.
       One day in the month is reachable by Tab and the rest are -1, so Tab
       crosses the grid in a single press instead of thirty, and the arrow keys
       are what move within it. A caller with no arrow handler of its own must
       not ask for this: with every day at -1 the grid would be unreachable by
       Tab at all, which is why it is opt-in rather than the default. */
    const tab = activeKey === null ? ''
      : day.key === activeKey ? ' tabindex="0"' : ' tabindex="-1"';
    html += `<button type="button" class="${cls}" data-key="${day.key}" aria-label="${label}"${tab}${todayKey === day.key ? ' aria-current="date"' : ''}${selectedKey === day.key ? ' aria-selected="true"' : ''}>${faDigits(day.d)}</button>`;
  }

  html += '</div>';
  host.innerHTML = html;

  if (onPick) {
    host.querySelectorAll('.cal-day').forEach(b => {
      b.onclick = () => onPick(b.dataset.key);
    });
  }
}

/* The month title and its two arrows, which every month view has. `showYear`
   is off for the birthday: a date with no year in it should not have one
   printed above it, or the reader is invited to pick a year and then it is
   silently thrown away. */
export function renderMonthHead(host, opts) {
  if (!host) return;
  const { jy, jm, showYear = true, onPrev, onNext } = opts;
  const title = showYear
    ? `${JALALI_MONTHS[jm - 1]} ${faDigits(jy)}`
    : JALALI_MONTHS[jm - 1];

  /* The title is a live region because it is the only thing that changes when
     the month does, and a reader who steps through twelve months with the arrow
     keys or the ‹ › buttons would otherwise land on a new grid with nothing to
     tell them what month it is. */
  /* The wrapper is not decoration: css/overlays.css lays the three apart with
     flex on .cal-head, and without it they fall into normal flow and stack —
     one arrow above the title and one below, which is exactly what the picker
     did before this was written. Anything that positions or spaces these three
     needs this element to exist. */
  host.innerHTML = `
    <div class="cal-head">
      <button type="button" class="cal-nav" aria-label="ماه قبل">‹</button>
      <strong class="cal-title" aria-live="polite">${title}</strong>
      <button type="button" class="cal-nav" aria-label="ماه بعد">›</button>
    </div>`;

  /* Scoped to the host that was just written, and by position rather than by
     id. Both calendars on this app use the same markup, and an id would have
     the second one steal the first one's arrows — which is exactly what happens
     if a date is picked from the task form and the birthday sheet is open at
     the same time. */
  const [prev, next] = host.querySelectorAll('.cal-head .cal-nav');
  if (prev) prev.onclick = onPrev || null;
  if (next) next.onclick = onNext || null;
}

/* Month navigation that wraps at both ends. Shared because getting it wrong at
   فروردین is how a calendar ends up unable to reach month twelve. */
export function stepMonth(jy, jm, delta) {
  let m = jm + delta;
  let y = jy;
  if (m > 12) { m = 1; y++; }
  if (m < 1) { m = 12; y--; }
  return { jy: y, jm: m };
}

/* ═══ Walking the grid with the keyboard ═══
   Both pickers do this, and they must do it identically — a reader who has
   learned that the left arrow moves forward in one of them is going to use the
   same key in the other, and a calendar that answers the same press two ways is
   worse than one that does not answer at all. So the walker lives here with the
   grid it walks, and each picker only supplies how to get back to its own
   month.

   The two axes are not the same, and treating them as one is what makes a grid
   feel wrong: left/right step one day, up/down step a whole week and must land
   on the same weekday, or the cursor drifts sideways across the month as it
   moves. Both are expressed in the same unit — real days — so stepping off the
   end of a month is arithmetic rather than a special case. That is what an
   earlier hand-written version got wrong, losing focus at every boundary. */
const DAY_MOVE = {
  ArrowLeft: 1, ArrowRight: -1,
  ArrowDown: 7, ArrowUp: -7,
};

/* Move from one day to another by a number of real days, crossing months and
   years freely. Deliberately not hand-written as «if the day is past the end of
   the month, go to day one of the next month»: that has to be true at both ends
   and across a year boundary and a 29-day Esfand, and the calendar already
   knows all of those answers. Walking the Gregorian date it came from is one
   line and cannot disagree with the month that is being drawn. */
export function moveDays(jy, jm, jd, days) {
  const d = jalaliToDate(jy, jm, jd);
  d.setDate(d.getDate() + days);
  const j = dateToJalali(d);
  return { jy: j.jy, jm: j.jm, jd: j.jd };
}

/* One keydown handler, bound to the picker's own calendar container.

   `onGoto(jy, jm, jd)` is the picker's half: it decides whether that day is in
   the month it is already showing and repaints, and where focus should land
   afterwards. It is a callback rather than shared state because the two pickers
   disagree about almost everything else — one stores a Gregorian key and has
   quick buttons, the other stores MM-DD and has none — and this is the only
   part they have in common.

   `view()` returns the month currently drawn, because a keypress has to know
   which month it is stepping away from before it can step. */
export function walkGridKeys(cal, { view, onGoto }) {
  if (!cal) return;
  cal.onkeydown = e => {
    /* Where the focus actually is, not where the event came from. A keydown
       that reaches the grid is normally aimed at the day that has focus, and
       reading it back from e.target quietly breaks the moment anything
       dispatches on the container instead of the button — which is also what
       happens when a screen reader moves focus without a click. */
    const day = document.activeElement;
    if (!day || !day.closest || !day.closest('.cal-day') || !cal.contains(day)) return;
    const key = day.dataset.key;
    if (!key) return;

    /* A key is «MM-DD» for the birthday and «YYYY-MM-DD» for a deadline, so the
       month and day are the LAST two parts rather than assumed positions. */
    const parts = key.split('-').map(Number);
    const jd = parts[parts.length - 1];

    /* RTL: the week runs right-to-left, so the arrow that points right — which
       on a Persian keyboard is the one that reaches «later» — moves back a day,
       and the left arrow moves forward. This matches the day headers, whose
       first column is Saturday on the right. */
    const move = DAY_MOVE[e.key];
    if (move) {
      e.preventDefault();
      const { jy, jm } = view();
      const to = moveDays(jy, jm, jd, move);
      onGoto(to.jy, to.jm, to.jd);
      return;
    }

    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const { jy, jm } = view();
      const next = stepMonth(jy, jm, e.key === 'PageDown' ? 1 : -1);
      /* Keep the day of the month across the step where the new month is long
         enough, and land on its last day where it is not — the same day-number
         rule every other calendar uses, rather than snapping to the 1st and
         making a reader who paged to check «is it the 30th?» have to count. */
      onGoto(next.jy, next.jm, Math.min(jd, jalaliDaysInMonth(next.jy, next.jm)));
    }
  };
}

export { WEEKDAYS };
