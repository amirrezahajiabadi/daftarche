/* ═══ Jalali Due-Date Picker ═══
   A small local overlay calendar: quick options (امروز/فردا/پس‌فردا),
   month navigation, day selection and «بدون مهلت». RTL + Persian digits.
   Storage stays canonical: picked dates are returned as Gregorian YYYY-MM-DD keys.

   The month grid itself is not drawn here. js/jalalical.js draws it, because
   the birthday sheet needs the same grid and a second copy of the arithmetic —
   where a month starts, how many days it has, which column Saturday sits in —
   is exactly the kind of thing that rots when it is written twice. What this
   file keeps is what is specific to a deadline: the quick buttons that only
   make sense for something due in the next three days, and a Gregorian key,
   because a task list sorts and compares by that and not by a Jalali one. */

import { $, dayKey, dueKeyFromOffset, faDigits } from './utils.js';
import { dateToJalali, jalaliToDate, JALALI_MONTHS } from './jalali.js';
import { renderMonthGrid, renderMonthHead, stepMonth, walkGridKeys } from './jalalical.js';

let onPick = null;
let onClose = null;
let cleanup = null;
let viewJY = 0, viewJM = 1; // Jalali month currently shown
let selKey = null;          // currently selected Gregorian day key (or null)

/* The day the arrow keys are standing on, and where a repaint should put focus
   back to. A deadline is identified by its Gregorian key, so this is that key
   and not an MM-DD — the two pickers disagree about almost everything, and this
   is why the walker takes a callback instead of knowing about days itself. */
let rovingKey = null;
let restoreFocus = null;
let wantsAutofocus = false;

const cal = () => $('#dueCal');

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/* Is this Gregorian key a day in the month currently on screen? One predicate
   for both places that ask — which day Tab should land on, and which day the
   dialog opens on — because the two must agree and selKey is null whenever
   nothing has a deadline yet, which is a key that cannot be split. */
const inView = k => {
  if (!k) return false;
  const j = dateToJalali(parseKey(k));
  return j.jy === viewJY && j.jm === viewJM;
};

/* A deadline is identified by the Gregorian day it lands on, which is what the
   rest of the app stores and compares. */
const keyOf = (jy, jm, jd) => dayKey(jalaliToDate(jy, jm, jd));
const labelOf = (jy, jm, jd) =>
  `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${faDigits(jy)}`;

function render() {
  const cal = $('#dueCal');
  if (!cal) return;
  const today = dateToJalali(new Date());

  renderMonthHead(cal, {
    jy: viewJY,
    jm: viewJM,
    showYear: true,
    /* Each arrow remembers that it was the thing pressed: renderMonthHead
       rewrites this markup wholesale, so the button being held ceases to exist
       on click, and a keyboard needs to land on the same arrow in the new month
       or every arrow key afterwards does nothing. */
    onPrev: () => { const n = stepMonth(viewJY, viewJM, -1); restoreFocus = 'prev'; viewJY = n.jy; viewJM = n.jm; render(); },
    onNext: () => { const n = stepMonth(viewJY, viewJM, 1); restoreFocus = 'next'; viewJY = n.jy; viewJM = n.jm; render(); },
  });

  /* The quick row sits between the arrows and the grid, so the grid is written
     into a fresh element underneath rather than replacing the head. */
  const grid = document.createElement('div');
  renderMonthGrid(grid, {
    jy: viewJY,
    jm: viewJM,
    keyOf,
    labelOf,
    selectedKey: selKey,
    todayKey: dayKey(new Date()),
    /* One Tab stop for the month, so Tab crosses the grid in one press rather
       than thirty. Only safe because the walker below exists to move within it
       — with every day at -1 and no arrow handler the grid would be unreachable
       by Tab at all. `activeKey` is the same rule the birthday picker uses:
       the remembered day, but only if it is in the month being drawn. */
    activeKey: activeDayKey(),
    onPick: closeWith,
  });
  cal.appendChild(grid);

  cal.insertAdjacentHTML('beforeend', `
    <div class="cal-quick">
      <button type="button" class="cal-q" data-off="0">امروز</button>
      <button type="button" class="cal-q" data-off="1">فردا</button>
      <button type="button" class="cal-q" data-off="2">پس‌فردا</button>
    </div>`);
  cal.appendChild(Object.assign(document.createElement('button'), {
    type: 'button', className: 'cal-clear', textContent: 'بدون مهلت', id: 'calClear',
  }));

  cal.querySelectorAll('.cal-q').forEach(b => {
    b.onclick = () => closeWith(dueKeyFromOffset(Number(b.dataset.off)));
  });
  $('#calClear').onclick = () => closeWith(null);

  walkGridKeys(cal, {
    view: () => ({ jy: viewJY, jm: viewJM }),
    onGoto: goToDay,
  });

  if (wantsAutofocus) {
    wantsAutofocus = false;
    const start = [selKey, dayKey(new Date())].find(inView) || keyOf(viewJY, viewJM, 1);
    const first = cal.querySelector('.cal-day[data-key="' + start + '"]')
      || cal.querySelector('.cal-day');
    if (first) {
      rovingKey = first.dataset.key;
      first.setAttribute('data-autofocus', '');
    }
  }

  /* A repaint throws away the button that had focus — including the month arrow
     the reader just pressed — and a focused element that no longer exists drops
     the browser back on the body, where the arrow keys stop answering. */
  const back = restoreFocus;
  restoreFocus = null;
  if (back === 'prev' || back === 'next') {
    cal.querySelectorAll('.cal-head .cal-nav')[back === 'prev' ? 0 : 1]?.focus();
  } else if (typeof back === 'string' && back) {
    focusDayOf(back);
  }
}

/* The day Tab should land on in the month about to be drawn.

   rovingKey survives between openings on purpose, but the month it names is not
   necessarily the month the next opening draws: look at a different month,
   close without choosing, and the next open is back on the deadline's month.
   Hand the grid a key for a day it does not contain and every cell comes out
   tabindex="-1", leaving a calendar a keyboard can only reach by clicking. */
function activeDayKey() {
  return [rovingKey, selKey, dayKey(new Date())].find(inView)
    || keyOf(viewJY, viewJM, 1);
}

/* Draw the month a day is in and put the keyboard on that day. The two are one
   operation because they always happen together: a day outside the month on
   screen is a day that cannot be focused. */
function goToDay(jy, jm, jd) {
  const key = keyOf(jy, jm, jd);
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

/* The one place that moves the roving tab stop. Without it the redraw would put
   tabindex="0" back on whatever render() decided, and Tab out and back would
   return the reader to the day the month opened on instead of the one they
   walked to. */
function focusDayOf(key) {
  const cal = $('#dueCal');
  if (!cal || !key) return;
  cal.querySelectorAll('.cal-day').forEach(b => {
    b.tabIndex = b.dataset.key === key ? 0 : -1;
  });
  cal.querySelector('.cal-day[data-key="' + key + '"]')?.focus();
}

function closeWith(key) {
  if (cleanup) { cleanup(); cleanup = null; }
  const overlay = $('#dueOverlay');
  if (overlay) overlay.hidden = true;
  if (key !== undefined && onPick) onPick(key);
  const cb = onClose;
  onPick = null; onClose = null;
  cb && cb();
}

/* Open the picker. current = Gregorian day key or null.
   onPick(keyOrNull) fires when a date is chosen or مهلت is removed.
   onClose() fires when the picker is dismissed without choosing. */
export function openDuePicker({ current = null, onPick: pick, onClose: close } = {}) {
  const overlay = $('#dueOverlay');
  if (!overlay || !overlay.hidden) return;
  onPick = pick || null;
  onClose = close || null;
  selKey = current;
  if (current && /^\d{4}-\d{2}-\d{2}$/.test(current)) {
    const j = dateToJalali(parseKey(current));
    viewJY = j.jy; viewJM = j.jm;
  } else {
    const j = dateToJalali(new Date());
    viewJY = j.jy; viewJM = j.jm;
  }
  /* Focus starts on the chosen date, else today, else the first of the month.

     It is asked for with the attribute js/modal.js already looks for, and it is
     set inside render() rather than here — renderMonthHead writes over the whole
     of #dueCal's markup, so an attribute put on the previous grid's button is
     put on an element that is no longer in the document by the time the dialog
     opens. A plain focus() call would not survive either: modal.js puts focus
     where it thinks it belongs the moment the dialog opens, which is after this
     function returns, and with nothing asked for that is the ‹ arrow. */
  wantsAutofocus = true;
  render();
  overlay.hidden = false;

  const onBackdrop = e => { if (e.target === overlay) closeWith(undefined); };
  const onKey = e => { if (e.key === 'Escape' && !overlay.hidden) closeWith(undefined); };
  overlay.addEventListener('click', onBackdrop);
  document.addEventListener('keydown', onKey);
  cleanup = () => {
    overlay.removeEventListener('click', onBackdrop);
    document.removeEventListener('keydown', onKey);
  };
}

export function closeDuePicker() {
  closeWith(undefined);
}

/* Wire the picker's close button once */
export function initDuePicker() {
  $('#dueClose')?.addEventListener('click', () => closeDuePicker());
}
