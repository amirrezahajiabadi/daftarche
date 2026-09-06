/* ═══ Today Dashboard: Greeting, Quick Add, Frog Hero, Today's Tasks, Progress, Mood ═══
   Reuses existing task state, task actions, frog selection and mood/week modules. */

import { state, getTask } from './state.js';
import { $, faNum, dayKey, startOfToday } from './utils.js';
import { P_LABEL, ICONS } from './constants.js';
import { subscribe } from './bus.js';
import { addTask, dueLabel, collapse, setTaskDone } from './tasks.js';
import { findFrog, frogScore } from './progress.js';
import { openFocus } from './focus.js';

const DAY = 864e5;
const PRI_COLORS = { high: '#ff5d5d', mid: '#ffb45c', low: '#7fb069' };
const LIST_CAP = 6;

const dueDiff = due => Math.round((new Date(due + 'T00:00:00') - startOfToday()) / DAY);

/* True when a task belongs to "today": completed today, due today/late,
   important open work, or freshly added today. */
const isTodayPending = t => {
  if (t.done) return false;
  if (t.p === 'high') return true;
  if (t.due) return dueDiff(t.due) <= 0;
  return !!t.created && dayKey(new Date(t.created)) === dayKey(new Date());
};
const isDoneToday = t => !!t.done && !!t.doneAt && dayKey(new Date(t.doneAt)) === dayKey(new Date());
const todayPending = () => state.tasks.filter(isTodayPending);
const todayDone = () => state.tasks.filter(isDoneToday);

/* ── Header: greeting, date, summary ── */
function renderHeader() {
  const greet = $('#todayGreet');
  if (greet) greet.textContent = state.userName ? `سلام ${state.userName} 👋` : 'سلام 👋';
  const date = $('#todayDate');
  if (date) date.textContent = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  const summary = $('#todaySummary');
  if (!summary) return;
  const pending = todayPending(), done = todayDone();
  const n = pending.length, m = done.length;
  if (!n && !m) {
    summary.textContent = 'برنامه‌ات برای امروز خالیه؛ هر کاری خواستی اضافه کن ✨';
    return;
  }
  const parts = [];
  if (n) {
    const casual = pending.some(t => t.p !== 'high' && !(t.due && dueDiff(t.due) < 0));
    parts.push(`${faNum(n)} ${casual ? 'کار برای امروز' : 'کار مهم'}`);
  }
  if (m) parts.push(`${faNum(m)} انجام شده`);
  summary.textContent = parts.join(' · ');
}

/* ── Frog hero ── */
let heroFrog = null;      // task object currently shown
let heroOverride = null;  // task forced by "یکی دیگه"

function renderFrog() {
  const wrap = $('#todayFrog');
  if (!wrap) return;
  let frog = null;
  if (heroOverride) {
    const t = getTask(heroOverride);
    if (t && !t.done) frog = t;
  }
  if (!frog) {
    heroOverride = null;
    frog = findFrog();
  }
  heroFrog = frog;
  if (!frog) {
    wrap.innerHTML = `
      <div class="frog-hero frog-empty">
        <span class="frog-emoji" aria-hidden="true">🐸</span>
        <span class="frog-kicker">قورباغهٔ امروز</span>
        <p class="frog-none">کاری برای قورت دادن نمونده!<br>یه کار تازه اضافه کن یا به خودت استراحت بده 🎉</p>
      </div>`;
    return;
  }
  const dl = frog.due ? dueLabel(frog.due) : null;
  const chips = [`<span class="frog-chip" style="--fc:${PRI_COLORS[frog.p || 'mid']}">اولویت ${P_LABEL[frog.p || 'mid']}</span>`];
  if (dl) {
    const fc = dl.cls === 'late' ? '#d84a4a' : dl.cls === 'today' ? 'var(--accent)' : '#5f8f4d';
    chips.push(`<span class="frog-chip" style="--fc:${fc}">${dl.text}</span>`);
  }
  wrap.innerHTML = `
    <div class="frog-hero">
      <span class="frog-emoji" aria-hidden="true">🐸</span>
      <span class="frog-kicker">قورباغهٔ امروز</span>
      <h3 class="frog-name"></h3>
      <div class="frog-meta">${chips.join('')}</div>
      <div class="frog-actions">
        <button class="frog-start" type="button">شروع کار</button>
        <button class="frog-next" type="button">یکی دیگه</button>
      </div>
    </div>`;
  wrap.querySelector('.frog-name').textContent = frog.text;
}

function pickNextFrog() {
  const pool = state.tasks.filter(t => !t.done);
  if (!pool.length) return;
  const cands = heroFrog ? pool.filter(t => t.id !== heroFrog.id) : pool;
  if (!cands.length) { renderFrog(); return; }
  const pick = cands[Math.random() * cands.length | 0];
  heroOverride = pick.id;
  renderFrog();
}

/* ── Today's tasks ── */
function todayRow(t) {
  const li = document.createElement('li');
  li.className = 't-row' + (t.done ? ' done' : '');
  li.dataset.id = t.id;
  let dueChip = '';
  if (!t.done && t.due) {
    const dl = dueLabel(t.due);
    if (dl.cls === 'late' || dl.cls === 'today' || dl.cls === 'soon') dueChip = `<span class="t-due ${dl.cls}">${dl.text}</span>`;
  }
  li.innerHTML = `
    <button class="t-check" type="button" aria-label="تغییر وضعیت تکمیل">${ICONS.check}</button>
    <span class="t-dot" style="--pr:${PRI_COLORS[t.p || 'mid']}"></span>
    <span class="t-title"></span>
    ${dueChip}
    <button class="t-del" type="button" aria-label="حذف">${ICONS.trash}</button>`;
  li.querySelector('.t-title').textContent = t.text;
  return li;
}

function renderTodayList() {
  const list = $('#todayList');
  if (!list) return;
  const undone = todayPending().slice().sort((a, b) => frogScore(b) - frogScore(a));
  const rows = [...undone, ...todayDone()].slice(0, LIST_CAP);
  list.innerHTML = '';
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 't-empty';
    li.textContent = state.tasks.length
      ? 'چیزی برای امروز برنامه‌ریزی نشده؛ هر کاری خواستی از بالا اضافه کن ✨'
      : 'هنوز کاری نساختی — اولین کار امروزت رو از بالا اضافه کن ✨';
    list.appendChild(li);
    return;
  }
  rows.forEach(t => list.appendChild(todayRow(t)));
}

/* ── Daily progress ── */
function renderProgress() {
  const bar = $('#todayProgBar');
  if (!bar) return;
  const pending = todayPending(), done = todayDone();
  const total = pending.length + done.length;
  const text = $('#todayProgText');
  if (!total) {
    bar.style.width = '0%';
    if (text) text.textContent = 'هنوز کاری برای امروز ثبت نشده';
    return;
  }
  const pct = Math.round(done.length / total * 100);
  bar.style.width = pct + '%';
  bar.classList.toggle('full', pct === 100);
  text.innerHTML = pct === 100
    ? `آفرین! هر <b>${faNum(total)}</b> کار امروز انجام شد 🎉`
    : `<b>${faNum(done.length)}</b> از <b>${faNum(total)}</b> کار انجام شده · ${faNum(pct)}٪`;
}

function renderToday() {
  renderHeader();
  renderFrog();
  renderTodayList();
  renderProgress();
}

/* ── Init ── */
export function initToday() {
  const form = $('#todayAddForm');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = $('#todayInput');
      const text = input ? input.value.trim() : '';
      if (!text) {
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        setTimeout(() => form.classList.remove('shake'), 380);
        return;
      }
      addTask(text, 'mid', 'misc');
      if (input) { input.value = ''; input.focus(); }
    });
  }

  $('#todayAllBtn')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'tasks' })));

  const list = $('#todayList');
  if (list) {
    list.addEventListener('click', e => {
      const row = e.target.closest('.t-row');
      if (!row) return;
      const task = getTask(row.dataset.id);
      if (!task) return;
      if (e.target.closest('.t-check')) setTaskDone(task.id, !task.done);
      else if (e.target.closest('.t-del')) collapse(row, task.id);
    });
  }

  const frog = $('#todayFrog');
  if (frog) {
    frog.addEventListener('click', e => {
      if (e.target.closest('.frog-start') && heroFrog) openFocus(heroFrog.id);
      else if (e.target.closest('.frog-next')) pickNextFrog();
    });
  }

  renderToday();
  subscribe(renderToday);
}
