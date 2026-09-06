import { state } from './state.js';
import { $ } from './utils.js';
import { saveName, loadTheme, saveTheme } from './store.js';
import { notify } from './bus.js';
import { initTasks, initAddForm, renderList, updateEmpty } from './tasks.js';
import { initProgress } from './progress.js';
import { initWeek } from './week.js';
import { initFocusPage, syncFocusPage } from './focus.js';
import { initRoll } from './roll.js';
import { initLibrary } from './library.js';
import { initReader } from './reader.js';
import { initProfile, renderProfile } from './profile.js';
import { initToday } from './today.js';

/* Each section is initialized separately; an error in one section doesn't break the rest of the app */
const safe = (name, fn) => {
  try { fn(); }
  catch (err) { console.error(`[دَفتَرچه] خطا در راه‌اندازی «${name}»:`, err); }
};

/* ═══ Navigation + Glass Glider ═══
   Primary tabs: Today, Tasks, Focus, Library.
   Profile & Stats stay as regular pages: Profile opens from the header avatar,
   Stats opens from the Profile page. */
function initNavigation() {
  const nav = $('#bottomNav');
  if (!nav) return;

  /* Sliding capsule for the active tab */
  const glider = document.createElement('span');
  glider.className = 'nav-glider';
  nav.prepend(glider);

  const moveGlider = () => {
    const act = nav.querySelector('.nav-tab.active');
    if (!act) { glider.style.opacity = 0; return; }
    glider.style.opacity = 1;
    glider.style.width = act.offsetWidth + 'px';
    glider.style.transform = `translateX(${act.offsetLeft}px)`;
  };

  const showPage = page => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pg = $(`#page-${page}`);
    if (pg) pg.classList.add('active');
    nav.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
    window.scrollTo({ top: 0 });
    moveGlider();
    if (page === 'today' || page === 'stats') notify();
    if (page === 'tasks') renderList(); // Keep the imperative list in sync with state
    if (page === 'focus') syncFocusPage();
    if (page === 'profile') renderProfile();
  };

  /* Any module can request a page change (avatar, frog start, stats entry) */
  window.addEventListener('navigate', e => showPage(String(e.detail || '')));

  nav.addEventListener('click', e => {
    const tab = e.target.closest('.nav-tab');
    if (!tab || tab.classList.contains('active')) return;
    showPage(tab.dataset.page);
  });

  addEventListener('resize', moveGlider);
  addEventListener('load', moveGlider);
  if (document.fonts?.ready) document.fonts.ready.then(moveGlider);
  moveGlider();
}

/* ═══ Theme ═══ */
function initTheme() {
  const saved = loadTheme() || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = saved;
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.onclick = () => {
      const n = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = n;
      saveTheme(n);
      renderProfile();
    };
  });
}

/* ═══ Name ═══ */
const greetBase = () => {
  const h = new Date().getHours();
  return h < 5 ? 'شب بخیر' : h < 12 ? 'صبح بخیر' : h < 17 ? 'ظهر بخیر' : h < 21 ? 'عصر بخیر' : 'شب بخیر';
};

function applyName() {
  const gt = $('#greetText');
  if (gt) gt.textContent = greetBase() + (state.userName ? `، ${state.userName}` : '');
  const ti = $('#taskInput');
  if (ti) ti.placeholder = state.userName ? `${state.userName}، یه کار جدید بنویس…` : 'یه کار جدید بنویس…';
  renderProfile();
}

function openNameModal(edit = false) {
  const t = $('#nameTitle'), i = $('#nameInput'), o = $('#nameOverlay');
  if (!t || !i || !o) return;
  t.textContent = edit ? 'اسمت رو عوض کن' : 'سلام! اسمت چیه؟';
  i.value = edit ? state.userName : '';
  o.hidden = false;
  setTimeout(() => i.focus(), 350);
}

function initName() {
  $('#nameForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#nameInput').value.trim();
    if (!v) {
      $('#nameCard')?.classList.add('shake');
      setTimeout(() => $('#nameCard')?.classList.remove('shake'), 350);
      return;
    }
    state.userName = v; saveName(v);
    $('#nameOverlay').hidden = true;
    applyName(); updateEmpty();
    notify(); // Refresh the Today greeting with the new name
  });
  const skip = $('#skipName');
  if (skip) skip.onclick = () => { $('#nameOverlay').hidden = true; };
  $('#nameOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget && state.userName) e.currentTarget.hidden = true;
  });
  window.addEventListener('edit-name', () => openNameModal(true));
}

/* ═══ Search ═══ */
function initSearch() {
  let sT;
  const si = $('#searchInput');
  if (!si) return;
  si.addEventListener('input', e => {
    clearTimeout(sT);
    sT = setTimeout(() => { state.query = e.target.value.trim(); renderList(); }, 140);
  });
}

/* ═══ Keyboard ═══ */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const ro = $('#rollOverlay'); if (ro && !ro.hidden) ro.hidden = true;
      const no = $('#nameOverlay'); if (no && !no.hidden && state.userName) no.hidden = true;
      const ao = $('#avatarOverlay'); if (ao && !ao.hidden) ao.hidden = true;
    }
  });
}

/* ═══ Startup ═══ */
safe('تم', initTheme);
safe('اسم', initName);
safe('ناوبری', initNavigation);
safe('تسک‌ها', initTasks);
safe('فرم افزودن', initAddForm);
safe('پیشرفت', initProgress);
safe('هفته', initWeek);
safe('تمرکز', initFocusPage);
safe('رولت', initRoll);
safe('جستجو', initSearch);
safe('کیبورد', initKeyboard);
safe('کتابخانه', initLibrary);
safe('ریدر', initReader);
safe('پروفایل', initProfile);
safe('امروز', initToday);

const dl = $('#dateLine');
if (dl) dl.textContent = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

safe('نام', applyName);
safe('رندر اولیه', () => { renderList(); notify(); });

/* First visit: stay on the Today page and ask for the name */
if (!state.userName) {
  safe('اولین بازدید', () => openNameModal());
}