import { state, getTask } from './state.js';
import { saveTasks } from './store.js';
import { $, faNum, startOfToday, dueKeyFromOffset, normalizeFa, parseDurationMin, formatDuration } from './utils.js';
import { P_CYCLE, P_LABEL, CATS, ICONS } from './constants.js';
import { notify } from './bus.js';
import { bellHtml, refreshBell, setTaskNotify, notificationsSupported, bindPersistence } from './notifications.js';
import { confetti } from './confetti.js';
import { recordDay } from './week.js';
import { openFocus, clearFocus } from './focus.js';
import { openDuePicker } from './duepicker.js';
import { formatJalaliDate } from './jalali.js';

const listEl = $('#taskList');
const save = () => saveTasks(state.tasks);

/* The notifications module persists through these hooks so it never touches
   the task list's internals directly. */
bindPersistence({ save, notify });

export const matches = t => state.filter === 'all' || (state.filter === 'active' ? !t.done : t.done);
export const visible = () => state.tasks.filter(t =>
  matches(t) &&
  (state.catFilter === 'all' || (t.cat || 'misc') === state.catFilter) &&
  (!state.query || normalizeFa(t.text).includes(normalizeFa(state.query)))
);

function animatePriDotChange(dot) {
  dot.classList.remove('changed'); void dot.offsetWidth; dot.classList.add('changed');
  setTimeout(() => dot.classList.remove('changed'), 650);
}
function animateChipFlip(chip) {
  chip.classList.remove('flipped'); void chip.offsetWidth; chip.classList.add('flipped');
  setTimeout(() => chip.classList.remove('flipped'), 450);
}

/* ── Estimated Duration ── */
const DUR_CYCLE = [null, 5, 15, 30, 60, 90];
let durClickTimer = null;
function nextDur(cur) {
  const i = DUR_CYCLE.indexOf(cur);
  return DUR_CYCLE[(i + 1) % DUR_CYCLE.length];
}
function refreshDurChip(li, task) {
  const btn = li.querySelector('.dur-chip');
  if (!btn) return;
  if (!task.durationMin) {
    btn.className = 'dur-chip none';
    btn.textContent = '+ زمان';
    btn.title = 'افزودن زمان تقریبی';
    return;
  }
  const label = formatDuration(task.durationMin);
  btn.className = 'dur-chip';
  btn.textContent = label;
  btn.title = `زمان تقریبی: ${label} — کلیک برای تغییر`;
}

/* ── Due Date (Jalali) ── */
export function dueLabel(key) {
  if (!key) return null;
  const d = new Date(key + 'T00:00:00');
  const diff = Math.round((d - startOfToday()) / 864e5);
  const date = formatJalaliDate(d);
  if (diff < 0) return { cls: 'late', text: 'گذشته از مهلت', date };
  if (diff === 0) return { cls: 'today', text: 'امروز', date };
  if (diff === 1) return { cls: 'soon', text: 'فردا', date };
  if (diff === 2) return { cls: 'soon', text: 'پس‌فردا', date };
  if (diff <= 7) return { cls: 'soon', text: `${faNum(diff)} روز دیگه`, date };
  return { cls: 'far', text: date, date, ltr: true };
}
function refreshDueChip(li, task) {
  const btn = li.querySelector('.due-chip');
  if (!btn) return;
  if (!task.dueDate) { btn.className = 'due-chip none'; btn.innerHTML = '+ مهلت'; btn.title = 'افزودن مهلت'; return; }
  const dl = dueLabel(task.dueDate);
  // A completed task never reads as overdue — show its date neutrally instead
  const doneLate = task.done && dl.cls === 'late';
  btn.className = `due-chip ${doneLate ? 'far' : dl.cls}`;
  btn.innerHTML = doneLate || dl.ltr ? `<span dir="ltr">${doneLate ? dl.date : dl.text}</span>` : dl.text;
  btn.title = `مهلت — ${dl.date} — کلیک برای تغییر`;
}

/* ── Build Item ── */
function createTaskEl(task, delay = 0) {
  const li = document.createElement('li');
  li.className = 'task' + (task.done ? ' done' : '');
  li.dataset.id = task.id; li.dataset.p = task.p || 'mid';
  li.draggable = true; li.style.animationDelay = delay + 'ms';
  const cat = CATS.find(c => c.key === (task.cat || 'misc')) || CATS[5];
  const dl = dueLabel(task.dueDate);
  const doneLate = dl && task.done && dl.cls === 'late';
  const dueText = dl && (doneLate || dl.ltr) ? `<span dir="ltr">${doneLate ? dl.date : dl.text}</span>` : dl ? dl.text : '';
  const dueHtml = dl
    ? `<button class="due-chip ${doneLate ? 'far' : dl.cls}" title="مهلت — ${dl.date} — کلیک برای تغییر">${dueText}</button>`
    : `<button class="due-chip none" title="افزودن مهلت">+ مهلت</button>`;
  const durLabel = formatDuration(task.durationMin);
  const durHtml = durLabel
    ? `<button class="dur-chip" title="زمان تقریبی: ${durLabel} — کلیک برای تغییر">${durLabel}</button>`
    : `<button class="dur-chip none" title="افزودن زمان تقریبی">+ زمان</button>`;
  li.innerHTML = `
    <span class="grip" aria-hidden="true">${ICONS.grip}</span>
    <button class="pri-dot" title="اولویت: ${P_LABEL[li.dataset.p]} — کلیک برای تغییر" aria-label="تغییر اولویت"></button>
    <button class="check" aria-label="تکمیل">${ICONS.check}</button>
    <span class="title"></span>
    <button class="cat-tag" style="--cc:${cat.color}" title="دسته: ${cat.label} — کلیک برای تغییر">${cat.label}</button>
    ${durHtml}
    ${dueHtml}
    ${notificationsSupported() ? bellHtml(task) : ''}
    <button class="focus-btn" title="تایمر تمرکز" aria-label="تایمر تمرکز">${ICONS.clock}</button>
    <button class="del" aria-label="حذف">${ICONS.trash}</button>`;
  li.querySelector('.title').textContent = task.text;
  return li;
}

/* ── Render + Empty State ── */
export function renderList() {
  listEl.innerHTML = '';
  visible().forEach((t, i) => listEl.appendChild(createTaskEl(t, i * 45)));
  updateEmpty();
}

export function updateEmpty() {
  const anyVisible = [...listEl.children].some(el => !el.classList.contains('removing'));
  $('#empty').hidden = anyVisible;
  // The empty-state CTA is presentation-only and rebuilt on each render
  $('#emptyAddBtn')?.remove();
  if (anyVisible) return;
  const allDone = state.tasks.length && state.tasks.every(t => t.done);
  $('#artDone').hidden = !allDone; $('#artEmpty').hidden = allDone;
  const voc = state.userName ? `${state.userName} جان، ` : '';
  $('#emptyMsg').textContent =
    state.query ? 'چیزی پیدا نشد. عبارت دیگری را امتحان کن.'
    : !state.tasks.length ? 'فعلاً کاری روی میز نیست.'
    : state.catFilter !== 'all' ? `توی دستهٔ «${CATS.find(c => c.key === state.catFilter)?.label}» کاری نیست.`
    : state.filter === 'done' ? 'هنوز کاری را تمام نکرده‌ای.'
    : allDone ? 'همهٔ کارهات انجام شده.'
    : voc + 'لیستت خالیه. اولین کارت رو اضافه کن.';
  // A single calm CTA when the shelf is truly empty — no pressure copy
  if (!state.tasks.length || allDone) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'empty-add';
    btn.id = 'emptyAddBtn';
    btn.textContent = allDone ? 'افزودن کار جدید' : 'افزودن کار';
    btn.addEventListener('click', () => $('#taskInput')?.focus());
    $('#empty').appendChild(btn);
  }
}

/* ── Actions ── */

/* Shared completion helper used by the Tasks page and the Today list */
export function setTaskDone(id, done) {
  const task = getTask(id);
  if (!task || task.done === done) return;
  task.done = done;
  if (done) { task.doneAt = Date.now(); recordDay(); } else task.doneAt = null;
  save(); notify();
  if (done && state.tasks.every(t => t.done)) confetti();
}

function toggleTask(li, task) {
  setTaskDone(task.id, !task.done);
  li.classList.toggle('done', task.done);
  if (!matches(task)) setTimeout(() => hideFromView(li), 650);
}

/* Shared creation used by the Tasks form and the Today quick add */
export function addTask(text, p = 'mid', cat = 'misc', dueDate, durationMin = null) {
  const task = {
    id: Date.now() + '' + Math.random().toString(16).slice(2),
    text, done: false, p, cat,
    created: Date.now(),
    durationMin: parseDurationMin(durationMin),
  };
  task.dueDate = dueDate || null;
  state.tasks.unshift(task);
  save(); notify();
  return task;
}

/* ── Undo Toast ── */
let undoTimer = null, lastDeleted = null;
function showUndo(task, index) {
  lastDeleted = { task, index };
  const toast = $('#undoToast');
  // Reset the toast bar animation
  const bar = toast.querySelector('.toast-bar');
  bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(undoTimer);
  undoTimer = setTimeout(commitUndo, 5000);
}
function commitUndo() {
  const toast = $('#undoToast');
  toast.classList.remove('show');
  setTimeout(() => { toast.hidden = true; }, 300);
  lastDeleted = null;
}
function performUndo() {
  if (!lastDeleted) return;
  clearTimeout(undoTimer);
  const { task, index } = lastDeleted;
  // Reinsert the task at its approximate position
  const insertAt = Math.min(index, state.tasks.length);
  state.tasks.splice(insertAt, 0, task);
  save();
  // If it's visible in the current view, add it back
  if (matches(task) && (state.catFilter === 'all' || state.catFilter === (task.cat || 'misc')) && (!state.query || task.text.includes(state.query))) {
    const el = createTaskEl(task);
    const children = [...listEl.children];
    if (insertAt >= children.length) listEl.appendChild(el);
    else listEl.insertBefore(el, children[insertAt]);
    updateEmpty();
  }
  notify();
  commitUndo();
}

/* Shared exit animation for removing an item from the list (visual only, no state change) */
function animateOut(el, onDone) {
  el.style.height = el.offsetHeight + 'px'; el.style.overflow = 'hidden'; el.style.transition = 'all .32s ease';
  requestAnimationFrame(() => {
    el.classList.add('removing');
    Object.assign(el.style, { height: '0', paddingTop: '0', paddingBottom: '0', marginBottom: '0', opacity: '0', transform: 'translateX(40px) scale(.94)', borderColor: 'transparent' });
  });
  setTimeout(() => { el.remove(); updateEmpty(); onDone && onDone(); }, 330);
}

/* Actually delete a task (trash button) — removes it from state and shows the undo toast */
export function collapse(el, id) {
  const task = state.tasks.find(t => t.id === id);
  const index = state.tasks.findIndex(t => t.id === id);
  if (task) lastDeleted = null; // Prevent conflicts
  state.tasks = state.tasks.filter(t => t.id !== id);
  save();
  if (state.session && state.session.taskId === id) clearFocus();
  animateOut(el);
  notify();
  if (task) showUndo(task, index);
}

/* Hide a task from the current view when it no longer matches the filter/category
   (e.g. after checking it off in the "Active" filter, or changing its category while a category filter is set)
   Unlike collapse, this function does not remove any data from state.tasks. */
export function hideFromView(el) {
  animateOut(el);
}

export function flashTask(id) {
  const el = listEl.querySelector(`[data-id="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600);
}

/* ── Drag and Drop ── */
function syncOrder() {
  const order = [...listEl.querySelectorAll('.task')].map(el => el.dataset.id);
  const map = Object.fromEntries(state.tasks.map(t => [t.id, t]));
  state.tasks = [...order.map(id => map[id]), ...state.tasks.filter(t => !order.includes(t.id))];
  save();
}

/* ── Events ── */
export function initTasks() {
  listEl.addEventListener('click', async e => {
    const li = e.target.closest('.task'); if (!li) return;
    const task = getTask(li.dataset.id); if (!task) return;
    if (e.target.closest('.check')) toggleTask(li, task);
    else if (e.target.closest('.del')) collapse(li, task.id);
    else if (e.target.closest('.focus-btn')) openFocus(task.id);
    else if (e.target.closest('.pri-dot')) {
      const dot = e.target.closest('.pri-dot');
      task.p = P_CYCLE[task.p || 'mid']; save(); li.dataset.p = task.p;
      dot.title = `اولویت: ${P_LABEL[task.p]} — کلیک برای تغییر`;
      animatePriDotChange(dot);
    }
    else if (e.target.closest('.cat-tag')) {
      const btn = e.target.closest('.cat-tag');
      const idx = CATS.findIndex(c => c.key === (task.cat || 'misc'));
      const nxt = CATS[(idx + 1) % CATS.length];
      task.cat = nxt.key; save();
      btn.style.setProperty('--cc', nxt.color); btn.textContent = nxt.label;
      btn.title = `دسته: ${nxt.label} — کلیک برای تغییر`;
      animateChipFlip(btn); notify();
      if (state.catFilter !== 'all' && state.catFilter !== nxt.key) setTimeout(() => hideFromView(li), 500);
    }
    else if (e.target.closest('.due-chip')) {
      // Open the Jalali date picker to add / change / remove the deadline
      openDuePicker({
        current: task.dueDate || null,
        onPick: key => {
          const dateChanged = task.dueDate !== key;
          task.dueDate = key; save();
          // A new deadline re-arms the reminder so nothing fires twice for one date
          if (dateChanged && task.notifiedStatus) task.notifiedStatus = 'none';
          refreshDueChip(li, task);
          const chip = li.querySelector('.due-chip');
          if (chip) animateChipFlip(chip);
          notify();
        },
      });
    }
    else if (e.target.closest('.bell-btn')) {
      const next = !(task.notify === true);
      const granted = await setTaskNotify(task, next);
      if (granted) {
        refreshBell(li, task);
        const bell = li.querySelector('.bell-btn');
        if (bell) animateChipFlip(bell);
      }
    }
    else if (e.target.closest('.dur-chip')) {
      const btn = e.target.closest('.dur-chip');
      // Defer the cycle briefly so a double-click can open the editor instead
      clearTimeout(durClickTimer);
      durClickTimer = setTimeout(() => {
        task.durationMin = nextDur(task.durationMin); save();
        refreshDurChip(li, task); animateChipFlip(btn); notify();
      }, 240);
    }
  });

  /* Single-click cycles chips; double-click opens a title / duration editor */
  listEl.addEventListener('dblclick', e => {
    const li = e.target.closest('.task'); if (!li) return;
    const task = getTask(li.dataset.id); if (!task) return;
    const titleEl = e.target.closest('.title');
    if (titleEl) {
      const inp = document.createElement('input'); inp.className = 'title-input'; inp.value = task.text;
      titleEl.replaceWith(inp); inp.focus(); inp.select();
      let doneE = false;
      const commit = () => { if (doneE) return; doneE = true; const v = inp.value.trim(); if (v) { task.text = v; save(); } renderList(); };
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') { doneE = true; renderList(); } });
      return;
    }
    const durEl = e.target.closest('.dur-chip');
    if (durEl) {
      clearTimeout(durClickTimer);
      const inp = document.createElement('input');
      inp.className = 'dur-input'; inp.type = 'number'; inp.min = '1'; inp.max = '480'; inp.placeholder = 'دقیقه';
      inp.value = task.durationMin || '';
      inp.setAttribute('aria-label', 'مدت زمان تقریبی به دقیقه');
      durEl.replaceWith(inp); inp.focus(); inp.select();
      let doneE = false;
      const commit = () => {
        if (doneE) return; doneE = true;
        const v = parseDurationMin(inp.value);
        if (v !== null) { task.durationMin = v; save(); }
        renderList();
      };
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') { doneE = true; renderList(); } });
    }
  });

  listEl.addEventListener('dragstart', e => { const li = e.target.closest('.task'); if (li) { li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; } });
  listEl.addEventListener('dragend', e => { const li = e.target.closest('.task'); if (li) { li.classList.remove('dragging'); syncOrder(); } });
  listEl.addEventListener('dragover', e => {
    e.preventDefault(); const dragging = listEl.querySelector('.dragging'); if (!dragging) return;
    const after = [...listEl.querySelectorAll('.task:not(.dragging)')].find(el => e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
    after ? listEl.insertBefore(dragging, after) : listEl.appendChild(dragging);
  });

  /* Clear-search button */
  const searchInput = $('#searchInput'), searchClear = $('#searchClear');
  if (searchInput && searchClear) {
    searchInput.addEventListener('input', () => { searchClear.hidden = !searchInput.value; });
    searchClear.addEventListener('click', () => {
      searchInput.value = ''; state.query = ''; searchClear.hidden = true;
      renderList(); searchInput.focus();
    });
  }

  /* Undo button */
  const undoBtn = $('#undoBtn');
  if (undoBtn) undoBtn.addEventListener('click', performUndo);
}

/* ── Add Form ── */
function buildCatRow() {
  const row = $('#catRow .cat-scroll');
  CATS.forEach(c => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.cat = c.key;
    b.style.setProperty('--cc', c.color);
    b.innerHTML = `<span class="dot"></span>${c.label}`;
    if (c.key === state.selCat) b.classList.add('sel');
    row.appendChild(b);
  });
}

export function initAddForm() {
  $('#priRow').addEventListener('click', e => {
    const b = e.target.closest('button[data-p]'); if (!b) return;
    document.querySelector('.pri-row .sel')?.classList.remove('sel');
    b.classList.add('sel'); state.selPri = b.dataset.p;
  });
  buildCatRow();
  $('#catRow').addEventListener('click', e => {
    const b = e.target.closest('button[data-cat]'); if (!b) return;
    $('#catRow .sel')?.classList.remove('sel');
    b.classList.add('sel'); state.selCat = b.dataset.cat;
  });
  /* Due date row: quick options امروز/فردا/پس‌فردا + Jalali picker for a custom date */
  const dueRow = $('#dueRow');
  const dueCustomBtn = $('#dueCustom');
  const renderDueRow = () => {
    if (!dueRow || !dueCustomBtn) return;
    dueRow.querySelectorAll('button[data-due]').forEach(b => b.classList.remove('sel'));
    if (/^\d{4}-\d{2}-\d{2}$/.test(state.selDue)) {
      dueCustomBtn.classList.add('sel');
      dueCustomBtn.textContent = formatJalaliDate(new Date(state.selDue + 'T00:00:00'));
    } else {
      const q = dueRow.querySelector(`button[data-due="${state.selDue}"]`);
      if (q) q.classList.add('sel');
      dueCustomBtn.textContent = 'تاریخ…';
    }
  };
  dueRow.addEventListener('click', e => {
    const b = e.target.closest('button[data-due]'); if (!b) return;
    if (b.dataset.due === 'custom') {
      openDuePicker({
        current: /^\d{4}-\d{2}-\d{2}$/.test(state.selDue) ? state.selDue : null,
        onPick: key => { state.selDue = key; renderDueRow(); },
      });
      return;
    }
    state.selDue = b.dataset.due;
    renderDueRow();
  });
  renderDueRow();

  /* Duration row: presets, plus a custom minute input with validation */
  const durInput = $('#durCustom');
  const durHint = $('#durHint');
  const showDurHint = show => {
    if (durHint) {
      durHint.textContent = 'زمان باید عددی صحیح بین ۱ تا ۴۸۰ دقیقه باشه';
      durHint.hidden = !show;
    }
  };
  $('#durRow').addEventListener('click', e => {
    const b = e.target.closest('button[data-dur]'); if (!b) return;
    $('#durRow .sel')?.classList.remove('sel');
    b.classList.add('sel');
    const v = b.dataset.dur;
    if (v === 'custom') {
      if (durInput) { durInput.hidden = false; durInput.focus(); }
      state.selDur = parseDurationMin(durInput ? durInput.value : null);
    } else {
      if (durInput) { durInput.hidden = true; durInput.value = ''; }
      state.selDur = v === 'none' ? null : Number(v);
    }
    showDurHint(false);
  });
  if (durInput) {
    durInput.addEventListener('input', () => {
      state.selDur = parseDurationMin(durInput.value);
      showDurHint(durInput.value !== '' && state.selDur === null);
    });
    durInput.addEventListener('blur', () => { if (durInput.value === '') showDurHint(false); });
  }

  $('#addForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#taskInput'), text = input.value.trim();
    if (!text) { e.currentTarget.classList.add('shake'); setTimeout(() => e.currentTarget.classList.remove('shake'), 350); return; }
    const dueVal = state.selDue === 'none' ? undefined
      : /^\d{4}-\d{2}-\d{2}$/.test(state.selDue) ? state.selDue : dueKeyFromOffset(Number(state.selDue));
    const task = addTask(text, state.selPri, state.selCat, dueVal, state.selDur);
    if (matches(task) && (state.catFilter === 'all' || state.catFilter === state.selCat) && !state.query) {
      const el = createTaskEl(task);
      listEl.prepend(el);
      // Glow highlight on the newly added task
      el.classList.add('just-added');
      setTimeout(() => el.classList.remove('just-added'), 1500);
      updateEmpty();
    }
    input.value = ''; input.focus();
    // Hide the clear-search button
    const sc = $('#searchClear'); if (sc) sc.hidden = true;
  });
}