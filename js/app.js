/* ═══ نقطهٔ شروع اپ: اتصال همهٔ ماژول‌ها ═══ */

import { state } from './state.js';
import { $ } from './utils.js';
import { saveName, loadTheme, saveTheme } from './store.js';
import { notify } from './bus.js';
import { initTasks, initAddForm, renderList, updateEmpty } from './tasks.js';
import { initProgress } from './progress.js';
import { initWeek } from './week.js';
import { initFocus, closeFocusOverlay } from './focus.js';
import { initRoll } from './roll.js';

/* ── تم ── */
function initTheme() {
  document.documentElement.dataset.theme =
    loadTheme() || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  $('#themeBtn').onclick = () => {
    const n = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = n;
    saveTheme(n);
  };
}

/* ── اسم کاربر و سلام ── */
const greetBase = () => {
  const h = new Date().getHours();
  return h < 5 ? 'شب بخیر' : h < 12 ? 'صبح بخیر' : h < 17 ? 'ظهر بخیر' : h < 21 ? 'عصر بخیر' : 'شب بخیر';
};

function applyName() {
  $('#greetText').textContent = greetBase() + (state.userName ? `، ${state.userName}` : '');
  $('#taskInput').placeholder = state.userName ? `${state.userName}، یه کار جدید بنویس…` : 'یه کار جدید بنویس…';
}

function openNameModal(edit = false) {
  $('#nameTitle').textContent = edit ? 'اسمت رو عوض کن' : 'سلام! اسمت چیه؟';
  $('#nameInput').value = edit ? state.userName : '';
  $('#nameOverlay').hidden = false;
  setTimeout(() => $('#nameInput').focus(), 350);
}

function initName() {
  $('#nameForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#nameInput').value.trim();
    if (!v) {
      $('#nameCard').classList.add('shake');
      setTimeout(() => $('#nameCard').classList.remove('shake'), 350);
      return;
    }
    state.userName = v;
    saveName(v);
    $('#nameOverlay').hidden = true;
    applyName();
    updateEmpty();
  });
  $('#skipName').onclick = () => { $('#nameOverlay').hidden = true; };
  $('#nameOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && state.userName) e.currentTarget.hidden = true;
  });
  $('#editName').onclick = () => openNameModal(true);
}

/* ── جستجو ── */
function initSearch() {
  let sT;
  $('#searchInput').addEventListener('input', e => {
    clearTimeout(sT);
    sT = setTimeout(() => { state.query = e.target.value.trim(); renderList(); }, 140);
  });
}

/* ── کلیدهای میان‌بر ── */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('#rollOverlay').hidden) $('#rollOverlay').hidden = true;
      if (!$('#focusOverlay').hidden) closeFocusOverlay();
      if (!$('#nameOverlay').hidden && state.userName) $('#nameOverlay').hidden = true;
    }
  });
}

/* ── راه‌اندازی ── */
initTheme();
initName();
initTasks();
initAddForm();
initProgress();
initWeek();
initFocus();
initRoll();
initSearch();
initKeyboard();

$('#dateLine').textContent =
  new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

applyName();
renderList();
notify();

if (!state.userName) openNameModal();