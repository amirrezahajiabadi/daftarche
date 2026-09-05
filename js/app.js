import { state } from './state.js';
import { $, faNum } from './utils.js';
import { saveName, loadTheme, saveTheme, loadPomo } from './store.js';
import { notify } from './bus.js';
import { initTasks, initAddForm, renderList, updateEmpty } from './tasks.js';
import { initProgress } from './progress.js';
import { initWeek } from './week.js';
import { initFocusPage, syncFocusPage } from './focus.js';
import { initRoll } from './roll.js';

/* ═══ مدیریت صفحات ═══ */
function initNavigation() {
  const nav = $('#bottomNav');
  nav.addEventListener('click', e => {
    const tab = e.target.closest('.nav-tab');
    if (!tab || tab.classList.contains('active')) return;
    const page = tab.dataset.page;
    // deactivate all
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    // activate selected
    tab.classList.add('active');
    $(`#page-${page}`).classList.add('active');
    // scroll to top
    window.scrollTo({ top: 0 });
    // refresh stats/focus when switching to them
    if (page === 'stats') notify();
    if (page === 'focus') syncFocusPage();
    if (page === 'settings') syncSettings();
  });
}

/* ═══ تم ═══ */
function initTheme() {
  const saved = loadTheme() || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = saved;
  const toggle = () => {
    const n = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = n;
    saveTheme(n);
    syncSettings();
  };
  $('#themeBtn').onclick = toggle;
  // settings page theme toggle
  const stt = $('#settingsToggleTheme');
  if (stt) stt.onclick = toggle;
}

/* ═══ اسم ═══ */
const greetBase = () => {
  const h = new Date().getHours();
  return h < 5 ? 'شب بخیر' : h < 12 ? 'صبح بخیر' : h < 17 ? 'ظهر بخیر' : h < 21 ? 'عصر بخیر' : 'شب بخیر';
};

function applyName() {
  const gt = $('#greetText');
  if (gt) gt.textContent = greetBase() + (state.userName ? `، ${state.userName}` : '');
  const ti = $('#taskInput');
  if (ti) ti.placeholder = state.userName ? `${state.userName}، یه کار جدید بنویس…` : 'یه کار جدید بنویس…';
  syncSettings();
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
    if (!v) { $('#nameCard').classList.add('shake'); setTimeout(() => $('#nameCard').classList.remove('shake'), 350); return; }
    state.userName = v; saveName(v);
    $('#nameOverlay').hidden = true;
    applyName(); updateEmpty();
  });
  $('#skipName').onclick = () => { $('#nameOverlay').hidden = true; };
  $('#nameOverlay').addEventListener('click', e => { if (e.target === e.currentTarget && state.userName) e.currentTarget.hidden = true; });
  const en = $('#editName');
  if (en) en.onclick = () => openNameModal(true);
  const sen = $('#settingsEditName');
  if (sen) sen.onclick = () => openNameModal(true);
}

/* ═══ تنظیمات ═══ */
function syncSettings() {
  const sn = $('#settingsName');
  if (sn) sn.textContent = state.userName || '—';
  const st = $('#settingsTheme');
  if (st) st.textContent = document.documentElement.dataset.theme === 'dark' ? 'تاریک' : 'روشن';
  const sp = $('#settingsPomo');
  if (sp) sp.textContent = `${faNum(state.pomoMin)} دقیقه`;
}

function initSettings() {
  const clearBtn = $('#settingsClearAll');
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (confirm('همهٔ داده‌ها پاک بشه؟ این کار قابل برگشت نیست.')) {
        localStorage.clear();
        location.reload();
      }
    };
  }
}

/* ═══ جستجو ═══ */
function initSearch() {
  let sT;
  const si = $('#searchInput');
  if (si) si.addEventListener('input', e => {
    clearTimeout(sT);
    sT = setTimeout(() => { state.query = e.target.value.trim(); renderList(); }, 140);
  });
}

/* ═══ کیبورد ═══ */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const ro = $('#rollOverlay');
      if (ro && !ro.hidden) ro.hidden = true;
      const no = $('#nameOverlay');
      if (no && !no.hidden && state.userName) no.hidden = true;
    }
  });
}

/* ═══ راه‌اندازی ═══ */
initTheme();
initName();
initNavigation();
initTasks();
initAddForm();
initProgress();
initWeek();
initFocusPage();
initRoll();
initSearch();
initKeyboard();
initSettings();

const dl = $('#dateLine');
if (dl) dl.textContent = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

applyName();
renderList();
notify();
syncSettings();

if (!state.userName) openNameModal();