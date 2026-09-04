/* ═══ منطق تسک‌ها: رندر، افزودن، تغییر، حذف، درگ‌ودراپ، مهلت ═══ */

import { state, getTask } from './state.js';
import { saveTasks } from './store.js';
import { $, faNum, startOfToday, dueKeyFromOffset } from './utils.js';
import { P_CYCLE, P_LABEL, CATS, ICONS } from './constants.js';
import { notify } from './bus.js';
import { confetti } from './confetti.js';
import { recordDay } from './week.js';
import { openFocus, clearFocus } from './focus.js';

const listEl = $('#taskList');
const save = () => saveTasks(state.tasks);

export const matches = t => state.filter === 'all' || (state.filter === 'active' ? !t.done : t.done);
export const visible = () => state.tasks.filter(t =>
  matches(t) &&
  (state.catFilter === 'all' || (t.cat || 'misc') === state.catFilter) &&
  (!state.query || t.text.includes(state.query))
);

/* ── مهلت ── */
function dueLabel(key) {
  if (!key) return null;
  const diff = Math.round((new Date(key + 'T00:00:00') - startOfToday()) / 864e5);
  if (diff < 0) return { cls: 'late', text: diff === -1 ? 'دیروز' : `${faNum(-diff)} روز دیر شده` };
  if (diff === 0) return { cls: 'today', text: 'امروز' };
  if (diff === 1) return { cls: 'soon', text: 'فردا' };
  if (diff <= 7) return { cls: 'soon', text: `${faNum(diff)} روز دیگه` };
  return { cls: 'far', text: new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'long' }).format(new Date(key + 'T00:00:00')) };
}
function nextDue(cur) {
  if (!cur) return dueKeyFromOffset(0);
  if (cur === dueKeyFromOffset(0)) return dueKeyFromOffset(1);
  if (cur === dueKeyFromOffset(1)) return dueKeyFromOffset(7);
  return null;
}
function refreshDueChip(li, task) {
  const btn = li.querySelector('.due-chip');
  if (!btn) return;
  if (!task.due) { btn.className = 'due-chip none'; btn.textContent = '+ مهلت'; btn.title = 'افزودن مهلت'; return; }
  const dl = dueLabel(task.due);
  btn.className = `due-chip ${dl.cls}`;
  btn.textContent = dl.text;
  btn.title = 'مهلت — کلیک برای تغییر';
}

/* ── ساخت آیتم ── */
function createTaskEl(task, delay = 0) {
  const li = document.createElement('li');
  li.className = 'task' + (task.done ? ' done' : '');
  li.dataset.id = task.id;
  li.dataset.p = task.p || 'mid';
  li.draggable = true;
  li.style.animationDelay = delay + 'ms';

  const cat = CATS.find(c => c.key === (task.cat || 'misc')) || CATS[5];
  const dl = dueLabel(task.due);
  const dueHtml = dl
    ? `<button class="due-chip ${dl.cls}" title="مهلت — کلیک برای تغییر">${dl.text}</button>`
    : `<button class="due-chip none" title="افزودن مهلت">+ مهلت</button>`;

  li.innerHTML = `
    <span class="grip" aria-hidden="true">${ICONS.grip}</span>
    <button class="pri-dot" title="اولویت: ${P_LABEL[li.dataset.p]} — کلیک برای تغییر" aria-label="تغییر اولویت"></button>
    <button class="check" aria-label="تکمیل">${ICONS.check}</button>
    <span class="title"></span>
    <button class="cat-tag" style="--cc:${cat.color}" title="دسته: ${cat.label} — کلیک برای تغییر">${cat.label}</button>
    ${dueHtml}
    <button class="focus-btn" title="تایمر تمرکز" aria-label="تایمر تمرکز">${ICONS.clock}</button>
    <button class="del" aria-label="حذف">${ICONS.trash}</button>`;

  li.querySelector('.title').textContent = task.text;
  return li;
}

/* ── رندر و حالت خالی ── */
export function renderList() {
  listEl.innerHTML = '';
  visible().forEach((t, i) => listEl.appendChild(createTaskEl(t, i * 45)));
  updateEmpty();
}

export function updateEmpty() {
  const anyVisible = [...listEl.children].some(el => !el.classList.contains('removing'));
  $('#empty').hidden = anyVisible;
  if (anyVisible) return;
  const allDone = state.tasks.length && state.tasks.every(t => t.done);
  $('#artDone').hidden = !allDone;
  $('#artEmpty').hidden = allDone;
  const voc = state.userName ? `${state.userName} جان، ` : '';
  $('#emptyMsg').textContent =
    state.query ? 'چیزی پیدا نشد. عبارت دیگری را امتحان کن.'
    : !state.tasks.length ? voc + 'لیستت خالیه. اولین کارت رو اضافه کن.'
    : state.catFilter !== 'all' ? `توی دستهٔ «${CATS.find(c => c.key === state.catFilter)?.label}» کاری نیست.`
    : state.filter === 'done' ? 'هنوز کاری را تمام نکرده‌ای.'
    : allDone ? voc + 'همهٔ کارها انجام شد. خسته نباشی!'
    : voc + 'لیستت خالیه. اولین کارت رو اضافه کن.';
}

/* ── عملیات ── */
function toggleTask(li, task) {
  task.done = !task.done;
  if (task.done) { task.doneAt = Date.now(); recordDay(); }
  else delete task.doneAt;
  save();
  li.classList.toggle('done', task.done);
  notify();
  if (task.done && state.tasks.every(t => t.done)) confetti();
  if (!matches(task)) setTimeout(() => collapse(li, task.id), 650);
}

export function collapse(el, id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  save();
  if (state.focus && state.focus.taskId === id) clearFocus();
  el.style.height = el.offsetHeight + 'px';
  el.style.overflow = 'hidden';
  el.style.transition = 'all .32s ease';
  requestAnimationFrame(() => {
    el.classList.add('removing');
    Object.assign(el.style, {
      height: '0', paddingTop: '0', paddingBottom: '0', marginBottom: '0',
      opacity: '0', transform: 'translateX(40px) scale(.94)', borderColor: 'transparent'
    });
  });
  setTimeout(() => { el.remove(); updateEmpty(); }, 330);
  notify();
}

export function flashTask(id) {
  const el = listEl.querySelector(`[data-id="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
}

/* ── درگ‌ودراپ ── */
function syncOrder() {
  const order = [...listEl.querySelectorAll('.task')].map(el => el.dataset.id);
  const map = Object.fromEntries(state.tasks.map(t => [t.id, t]));
  state.tasks = [...order.map(id => map[id]), ...state.tasks.filter(t => !order.includes(t.id))];
  save();
}

/* ── رویدادها ── */
export function initTasks() {
  listEl.addEventListener('click', e => {
    const li = e.target.closest('.task');
    if (!li) return;
    const task = getTask(li.dataset.id);
    if (!task) return;

    if (e.target.closest('.check')) toggleTask(li, task);
    else if (e.target.closest('.del')) collapse(li, task.id);
    else if (e.target.closest('.focus-btn')) openFocus(task.id);
    else if (e.target.closest('.pri-dot')) {
      task.p = P_CYCLE[task.p || 'mid'];
      save();
      li.dataset.p = task.p;
      e.target.title = `اولویت: ${P_LABEL[task.p]} — کلیک برای تغییر`;
    }
    else if (e.target.closest('.cat-tag')) {
      const btn = e.target.closest('.cat-tag');
      const idx = CATS.findIndex(c => c.key === (task.cat || 'misc'));
      const nxt = CATS[(idx + 1) % CATS.length];
      task.cat = nxt.key;
      save();
      btn.style.setProperty('--cc', nxt.color);
      btn.textContent = nxt.label;
      btn.title = `دسته: ${nxt.label} — کلیک برای تغییر`;
      notify();
      if (state.catFilter !== 'all' && state.catFilter !== nxt.key) setTimeout(() => collapse(li, task.id), 500);
    }
    else if (e.target.closest('.due-chip')) {
      task.due = nextDue(task.due);
      save();
      refreshDueChip(li, task);
      notify();
    }
  });

  listEl.addEventListener('dblclick', e => {
    const li = e.target.closest('.task');
    const titleEl = e.target.closest('.title');
    if (!li || !titleEl) return;
    const task = getTask(li.dataset.id);
    const inp = document.createElement('input');
    inp.className = 'title-input';
    inp.value = task.text;
    titleEl.replaceWith(inp);
    inp.focus(); inp.select();
    let doneE = false;
    const commit = () => {
      if (doneE) return;
      doneE = true;
      const v = inp.value.trim();
      if (v) { task.text = v; save(); }
      renderList();
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') commit();
      if (ev.key === 'Escape') { doneE = true; renderList(); }
    });
  });

  listEl.addEventListener('dragstart', e => {
    const li = e.target.closest('.task');
    if (li) { li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
  });
  listEl.addEventListener('dragend', e => {
    const li = e.target.closest('.task');
    if (li) { li.classList.remove('dragging'); syncOrder(); }
  });
  listEl.addEventListener('dragover', e => {
    e.preventDefault();
    const dragging = listEl.querySelector('.dragging');
    if (!dragging) return;
    const after = [...listEl.querySelectorAll('.task:not(.dragging)')]
      .find(el => e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
    after ? listEl.insertBefore(dragging, after) : listEl.appendChild(dragging);
  });
}

/* ── فرم افزودن ── */
function buildCatRow() {
  const row = $('#catRow .cat-scroll');
  CATS.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.cat = c.key;
    b.style.setProperty('--cc', c.color);
    b.innerHTML = `<span class="dot"></span>${c.label}`;
    if (c.key === state.selCat) b.classList.add('sel');
    row.appendChild(b);
  });
}

export function initAddForm() {
  $('#priRow').addEventListener('click', e => {
    const b = e.target.closest('button[data-p]');
    if (!b) return;
    document.querySelector('.pri-row .sel')?.classList.remove('sel');
    b.classList.add('sel');
    state.selPri = b.dataset.p;
  });

  buildCatRow();
  $('#catRow').addEventListener('click', e => {
    const b = e.target.closest('button[data-cat]');
    if (!b) return;
    $('#catRow .sel')?.classList.remove('sel');
    b.classList.add('sel');
    state.selCat = b.dataset.cat;
  });

  $('#dueRow').addEventListener('click', e => {
    const b = e.target.closest('button[data-due]');
    if (!b) return;
    $('#dueRow .sel')?.classList.remove('sel');
    b.classList.add('sel');
    state.selDue = b.dataset.due;
  });

  $('#addForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#taskInput'), text = input.value.trim();
    if (!text) {
      e.currentTarget.classList.add('shake');
      setTimeout(() => e.currentTarget.classList.remove('shake'), 350);
      return;
    }
    const task = {
      id: Date.now() + '' + Math.random().toString(16).slice(2),
      text, done: false, p: state.selPri, cat: state.selCat,
      due: state.selDue === 'none' ? undefined : dueKeyFromOffset(state.selDue),
    };
    state.tasks.unshift(task);
    save();
    if (matches(task) && (state.catFilter === 'all' || state.catFilter === state.selCat) && !state.query) {
      listEl.prepend(createTaskEl(task));
      updateEmpty();
    }
    input.value = '';
    input.focus();
    notify();
  });
}