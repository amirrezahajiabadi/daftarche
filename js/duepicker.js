/* ═══ Jalali Due-Date Picker ═══
   A small local overlay calendar: quick options (امروز/فردا/پس‌فردا),
   month navigation, day selection and «بدون مهلت». RTL + Persian digits.
   Storage stays canonical: picked dates are returned as Gregorian YYYY-MM-DD keys. */

import { $, dayKey, dueKeyFromOffset, faDigits } from './utils.js';
import {
  jalaliToDate, dateToJalali, jalaliDaysInMonth, JALALI_MONTHS,
} from './jalali.js';

let onPick = null;
let onClose = null;
let cleanup = null;
let viewJY = 0, viewJM = 1; // Jalali month currently shown
let selKey = null;          // currently selected Gregorian day key (or null)

const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']; // شنبه … جمعه (RTL: Saturday first)

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function render() {
  const cal = $('#dueCal');
  if (!cal) return;
  const today = dateToJalali(new Date());
  const dim = jalaliDaysInMonth(viewJY, viewJM);
  const first = jalaliToDate(viewJY, viewJM, 1);
  const lead = (first.getDay() + 1) % 7; // Saturday-first columns

  let html = `
    <div class="cal-head">
      <button type="button" class="cal-nav" id="calPrev" aria-label="ماه قبل">‹</button>
      <strong class="cal-title">${JALALI_MONTHS[viewJM - 1]} ${faDigits(viewJY)}</strong>
      <button type="button" class="cal-nav" id="calNext" aria-label="ماه بعد">›</button>
    </div>
    <div class="cal-quick">
      <button type="button" data-off="0" class="cal-q">امروز</button>
      <button type="button" data-off="1" class="cal-q">فردا</button>
      <button type="button" data-off="2" class="cal-q">پس‌فردا</button>
    </div>
    <div class="cal-week">
      ${WEEKDAYS.map(w => `<span>${w}</span>`).join('')}
    </div>
    <div class="cal-grid" role="grid" aria-label="تقویم ${JALALI_MONTHS[viewJM - 1]} ${faDigits(viewJY)}">`;

  for (let i = 0; i < lead; i++) html += '<span class="cal-blank"></span>';
  for (let d = 1; d <= dim; d++) {
    const key = dayKey(jalaliToDate(viewJY, viewJM, d));
    const isToday = d === today.jd && viewJM === today.jm && viewJY === today.jy;
    const isSel = selKey === key;
    const cls = ['cal-day', isToday ? 'today' : '', isSel ? 'sel' : ''].filter(Boolean).join(' ');
    html += `<button type="button" class="${cls}" data-key="${key}" aria-label="${faDigits(d)} ${JALALI_MONTHS[viewJM - 1]} ${faDigits(viewJY)}">${faDigits(d)}</button>`;
  }
  html += '</div>';
  html += '<button type="button" class="cal-clear" id="calClear">بدون مهلت</button>';
  cal.innerHTML = html;

  $('#calPrev').onclick = () => { viewJM--; if (viewJM < 1) { viewJM = 12; viewJY--; } render(); };
  $('#calNext').onclick = () => { viewJM++; if (viewJM > 12) { viewJM = 1; viewJY++; } render(); };
  $('#calClear').onclick = () => closeWith(null);
  cal.querySelectorAll('.cal-q').forEach(b => {
    b.onclick = () => closeWith(dueKeyFromOffset(Number(b.dataset.off)));
  });
  cal.querySelectorAll('.cal-day').forEach(b => {
    b.onclick = () => closeWith(b.dataset.key);
  });
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