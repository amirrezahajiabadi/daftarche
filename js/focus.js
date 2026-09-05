import { state, getTask } from './state.js';
import { savePomo } from './store.js';
import { $, faDigits, faNum } from './utils.js';
import { APP_TITLE } from './constants.js';
import { confetti, beep } from './confetti.js';

/* ── پر کردن سلکت تسک‌ها ── */
function populateTaskSelect() {
  const sel = $('#focusTaskSelect');
  if (!sel) return;
  const undone = state.tasks.filter(t => !t.done);
  sel.innerHTML = '<option value="">— انتخاب کن —</option>';
  undone.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.text;
    if (state.focus && state.focus.taskId === t.id) opt.selected = true;
    sel.appendChild(opt);
  });
}

/* ── سینک UI صفحهٔ تمرکز ── */
export function syncFocusPage() {
  populateTaskSelect();
  const f = state.focus;
  const nameEl = $('#focusTaskName');
  if (nameEl) {
    if (f && f.taskId) {
      const task = getTask(f.taskId);
      nameEl.textContent = task ? task.text : 'یه کار از لیست انتخاب کن';
    } else {
      nameEl.textContent = 'یه کار از لیست انتخاب کن';
    }
  }
  syncUI();
}

function markPreset(min) {
  document.querySelectorAll('#focusPresets button').forEach(b => b.classList.toggle('sel', Number(b.dataset.min) === min));
  const cm = $('#customMin');
  if (cm) cm.value = [15, 25, 45, 60].includes(min) ? '' : min;
}

function setMinutes(min) {
  if (state.focus && state.focus.running) return;
  state.pomoMin = min;
  savePomo(min);
  if (state.focus) {
    stopTimer();
    state.focus = { ...state.focus, total: min * 60, remain: min * 60, running: false, done: false };
  }
  markPreset(min);
  syncUI();
}

function startPause() {
  // اگر تسکی انتخاب نشده، از سلکت بگیر
  if (!state.focus || !state.focus.taskId) {
    const sel = $('#focusTaskSelect');
    const val = sel ? sel.value : '';
    if (!val) { alert('اول یه کار انتخاب کن!'); return; }
    state.focus = { taskId: val, total: state.pomoMin * 60, remain: state.pomoMin * 60, running: false, done: false, interval: null, endTime: 0 };
  }
  const f = state.focus;
  if (f.done) { f.done = false; f.remain = f.total; syncUI(); syncFocusPage(); return; }
  if (f.running) {
    stopTimer();
    f.remain = Math.max(1, Math.round((f.endTime - Date.now()) / 1000));
    f.running = false;
  } else {
    f.running = true;
    f.endTime = Date.now() + f.remain * 1000;
    f.interval = setInterval(() => {
      const r = Math.max(0, Math.round((f.endTime - Date.now()) / 1000));
      f.remain = r;
      syncUI();
      if (r <= 0) finish();
    }, 250);
  }
  syncUI();
}

function stopTimer() {
  if (state.focus && state.focus.interval) { clearInterval(state.focus.interval); state.focus.interval = null; }
}

function finish() {
  stopTimer();
  state.focus.running = false;
  state.focus.done = true;
  state.focus.remain = 0;
  beep(); confetti();
  syncUI();
}

function resetFocus() {
  if (state.focus) { stopTimer(); state.focus.running = false; state.focus.done = false; state.focus.remain = state.focus.total; syncUI(); }
}

function syncUI() {
  const f = state.focus;
  const ring = $('#focusRing');
  const timeEl = $('#focusTime');
  const stateEl = $('#focusState');
  const startBtn = $('#focusStart');
  const presets = $('#focusPresets');

  if (!f) {
    if (ring) ring.style.setProperty('--fp', 0);
    if (timeEl) timeEl.textContent = faDigits(`${state.pomoMin}:00`);
    if (stateEl) stateEl.textContent = 'آمادهٔ شروع؟';
    if (startBtn) startBtn.textContent = 'شروع';
    if (presets) presets.classList.remove('locked');
    document.title = APP_TITLE;
    return;
  }

  const pct = f.total ? ((f.total - f.remain) / f.total) * 100 : 0;
  if (ring) ring.style.setProperty('--fp', pct);
  const m = Math.floor(f.remain / 60), s = f.remain % 60;
  const txt = faDigits(`${m}:${String(s).padStart(2, '0')}`);
  if (timeEl) timeEl.textContent = txt;
  if (stateEl) stateEl.textContent = f.done ? 'تمام شد! آفرین' : f.running ? 'در حال تمرکز…' : f.remain === f.total ? 'آمادهٔ شروع؟' : 'متوقف شده';
  if (startBtn) startBtn.textContent = f.done ? 'دوباره' : f.running ? 'توقف' : 'شروع';
  if (presets) presets.classList.toggle('locked', f.running);
  document.title = f.running ? `${txt} · دَفتَرچه` : APP_TITLE;
}

export function initFocusPage() {
  const startBtn = $('#focusStart');
  if (startBtn) startBtn.onclick = startPause;
  const resetBtn = $('#focusReset');
  if (resetBtn) resetBtn.onclick = resetFocus;

  const presets = $('#focusPresets');
  if (presets) {
    presets.addEventListener('click', e => {
      const b = e.target.closest('button[data-min]');
      if (b) setMinutes(Number(b.dataset.min));
    });
  }
  const cm = $('#customMin');
  if (cm) cm.addEventListener('change', e => {
    let v = Math.round(Number(e.target.value));
    if (!v || v < 1) v = 1; if (v > 180) v = 180;
    e.target.value = '';
    setMinutes(v);
  });

  const sel = $('#focusTaskSelect');
  if (sel) sel.addEventListener('change', () => {
    const val = sel.value;
    if (val) {
      stopTimer();
      state.focus = { taskId: val, total: state.pomoMin * 60, remain: state.pomoMin * 60, running: false, done: false, interval: null, endTime: 0 };
      syncFocusPage();
    }
  });

  markPreset(state.pomoMin);
  syncUI();
}

// backward compat: clearFocus used by tasks.js
export function clearFocus() {
  stopTimer();
  state.focus = null;
  syncUI();
  syncFocusPage();
}

// backward compat: openFocus used by tasks.js focus-btn
export function openFocus(taskId) {
  const task = getTask(taskId);
  if (!task) return;
  stopTimer();
  state.focus = { taskId, total: state.pomoMin * 60, remain: state.pomoMin * 60, running: false, done: false, interval: null, endTime: 0 };
  // switch to focus page
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-page="focus"]').classList.add('active');
  $('#page-focus').classList.add('active');
  syncFocusPage();
}