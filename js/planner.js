/* ═══ Weekly planner — the week as a calendar ═══
   Seven days across, the day you pick filling the rest of the page. Two
   questions are answered together: what is planned for a day, and what actually
   happened on it — the second read from the day book (js/ledger.js) that the
   achievements were already keeping, so this page is a view over data the app
   has, not a second place where data starts being written.

   A task has one due date, not a copy per day. Writing a task while looking at
   Saturday is the same task the Tasks page would create, and ticking it here is
   the same tick the Today page gives it — so nothing in this file owns data:
   addTask, setTaskDone and collapse are the shared doors, and there is no fourth
   notion of "when" beyond the due date and the optional span.

   Nothing that holds a caret is ever rebuilt: the bar, the strip and the day
   panel's frame are written once and only their contents are redrawn. A notify
   from any other module arrives on every save, and it must never be able to wipe
   a half-written task out of the input. */

import { state, getTask } from './state.js';
import {
  $, dayKey, faNum, weekStartOf, dateFromKey, shiftKey, formatClock,
  WEEKDAYS_SHORT, parseTimeRange,
} from './utils.js';
import { subscribe } from './bus.js';
import { addTask, setTaskDone, collapse, timeRangeLabel, moveTaskToDay } from './tasks.js';
import { collectTotals } from './ledger.js';
import { ICONS, MOODS } from './constants.js';
import { dateToJalali, JALALI_MONTHS } from './jalali.js';
import { pickerRow } from './chipgroup.js';

/* ── Where the page is looking ──
   One value: the day on screen. The week laid out is the week that day falls
   in, so «which week» and «which day» can never disagree — and moving a week is
   that same value stepped by seven. */
let focusKey = null;
let spanSlot = 'none';
let spanPicker = null;
let builtWeek = null;    // the week the strip was built for
const cells = new Map(); // day key → { cell, fill }

const todayKey = () => dayKey(new Date());
const shownKey = () => (focusKey ? focusKey : todayKey());
const shownDate = () => dateFromKey(shownKey());

const weekKeys = () => {
  const first = dayKey(weekStartOf(shownDate()));
  return Array.from({ length: 7 }, (_, i) => shiftKey(first, i));
};

const dateFmt = (opts, key) => new Intl.DateTimeFormat('fa-IR', opts).format(dateFromKey(key));
const fullDate = key => dateFmt({ weekday: 'long', day: 'numeric', month: 'long' }, key);
const weekdayName = key => dateFmt({ weekday: 'long' }, key);

/* The week's own name: «۶ تا ۱۲ مهر» — one month, or both when the week falls
   across a change of month, which in a Jalali calendar is common enough that it
   cannot be left to the day numbers alone. */
function weekLabel(keys) {
  const a = dateToJalali(dateFromKey(keys[0]));
  const b = dateToJalali(dateFromKey(keys[6]));
  const md = m => JALALI_MONTHS[m - 1];
  return a.jm === b.jm && a.jy === b.jy
    ? `${faNum(a.jd)} تا ${faNum(b.jd)} ${md(a.jm)}`
    : `${faNum(a.jd)} ${md(a.jm)} تا ${faNum(b.jd)} ${md(b.jm)}`;
}

/* How far the day is from today, in the words a reader would use. */
function relLabel(key) {
  const diff = Math.round((dateFromKey(key) - dateFromKey(todayKey())) / 864e5);
  if (diff === 0) return { text: 'امروز', cls: 'today' };
  if (diff === -1) return { text: 'دیروز', cls: 'past' };
  if (diff === 1) return { text: 'فردا', cls: 'future' };
  if (diff < 0) return { text: `${faNum(-diff)} روز پیش`, cls: 'past' };
  return { text: `${faNum(diff)} روز دیگه`, cls: 'future' };
}

/* ── The optional span ──
   Four slots people actually plan in, one tap each, plus «دلخواه» for the exact
   span. The picks are written in the words a plan is spoken in — «۲ بعدازظهر» —
   with the clock the app prints beside them, so the twelve-or-twenty-four
   question never has to be asked and nothing has to be typed. */
const SPAN_SLOTS = [
  { key: 'none', label: 'ندارد' },
  { key: 'morning', label: 'صبح', from: 9 * 60, to: 12 * 60 },
  { key: 'noon', label: 'ظهر', from: 12 * 60, to: 14 * 60 },
  { key: 'evening', label: 'عصر', from: 16 * 60, to: 18 * 60 },
  { key: 'night', label: 'شب', from: 20 * 60, to: 22 * 60 },
  { key: 'custom', label: 'دلخواه' },
];

function hourLabel(min) {
  const h = min / 60;
  if (h === 0) return '۱۲ شب';
  if (h < 5) return `${faNum(h)} شب`;
  if (h < 12) return `${faNum(h)} صبح`;
  if (h === 12) return '۱۲ ظهر';
  if (h < 17) return `${faNum(h - 12)} بعدازظهر`;
  if (h < 20) return `${faNum(h - 12)} عصر`;
  return `${faNum(h - 12)} شب`;
}

/* The span the next quick add would carry: null for «ندارد», the slot's own
   pair for a preset, and whatever the two picks say for «دلخواه» — which comes
   back null while the picks are out of order, so an impossible span can never
   reach a task. */
function currentSpan() {
  const slot = SPAN_SLOTS.find(s => s.key === spanSlot);
  if (!slot || slot.key === 'none') return null;
  if (slot.key !== 'custom') return { from: slot.from, to: slot.to };
  const from = Number($('#wkFrom') && $('#wkFrom').value);
  const to = Number($('#wkTo') && $('#wkTo').value);
  return parseTimeRange(from, to);
}

/* ═══ The frame: built once, then only its contents change ═══ */

function buildShell() {
  const day = $('#wkDay');
  if (!day || day.dataset.built) return;
  day.dataset.built = '1';
  day.innerHTML = `
    <div class="wk-panel">
      <div class="wk-panel-head">
        <h2 id="wkHead"></h2>
        <span class="wk-rel" id="wkRel"></span>
      </div>

      <form class="wk-add" id="wkAdd" autocomplete="off">
        <input id="wkInput" type="text" maxlength="120" aria-label="افزودن کار به این روز"/>
        <button class="wk-go" type="submit" aria-label="افزودن">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </form>

      <!-- Optional, and it says so: «ندارد» is a first-class answer. -->
      <div class="wk-span">
        <span class="wk-span-lab" id="wkSpanLab">بازهٔ زمانی (اختیاری)</span>
        <div class="pick-row" id="wkSpanChips" role="radiogroup" aria-labelledby="wkSpanLab"></div>
        <span class="wk-span-out" id="wkSpanOut" aria-live="polite"></span>
        <div class="wk-span-picks" id="wkSpanPicks" hidden>
          <select id="wkFrom" aria-label="از ساعت"></select>
          <span class="wk-span-to">تا</span>
          <select id="wkTo" aria-label="تا ساعت"></select>
        </div>
        <p class="wk-span-hint" id="wkSpanHint" role="status" hidden></p>
      </div>

      <ul class="wk-list" id="wkList"></ul>

      <section class="wk-sec" id="wkDoneSec" hidden>
        <h3>انجام‌شده در این روز</h3>
        <ul class="wk-list" id="wkDoneList"></ul>
      </section>

      <section class="wk-sec" id="wkActSec" hidden>
        <h3>این روز چه‌خبر بود</h3>
        <div class="wk-chips" id="wkActChips"></div>
        <p class="wk-act-note" id="wkActNote" hidden></p>
      </section>
    </div>`;

  fillHourPicks();
  spanPicker = pickerRow($('#wkSpanChips'), SPAN_SLOTS, { group: 'span', onPick: pickSpan });

  $('#wkAdd').addEventListener('submit', onSubmit);
  $('#wkFrom').addEventListener('change', syncSpan);
  $('#wkTo').addEventListener('change', syncSpan);

  /* Delegated: the bar and the strip are redrawn often and own no listeners. */
  $('#wkBar').addEventListener('click', e => {
    const nav = e.target.closest('[data-move]');
    if (nav) { focusKey = shiftKey(shownKey(), Number(nav.dataset.move)); renderPlanner(); return; }
    if (e.target.closest('#wkTodayBtn')) { focusKey = todayKey(); renderPlanner(); }
  });

  $('#wkStrip').addEventListener('click', e => {
    const cell = e.target.closest('.wk-cell');
    if (cell) { focusKey = cell.dataset.key; renderPlanner(); }
  });

  /* Choosing is moving, the way a radio group behaves; the horizontal pair
     follows the writing direction. */
  $('#wkStrip').addEventListener('keydown', e => {
    const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    focusKey = shiftKey(shownKey(), step);
    renderPlanner();
    cells.get(shownKey())?.cell.focus();
  });

  $('#wkDay').addEventListener('click', e => {
    const row = e.target.closest('.wk-row');
    if (!row) return;
    const task = getTask(row.dataset.id);
    if (!task) return;
    if (e.target.closest('.wk-check')) setTaskDone(task.id, !task.done);
    else if (e.target.closest('.wk-del')) collapse(row, task.id);
  });

  /* Moving a task to another day: by hand off the grip, or by arrow key from the
     row's own buttons. Both land in js/tasks.js (moveTaskToDay), because the
     Tasks page's due picker is the other door to the same change.

     Only the press is on the panel, because only the press has to come from a
     grip inside it. The rest of the gesture is on the window: the week strip
     sits *above* the panel, so the day a task is aimed at is reached by lifting
     the finger off the panel altogether — a release heard only inside the panel
     would never arrive, and the page would keep a card stuck under the finger
     with a row faded out. On the window the same release always lands. */
  $('#wkDay').addEventListener('pointerdown', pressRow);
  $('#wkDay').addEventListener('keydown', moveByKey);
  addEventListener('pointermove', moveDrag);
  addEventListener('pointerup', releaseRow);
  addEventListener('pointercancel', cancelDrag);
  addEventListener('keydown', e => { if (e.key === 'Escape' && drag) cancelDrag(); });
}

/* Twenty-four hours, told twice: the way it is spoken and the way the app prints
   it. A plan typed as «۲» and a task row reading «۱۴:۰۰» are then the same hour
   to the reader looking at both. */
function fillHourPicks() {
  const opts = Array.from({ length: 24 }, (_, h) => {
    const min = h * 60;
    return `<option value="${min}">${hourLabel(min)} · ${formatClock(min)}</option>`;
  }).join('');
  $('#wkFrom').innerHTML = opts;
  $('#wkTo').innerHTML = opts;
  $('#wkFrom').value = String(14 * 60);
  $('#wkTo').value = String(16 * 60);
}

function pickSpan(key) {
  const before = currentSpan();
  spanSlot = key;
  if (spanPicker) spanPicker.mark(spanSlot);
  /* Arriving at «دلخواه» from a span that was already chosen starts from that
     span rather than from an arbitrary hour — the reader is refining, not
     starting over. */
  if (key === 'custom' && before) {
    $('#wkFrom').value = String(before.from);
    $('#wkTo').value = String(before.to);
  }
  syncSpan();
}

function syncSpan() {
  const picks = $('#wkSpanPicks');
  const out = $('#wkSpanOut');
  const hint = $('#wkSpanHint');
  const custom = spanSlot === 'custom';
  if (picks) picks.hidden = !custom;
  if (hint) hint.hidden = true;
  const span = currentSpan();
  if (out) out.textContent = span ? `${formatClock(span.from)} تا ${formatClock(span.to)}` : '';
  if (custom && !span && hint) {
    hint.textContent = 'پایان باید بعد از شروع باشد.';
    hint.hidden = false;
  }
}

function onSubmit(e) {
  e.preventDefault();
  const form = $('#wkAdd');
  const input = $('#wkInput');
  const text = input ? input.value.trim() : '';
  if (!text) {
    form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
    setTimeout(() => form.classList.remove('shake'), 380);
    input?.focus();
    return;
  }
  /* An impossible custom span is refused, and the reason is already on screen
     under the picks — writing the task without its span would be a silent loss
     of the one thing the reader had just said. */
  if (spanSlot === 'custom' && !currentSpan()) { syncSpan(); return; }
  addTask(text, 'mid', 'misc', shownKey(), null, currentSpan());
  if (input) { input.value = ''; input.focus(); }
}

/* ═══ The bar, the strip ═══ */

function renderBar(keys) {
  const bar = $('#wkBar');
  if (!bar) return;
  const onToday = shownKey() === todayKey();
  bar.innerHTML = `
    <button class="wk-nav" type="button" data-move="-7">هفتهٔ قبل</button>
    <span class="wk-range">${weekLabel(keys)}</span>
    <button class="wk-nav" type="button" data-move="7">هفتهٔ بعد</button>
    <button class="wk-today" type="button" id="wkTodayBtn"${onToday ? ' hidden' : ''}>همین امروز</button>`;
}

function buildStrip(keys) {
  const strip = $('#wkStrip');
  if (!strip) return;
  cells.clear();
  const frag = document.createDocumentFragment();
  keys.forEach((key, i) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'wk-cell';
    cell.dataset.key = key;
    cell.setAttribute('role', 'radio');
    const j = dateToJalali(dateFromKey(key));
    cell.innerHTML = `<span class="wk-dow">${WEEKDAYS_SHORT[i]}</span>`
      + `<span class="wk-num">${faNum(j.jd)}</span>`
      + '<span class="wk-track" aria-hidden="true"><i></i></span>';
    frag.appendChild(cell);
    cells.set(key, { cell, fill: cell.querySelector('.wk-track i') });
  });
  strip.replaceChildren(frag);
}

/* The bar under each day is the day's plan filling up: no tasks, no bar — a day
   nobody planned shows nothing rather than an empty track waiting for one. */
function syncStrip(keys) {
  const cur = shownKey(), today = todayKey();
  /* One pass over the tasks, not one per cell: the strip is redrawn on every
     save in the app, and fourteen passes over a long list to answer the same
     question seven times is work nobody asked for. */
  const counts = new Map(keys.map(k => [k, { total: 0, done: 0 }]));
  for (const t of state.tasks) {
    const day = t.dueDate && counts.get(t.dueDate);
    if (!day) continue;
    day.total++;
    if (t.done) day.done++;
  }

  for (const key of keys) {
    const c = cells.get(key);
    if (!c) continue;
    const { total, done } = counts.get(key);
    c.cell.classList.toggle('sel', key === cur);
    c.cell.classList.toggle('today', key === today);
    c.cell.classList.toggle('past', key < today);
    c.cell.setAttribute('aria-checked', String(key === cur));
    c.cell.tabIndex = key === cur ? 0 : -1;
    c.cell.setAttribute('aria-label', total
      ? `${fullDate(key)} — ${faNum(done)} از ${faNum(total)} کار انجام شده`
      : `${fullDate(key)} — بدون کار`);
    c.fill.style.width = total ? Math.round((done / total) * 100) + '%' : '';
    c.fill.parentElement.classList.toggle('has', total > 0);
  }
}

/* ═══ The day ═══ */

function renderDayHead() {
  const key = shownKey();
  const head = $('#wkHead');
  if (head) head.textContent = fullDate(key);
  const rel = $('#wkRel');
  if (rel) {
    const r = relLabel(key);
    rel.textContent = r.text;
    rel.className = 'wk-rel ' + r.cls;
  }
  const input = $('#wkInput');
  if (input) {
    input.placeholder = `+ برای ${weekdayName(key)} یه کار بنویس…`;
    input.setAttribute('aria-label', `افزودن کار به ${fullDate(key)}`);
  }
}

/* One row, both lists. A planned task and a task finished that day are the same
   thing seen from two sides, so they are not allowed to look like two species. */
function rowEl(task) {
  const li = document.createElement('li');
  li.className = 'wk-row' + (task.done ? ' done' : '');
  li.dataset.id = task.id;
  li.dataset.p = task.p || 'mid';
  const span = timeRangeLabel(task);
  li.innerHTML = `
    <span class="wk-grip" aria-hidden="true" title="بکشش روی روز دیگه — یا با کلیدهای چپ و راست ببرش">${ICONS.grip}</span>
    <button class="wk-check" type="button" aria-label="تغییر وضعیت تکمیل">${ICONS.check}</button>
    <span class="wk-dot" aria-hidden="true"></span>
    <span class="wk-title"></span>
    ${span ? `<span class="wk-span-chip">${span}</span>` : ''}
    <button class="wk-del" type="button" aria-label="حذف">${ICONS.trash}</button>`;
  li.querySelector('.wk-title').textContent = task.text;
  return li;
}

function emptyNote(key) {
  const li = document.createElement('li');
  li.className = 'wk-empty';
  const today = todayKey();
  li.textContent = key === today
    ? 'برای امروز چیزی ننوشتی — همون بالا بنویس.'
    : key > today
      ? 'برای این روز کاری برنامه‌ریزی نشده.'
      : 'این روز خالی بود.';
  return li;
}

/* The day as the day book remembers it: what was ticked, what was focused on,
   what was read, and how the day felt. All of it was already being recorded —
   this only says it back. Only a day that has happened has anything to say. */
function renderActivity(key) {
  const sec = $('#wkActSec');
  const chips = $('#wkActChips');
  const note = $('#wkActNote');
  if (!sec || !chips) return;
  if (key > todayKey()) { sec.hidden = true; return; }

  const day = collectTotals().days.find(d => d.key === key) || null;
  const items = [];
  if (day) {
    if (day.done) items.push(`${faNum(day.done)} کار جلو رفت`);
    if (day.focusMin) items.push(`${faNum(day.focusMin)} دقیقه تمرکز`);
    if (day.readMin) items.push(`${faNum(day.readMin)} دقیقه مطالعه`);
    if (day.pages) items.push(`${faNum(day.pages)} صفحه`);
    if (day.mood && MOODS[day.mood - 1]) items.push(`حال: ${MOODS[day.mood - 1].label}`);
    if (day.freeze) items.push('مرخصی پیوستگی');
  }
  sec.hidden = false;
  chips.replaceChildren(...items.map(t => {
    const span = document.createElement('span');
    span.className = 'wk-chip';
    span.textContent = t;
    return span;
  }));
  const quiet = !items.length;
  chips.hidden = quiet;
  if (note) {
    note.hidden = !quiet;
    note.textContent = quiet
      ? (key === todayKey() ? 'امروز هنوز چیزی ثبت نشده.' : 'از این روز چیزی ثبت نشده.')
      : '';
  }
}

function renderLists() {
  const key = shownKey();

  /* Planned: timed first, in the order of the day; untimed after them, because a
     span is an anchor and the rest of the day hangs off it. Sorted by time
     alone, so ticking a task never makes its row jump away from the finger. */
  const untimed = 24 * 60;
  const planned = state.tasks
    .filter(t => t.dueDate === key)
    .sort((a, b) => (a.timeFrom == null ? untimed : a.timeFrom) - (b.timeFrom == null ? untimed : b.timeFrom));

  const list = $('#wkList');
  if (list) {
    list.replaceChildren(...(planned.length ? planned.map(rowEl) : [emptyNote(key)]));
  }

  /* Finished that day, but planned for another one (or for no day at all): the
     tick belongs to the day it happened on. */
  const doneHere = state.tasks.filter(t =>
    t.done && t.doneAt && dayKey(new Date(t.doneAt)) === key && t.dueDate !== key);
  const sec = $('#wkDoneSec');
  const doneList = $('#wkDoneList');
  if (sec && doneList) {
    sec.hidden = !doneHere.length;
    doneList.replaceChildren(...doneHere.map(rowEl));
  }

  renderActivity(key);
}

/* ═══ Carrying a task to another day ═══
   A week is the one place where a plan's day is a single gesture away, so a row
   can be picked up by its grip and put down on another day. Pointer events
   rather than the HTML5 drag the Tasks page uses, because that one needs a
   mouse: this app is held in one hand, and a gesture that only worked on a
   desktop would be a promise the page cannot keep.

   Which day is chosen never depends on how high the finger is — only on which
   of the week's seven columns it is over. So the gesture is the same whether the
   strip is on screen or a screen and a half above it, and the card under the
   finger says where the task is going the whole way: «میره به پنجشنبه ۹ مهر».
   A release between two columns takes the nearer one: aiming with a thumb is not
   a mouse click, and a hair off an edge throwing the whole journey away would be
   the page punishing the hand rather than reading it. Escape is the way out, and
   letting go without ever having moved is not a drag at all. */

const DRAG_SLOP = 8;   // how far a press may wander before it counts as a drag
let drag = null;       // { taskId, row, pointerId, x, y, on, key, ghost }

/* The column a point is over, or the nearest one when it is on the margin. */
function dayAtX(x) {
  let near = null, best = Infinity;
  for (const [key, c] of cells) {
    const r = c.cell.getBoundingClientRect();
    if (x >= r.left && x <= r.right) return key;
    const d = Math.min(Math.abs(x - r.left), Math.abs(x - r.right));
    if (d < best) { best = d; near = key; }
  }
  return near;
}

function pressRow(e) {
  const grip = e.target.closest('.wk-grip');
  if (!grip || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const row = grip.closest('.wk-row');
  if (!row) return;
  drag = { taskId: row.dataset.id, row, pointerId: e.pointerId, x: e.clientX, y: e.clientY, on: false, key: null, ghost: null };
}

/* The row is lifted only once the finger has actually travelled. A press that
   never moves is a press — and the grip is right next to the tick.*/
function liftDrag(e) {
  drag.on = true;
  drag.row.classList.add('dragging');
  document.documentElement.classList.add('wk-dragging');
  $('#wkStrip').classList.add('armed');
  drag.ghost = ghostFor(drag.row);
  /* The capture keeps a mouse that wanders off the panel still pointing at the
     row it picked up; the `try` is for a pointer that is already gone. */
  try { drag.row.setPointerCapture(drag.pointerId); } catch (err) { /* stale pointer */ }
}

function moveDrag(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (!drag.on) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_SLOP) return;
    liftDrag(e);
    /* The same move that lifts the row also chooses the day it is over: a quick
       flick puts a task down in one gesture, not two. */
  }
  const key = dayAtX(e.clientX);
  if (key !== drag.key) {
    if (drag.key) cells.get(drag.key)?.cell.classList.remove('drop');
    drag.key = key;
    if (key) cells.get(key).cell.classList.add('drop');
    drag.ghost.to.textContent = key && key !== shownKey() ? `میره به ${fullDate(key)}` : '';
  }
  /* Placed last, against the width the card has *now*: writing the destination
     makes the card wider, and a wider card in a right-to-left page reaches
     further left, so a position measured before the words were written down
     would leave the card half off the screen. */
  moveGhost(e);
}

function releaseRow(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  if (!d.on) return;                 // never travelled: not a drag at all
  endDrag(d);
  if (d.key && moveTaskToDay(d.taskId, d.key)) flashCell(d.key);
}

function cancelDrag() {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.on) endDrag(d);
}

function endDrag(d) {
  d.row.classList.remove('dragging');
  document.documentElement.classList.remove('wk-dragging');
  $('#wkStrip').classList.remove('armed');
  if (d.key) cells.get(d.key)?.cell.classList.remove('drop');
  if (d.ghost) d.ghost.el.remove();
  /* The row may already be gone: a drop re-renders the day's two lists. */
  try { d.row.releasePointerCapture(d.pointerId); } catch (err) { /* already released */ }
}

/* What the reader is holding: the task, its span, and where it is going. Built
   for one line and a half, because a phone shows it with a thumb resting on the
   glass next to it. */
function ghostFor(row) {
  const el = document.createElement('div');
  el.className = 'wk-ghost';
  el.setAttribute('aria-hidden', 'true');
  const title = document.createElement('span');
  title.className = 'wk-ghost-t';
  title.textContent = row.querySelector('.wk-title').textContent;
  el.append(title);
  const span = row.querySelector('.wk-span-chip');
  if (span) {
    const chip = document.createElement('span');
    chip.className = 'wk-span-chip';
    chip.textContent = span.textContent;
    el.append(chip);
  }
  const to = document.createElement('span');
  to.className = 'wk-ghost-to';
  el.append(to);
  document.body.append(el);
  /* Measured once, before anything moves it: the card's width (it is clamped to
     a slice of the screen, so it can be the wider of the two) and the place it
     starts from, which in a right-to-left page is the right edge — the one
     source of truth about which way a positive translate goes. */
  return { el, to };
}

/* Centred over the finger, above it where there is room and under it where there
   is not — a thumb dropped on the card would hide the one thing the card exists
   to say — and never half off the glass, because a card being read must not be
   the thing that runs off the page.

   Where the card *starts* from is read off the element itself on every move
   (`offsetWidth`/`offsetLeft` ignore transforms), not remembered: the page is
   right-to-left, so the card hangs off the screen's right edge, and a card that
   grows a destination line is a wider card hanging further left. Two reads of a
   small fixed box cost a layout nobody had dirtied; a remembered position would
   have cost the reader a card half outside the screen. */
function moveGhost(e) {
  const el = drag.ghost.el;
  const w = el.offsetWidth;
  const half = w / 2;
  const room = document.documentElement.clientWidth;
  const left = Math.min(Math.max(e.clientX - half, 8), Math.max(room - w - 8, 8));
  const y = e.clientY < 96 ? e.clientY + 26 : e.clientY - 62;
  el.style.transform = `translate(${Math.round(left - el.offsetLeft)}px, ${y}px)`;
}

/* Where a task just landed, said in the one place the reader is already looking:
   the day itself, which is also the row of numbers they will scan afterwards. */
function flashCell(key) {
  const cell = cells.get(key)?.cell;
  if (!cell) return;
  cell.classList.remove('drop');
  cell.classList.add('flash');
  setTimeout(() => cell.classList.remove('flash'), 700);
}

/* Keyboard: a row's own tick and bin are already tab stops, so moving hangs off
   them and no extra stop is added to the page. Left is on a day and right is
   back a day, the way the strip already reads.

   The day a task goes to becomes the day on screen, with the focus back on the
   row's own tick — because with a finger the destination was under it, and with
   a keyboard there is nothing to see otherwise. Moving a task three days on is
   then three presses, not a walk into the next week and back. */
function moveByKey(e) {
  const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
  if (!step) return;
  const row = e.target.closest('.wk-row');
  if (!row) return;
  const task = getTask(row.dataset.id);
  if (!task) return;
  e.preventDefault();
  const id = task.id;
  const key = shiftKey(task.dueDate || shownKey(), step);
  if (!moveTaskToDay(id, key)) return;
  focusKey = key;
  renderPlanner();
  flashCell(key);
  const moved = $('#wkDay').querySelector(`.wk-row[data-id="${id}"] .wk-check`);
  if (moved) moved.focus();
  else cells.get(key)?.cell.focus();
}

export function renderPlanner() {
  const keys = weekKeys();
  renderBar(keys);
  if (keys[0] !== builtWeek) { buildStrip(keys); builtWeek = keys[0]; }
  syncStrip(keys);
  renderDayHead();
  renderLists();
}

/* Every save in the app arrives here. Nothing is redrawn while the page is not
   on screen — the planner is a view, and a view nobody is looking at costs
   nothing. */
function onData() {
  const page = document.getElementById('page-week');
  if (!page || !page.classList.contains('active')) return;
  syncStrip(weekKeys());
  renderLists();
}

export function initPlanner() {
  buildShell();
  syncSpan();
  if (spanPicker) spanPicker.mark(spanSlot);
  subscribe(onData);
  /* Painted at boot as well as on entry: the page can be the one the URL hash
     names, and then no navigation has happened yet. */
  renderPlanner();
}
