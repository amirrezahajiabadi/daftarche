import { state, getTask } from './state.js';
import { savePomo } from './store.js';
import { $, faDigits } from './utils.js';
import { APP_TITLE } from './constants.js';
import { confetti, beep } from './confetti.js';
import * as audio from './audio.js';

/* ═══ Scene & Music ═══ */
let scene = localStorage.getItem('daftarche-scene') || 'none';
let ambOn = localStorage.getItem('daftarche-ambsound') !== '0';
let musicSel = localStorage.getItem('daftarche-music') || 'none';
let userList = [];
let tracksLoaded = false;

function buildSceneVisuals() {
  const rd = $('#rainDrops');
  if (rd && !rd.children.length) {
    for (let i = 0; i < 16; i++) {
      const d = document.createElement('i');
      d.style.left = Math.random() * 100 + '%';
      d.style.animationDuration = (0.9 + Math.random() * 0.8) + 's';
      d.style.animationDelay = (-Math.random() * 2) + 's';
      rd.appendChild(d);
    }
  }
  const fl = $('#flies');
  if (fl && !fl.children.length) {
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('i');
      s.style.left = 10 + Math.random() * 80 + '%';
      s.style.top = 15 + Math.random() * 60 + '%';
      s.style.animationDelay = (-Math.random() * 4) + 's';
      s.style.animationDuration = (3 + Math.random() * 3) + 's';
      fl.appendChild(s);
    }
  }
}

function applyScene(visualOnly = false) {
  const pg = $('#page-focus');
  ['rain', 'sea', 'forest'].forEach(s => pg.classList.toggle('scene-' + s, scene === s));
  document.querySelectorAll('#sceneChips button').forEach(b => b.classList.toggle('sel', b.dataset.scene === scene));
  const sw = $('#ambSwitch');
  sw.classList.toggle('on', ambOn);
  $('#ambLabel').textContent = ambOn ? 'صدای محیط: روشن' : 'صدای محیط: خاموش';
  if (!visualOnly) audio.setAmbience(scene, ambOn);
}

async function applyMusic() {
  document.querySelectorAll('#musicChips button').forEach(b => b.classList.toggle('sel', b.dataset.music === musicSel));
  document.querySelectorAll('.user-chip').forEach(ch => ch.classList.toggle('sel', ('user:' + ch.dataset.id) === musicSel));
  if (musicSel === 'none') audio.stopMusicAll();
  else if (audio.TRACK_KEYS.includes(musicSel)) audio.setMusic(musicSel);
  else if (musicSel.startsWith('user:')) {
    const t = userList.find(x => 'user:' + x.id === musicSel);
    if (t) audio.playUserTrack(t);
    else if (tracksLoaded) { musicSel = 'none'; localStorage.setItem('daftarche-music', musicSel); }
  }
}

function renderUserTracks() {
  const wrap = $('#userTracks');
  wrap.innerHTML = '';
  userList.forEach(t => {
    const b = document.createElement('button');
    b.className = 'user-chip' + (('user:' + t.id) === musicSel ? ' sel' : '');
    b.dataset.id = t.id;
    b.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span></span><i class="rm" title="حذف">×</i>`;
    b.querySelector('span').textContent = t.name;
    b.onclick = async e => {
      if (e.target.closest('.rm')) {
        await audio.removeUserTrack(t.id);
        userList = userList.filter(x => x.id !== t.id);
        if (musicSel === 'user:' + t.id) { musicSel = 'none'; localStorage.setItem('daftarche-music', musicSel); }
        renderUserTracks();
        applyMusic();
        return;
      }
      musicSel = 'user:' + t.id;
      localStorage.setItem('daftarche-music', musicSel);
      renderUserTracks();
      applyMusic();
    };
    wrap.appendChild(b);
  });
}

function initVolumes() {
  const vm = $('#volMusic'), va = $('#volAmb');
  const vols = audio.getVolumes();
  vm.value = Math.round(vols.m * 100);
  va.value = Math.round(vols.a * 100);
  const paint = el => el.style.setProperty('--v', el.value + '%');
  paint(vm); paint(va);
  vm.addEventListener('input', () => { paint(vm); audio.setMusicVolume(vm.value / 100); });
  va.addEventListener('input', () => { paint(va); audio.setAmbVolume(va.value / 100); });
}

function initVibe() {
  buildSceneVisuals();
  applyScene(true);
  initVolumes();

  $('#sceneChips').addEventListener('click', e => {
    const b = e.target.closest('button[data-scene]');
    if (!b) return;
    scene = b.dataset.scene;
    localStorage.setItem('daftarche-scene', scene);
    applyScene();
  });

  $('#ambSwitch').onclick = () => {
    ambOn = !ambOn;
    localStorage.setItem('daftarche-ambsound', ambOn ? '1' : '0');
    applyScene();
  };

  $('#musicChips').addEventListener('click', e => {
    const b = e.target.closest('button[data-music]');
    if (!b) return;
    musicSel = b.dataset.music;
    localStorage.setItem('daftarche-music', musicSel);
    renderUserTracks();
    applyMusic();
  });

  $('#musicFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    const t = { id: Date.now() + '', name: f.name.replace(/\.[^.]+$/, ''), blob: f };
    await audio.addUserTrack(t);
    userList.push(t);
    musicSel = 'user:' + t.id;
    localStorage.setItem('daftarche-music', musicSel);
    renderUserTracks();
    applyMusic();
    e.target.value = '';
  });

  // Unlock audio on the first user interaction (browser policy)
  addEventListener('pointerdown', () => {
    audio.unlockAudio();
    if (musicSel !== 'none') applyMusic();
    if (scene !== 'none' && ambOn) audio.setAmbience(scene, ambOn);
  }, { once: true });

  audio.loadUserTracks().then(list => {
    userList = list;
    tracksLoaded = true;
    renderUserTracks();
    if (musicSel.startsWith('user:')) applyMusic();
  });
}

/* ═══ Timer ═══ */
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

export function syncFocusPage() {
  populateTaskSelect();
  const nameEl = $('#focusTaskName');
  if (nameEl) {
    const task = state.focus && state.focus.taskId ? getTask(state.focus.taskId) : null;
    nameEl.textContent = task ? task.text : 'یه کار از لیست انتخاب کن';
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

function syncUI() {
  const f = state.focus;
  const ring = $('#focusRing'), timeEl = $('#focusTime'), stateEl = $('#focusState'), startBtn = $('#focusStart'), presets = $('#focusPresets');
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

export function clearFocus() {
  stopTimer();
  state.focus = null;
  syncUI();
  syncFocusPage();
}

export function openFocus(taskId) {
  const task = getTask(taskId);
  if (!task) return;
  stopTimer();
  state.focus = { taskId, total: state.pomoMin * 60, remain: state.pomoMin * 60, running: false, done: false, interval: null, endTime: 0 };
  window.dispatchEvent(new CustomEvent('navigate', { detail: 'focus' }));
}

export function initFocusPage() {
  initVibe();
  const startBtn = $('#focusStart');
  if (startBtn) startBtn.onclick = startPause;
  const resetBtn = $('#focusReset');
  if (resetBtn) resetBtn.onclick = () => { if (state.focus) { stopTimer(); state.focus.running = false; state.focus.done = false; state.focus.remain = state.focus.total; syncUI(); } };

  const presets = $('#focusPresets');
  if (presets) presets.addEventListener('click', e => {
    const b = e.target.closest('button[data-min]');
    if (b) setMinutes(Number(b.dataset.min));
  });
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