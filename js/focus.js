/* ═══ تایمر تمرکز (پومودورو) ═══ */

import { state, getTask } from './state.js';
import { savePomo } from './store.js';
import { $, faDigits } from './utils.js';
import { APP_TITLE } from './constants.js';
import { confetti, beep } from './confetti.js';

export function openFocus(taskId) {
  const task = getTask(taskId);
  if (!task) return;
  if (!state.focus || state.focus.taskId !== taskId) {
    stopTimer();
    state.focus = { taskId, total: state.pomoMin * 60, remain: state.pomoMin * 60, running: false, done: false, interval: null, endTime: 0 };
  }
  $('#focusTaskName').textContent = task.text;
  $('#focusOverlay').hidden = false;
  $('#focusPill').hidden = true;
  markPreset(state.focus.total / 60);
  syncUI();
}

function markPreset(min) {
  document.querySelectorAll('#focusPresets button').forEach(b => b.classList.toggle('sel', Number(b.dataset.min) === min));
  $('#customMin').value = [15, 25, 45, 60].includes(min) ? '' : min;
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
  const f = state.focus;
  if (!f) return;
  if (f.done) { f.done = false; f.remain = f.total; syncUI(); return; }
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
  if (state.focus && state.focus.interval) {
    clearInterval(state.focus.interval);
    state.focus.interval = null;
  }
}

function finish() {
  stopTimer();
  state.focus.running = false;
  state.focus.done = true;
  state.focus.remain = 0;
  beep();
  confetti();
  syncUI();
}

export function clearFocus() {
  stopTimer();
  state.focus = null;
  $('#focusPill').hidden = true;
  document.title = APP_TITLE;
}

export function closeFocusOverlay() {
  $('#focusOverlay').hidden = true;
  if (state.focus && state.focus.done) clearFocus();
  else syncUI();
}

function syncUI() {
  const f = state.focus;
  if (!f) return;
  const pct = f.total ? ((f.total - f.remain) / f.total) * 100 : 0;
  $('#focusRing').style.setProperty('--fp', pct);
  const m = Math.floor(f.remain / 60), s = f.remain % 60;
  const txt = faDigits(`${m}:${String(s).padStart(2, '0')}`);
  $('#focusTime').textContent = txt;
  $('#focusState').textContent = f.done ? 'تمام شد! آفرین'
    : f.running ? 'در حال تمرکز…'
    : f.remain === f.total ? 'آمادهٔ شروع؟' : 'متوقف شده';
  $('#focusStart').textContent = f.done ? 'دوباره' : f.running ? 'توقف' : 'شروع';
  $('#focusPresets').classList.toggle('locked', f.running);

  const pill = $('#focusPill');
  if (!$('#focusOverlay').hidden) { pill.hidden = true; }
  else if (f.running) { pill.hidden = false; pill.classList.add('running'); $('#pillTime').textContent = txt; }
  else if (f.done) { pill.hidden = false; pill.classList.remove('running'); $('#pillTime').textContent = 'تمام شد!'; }
  else if (f.remain < f.total) { pill.hidden = false; pill.classList.remove('running'); $('#pillTime').textContent = txt + ' · توقف'; }
  else pill.hidden = true;

  document.title = f.running ? `${txt} · دَفتَرچه` : APP_TITLE;
}

export function initFocus() {
  $('#focusStart').onclick = startPause;
  $('#focusReset').onclick = () => {
    if (state.focus) {
      stopTimer();
      state.focus.running = false;
      state.focus.done = false;
      state.focus.remain = state.focus.total;
      syncUI();
    }
  };
  $('#focusClose').onclick = closeFocusOverlay;
  $('#focusOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeFocusOverlay(); });
  $('#focusPill').onclick = () => { if (state.focus) openFocus(state.focus.taskId); };

  $('#focusPresets').addEventListener('click', e => {
    const b = e.target.closest('button[data-min]');
    if (b) setMinutes(Number(b.dataset.min));
  });
  $('#customMin').addEventListener('change', e => {
    let v = Math.round(Number(e.target.value));
    if (!v || v < 1) v = 1;
    if (v > 180) v = 180;
    e.target.value = '';
    setMinutes(v);
  });
}