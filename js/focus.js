import { state, getTask } from './state.js';
import { savePomo, loadSession, saveSession, clearSession } from './store.js';
import { addSessionToHistory } from './focushistory.js';
import { $, faNum, faDigits } from './utils.js';
import { APP_TITLE } from './constants.js';
import { confetti, beep } from './confetti.js';
import { setTaskDone } from './tasks.js';
import { notify, subscribe } from './bus.js';
import { fekrbazMarkup } from './fekrbaz.js';
import { qorqoriMarkup } from './qorqori.js';
import { jingoolMarkup } from './jingool.js';
import * as audio from './audio.js';

/* ═══ Focus Session Model ═══
   One active/paused session at a time, persisted so it survives reload
   and navigation. The timestamp fields are the single source of truth;
   setInterval only refreshes the display.
   {
     id, taskId,
     startedAt,           // epoch ms when the session started
     endedAt,             // set when the session finishes
     plannedDurationMin,
     activeMs,            // focused time accumulated before the current run
     runStartedAt,        // epoch ms of the current active run (null when paused)
     status,              // 'active' | 'paused' | 'completed' | 'cancelled'
     taskCompleted,       // null until the reflection answers
     rating               // 'good' | 'okay' | 'hard' | null
   } */

const SESSION_PRESETS = [5, 15, 30, 60, 90];
const RATINGS = { good: 'خوب بود', okay: 'معمولی بود', hard: 'سخت بود' };
const END_MESSAGE = 'وقتت تموم شد.';

let scene = localStorage.getItem('daftarche-scene') || 'none';
let ambOn = localStorage.getItem('daftarche-ambsound') !== '0';
let musicSel = localStorage.getItem('daftarche-music') || 'none';
let userList = [];
let tracksLoaded = false;

/* ═══ Session core (no DOM) ═══ */

/* Focused milliseconds so far, excluding paused time */
function elapsedMs(session, at = Date.now()) {
  if (!session) return 0;
  const base = Number(session.activeMs) || 0;
  return session.runStartedAt ? base + Math.max(0, at - session.runStartedAt) : base;
}

function remainingSec(session, at = Date.now()) {
  const totalMs = session.plannedDurationMin * 60000;
  return Math.max(0, Math.floor((totalMs - elapsedMs(session, at)) / 1000));
}

function newId() {
  return Date.now() + '' + Math.random().toString(16).slice(2);
}

/* Defensive load: a malformed stored session falls back to no session */
function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.id || !raw.taskId) return null;
  if (!['active', 'paused', 'completed', 'cancelled'].includes(raw.status)) return null;
  const s = { ...raw };
  s.plannedDurationMin = Number(s.plannedDurationMin) > 0 ? Math.floor(Number(s.plannedDurationMin)) : 25;
  s.activeMs = Number(s.activeMs) >= 0 ? Number(s.activeMs) : 0;
  if (s.status === 'active') s.runStartedAt = Number(s.runStartedAt) || Date.now();
  else s.runStartedAt = null;
  s.taskCompleted = typeof s.taskCompleted === 'boolean' ? s.taskCompleted : null;
  s.rating = s.rating in RATINGS ? s.rating : null;
  return s;
}

/* The live session (active or paused); finished ones are history only.
   Returns the live state.session object (already normalized at start/restore)
   so mutations by the session actions reach state and storage. */
export function getActiveSession() {
  const s = state.session;
  return s && (s.status === 'active' || s.status === 'paused') ? s : null;
}

function persist() {
  saveSession(state.session);
}

/* Start a session. Refuses (returns false) when one is already
   active/paused — the caller shows the existing session instead. */
export function startSession(taskId, plannedMin) {
  if (getActiveSession()) return false;
  const task = getTask(taskId);
  if (!task || task.done) return false;
  const min = Number(plannedMin) > 0 ? Math.floor(Number(plannedMin)) : (task.durationMin || 25);
  state.session = {
    id: newId(),
    taskId,
    taskTitle: task.text, // snapshot for history
    startedAt: Date.now(),
    endedAt: null,
    plannedDurationMin: min,
    activeMs: 0,
    runStartedAt: Date.now(),
    status: 'active',
    taskCompleted: null,
    rating: null,
  };
  persist();
  return true;
}

export function pauseSession() {
  const s = getActiveSession();
  if (!s || s.status !== 'active') return;
  s.activeMs = elapsedMs(s);
  s.runStartedAt = null;
  s.status = 'paused';
  persist();
}

export function resumeSession() {
  const s = getActiveSession();
  if (!s || s.status !== 'paused') return;
  s.runStartedAt = Date.now();
  s.status = 'active';
  persist();
}

/* Cancelled sessions keep their record but count as finished */
export function cancelSession() {
  const s = getActiveSession();
  if (!s) return;
  s.endedAt = Date.now();
  s.status = 'cancelled';
  s.runStartedAt = null;
  persist();
}

/* Fill the final fields (taskCompleted/rating set by the reflection) */
function finalizeSession(status) {
  const s = getActiveSession();
  if (!s) return null;
  s.activeMs = elapsedMs(s);
  s.runStartedAt = null;
  s.endedAt = Date.now();
  s.status = status;
  s.actualDurationMin = Math.round(s.activeMs / 60000);
  persist();
  return s;
}

/* ═══ Scene & Music ═══ */

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
  if (!pg) return;
  ['rain', 'sea', 'forest'].forEach(s => pg.classList.toggle('scene-' + s, scene === s));
  document.querySelectorAll('#sceneChips button').forEach(b => b.classList.toggle('sel', b.dataset.scene === scene));
  const sw = $('#ambSwitch');
  if (!sw) return;
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
  if (!wrap) return;
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
  if (!vm || !va) return;
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

  $('#sceneChips')?.addEventListener('click', e => {
    const b = e.target.closest('button[data-scene]');
    if (!b) return;
    scene = b.dataset.scene;
    localStorage.setItem('daftarche-scene', scene);
    applyScene();
  });

  const sw = $('#ambSwitch');
  if (sw) sw.onclick = () => {
    ambOn = !ambOn;
    localStorage.setItem('daftarche-ambsound', ambOn ? '1' : '0');
    applyScene();
  };

  $('#musicChips')?.addEventListener('click', e => {
    const b = e.target.closest('button[data-music]');
    if (!b) return;
    musicSel = b.dataset.music;
    localStorage.setItem('daftarche-music', musicSel);
    renderUserTracks();
    applyMusic();
  });

  $('#musicFile')?.addEventListener('change', async e => {
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

/* ═══ Page UI ═══
   View modes on the focus page:
   pick    — no session: choose a task and a duration
   running — active/paused session with timer, pause and finish
   ended   — natural timer end: the task is not auto-completed
   reflect — two quick questions, then the session is saved            */

/* Task title snapshot — captured when the session starts so history
   stays correct even if the task is later renamed or deleted */
function taskTitle(id) {
  return getTask(id)?.text || 'کار حذف‌شده';
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return faDigits(`${m}:${String(s).padStart(2, '0')}`);
}

function renderFocusPage() {
  const card = $('.focus-page-card');
  if (!card) return;
  const session = getActiveSession();
  const ended = state.session && state.session.status === 'completed' && !state.session._reflectDone;

  if (!session && !ended) { renderPickView(); return; }
  if (ended) { renderEndedView(); return; }

  /* Active / paused view */
  const paused = session.status === 'paused';
  card.innerHTML = `
    <span class="focus-char" aria-hidden="true">${fekrbazMarkup('focused')}</span>
    <p class="focus-task">در حال تمرکز روی<br><strong></strong></p>
    <div class="focus-ring" id="focusRing" style="--fp:0">
      <div class="focus-inner">
        <div>
          <div class="focus-time" id="focusTime"></div>
          <div class="focus-state" id="focusState"></div>
        </div>
      </div>
    </div>
    <div class="focus-page-actions">
      ${paused
        ? `<button class="go" id="sessionResume">ادامه</button>`
        : `<button class="ghost" id="sessionPause">مکث</button>`}
      <button class="go" id="sessionFinish">پایان</button>
    </div>`;
  card.querySelector('strong').textContent = taskTitle(session.taskId);
  card.querySelector('#sessionPause')?.addEventListener('click', () => { pauseSession(); renderFocusPage(); updateFocusPill(); });
  card.querySelector('#sessionResume')?.addEventListener('click', () => { resumeSession(); renderFocusPage(); updateFocusPill(); });
  card.querySelector('#sessionFinish')?.addEventListener('click', () => {
    finalizeSession('completed');
    session._reflectDone = false;
    persist();
    renderReflection();
    updateFocusPill();
  });
  syncRunningUI();
}

/* Refresh ring, clock and state text without rebuilding the card */
function syncRunningUI() {
  const session = getActiveSession();
  if (!session) return;
  const remain = remainingSec(session);
  const total = session.plannedDurationMin * 60;
  const ring = $('#focusRing');
  if (ring) ring.style.setProperty('--fp', total ? ((total - remain) / total) * 100 : 0);
  const timeEl = $('#focusTime');
  if (timeEl) timeEl.textContent = fmtClock(remain);
  const stateEl = $('#focusState');
  if (stateEl) stateEl.textContent = session.status === 'paused' ? 'متوقف شده' : 'در حال تمرکز…';
  document.title = session.status === 'active' ? `${fmtClock(remain)} · دَفتَرچه` : APP_TITLE;
}

/* Pick view: the current selection flow, with the task's estimated
   duration as the suggested session length */
function renderPickView() {
  const card = $('.focus-page-card');
  if (!card) return;
  const undone = state.tasks.filter(t => !t.done);
  card.innerHTML = `
    <span class="focus-char" aria-hidden="true">${qorqoriMarkup('default')}</span>
    <p class="focus-task">یه کار از لیست انتخاب کن</p>
    <div class="focus-task-picker">
      <span>کار مورد نظر:</span>
      <select id="focusTaskSelect" aria-label="انتخاب کار"></select>
    </div>
    <div class="focus-presets" id="focusPresets"></div>
    <div class="focus-page-actions">
      <button class="go" id="focusStartBtn">شروع تمرکز</button>
    </div>`;
  const sel = card.querySelector('#focusTaskSelect');
  sel.innerHTML = '<option value="">— انتخاب کن —</option>';
  undone.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.text;
    sel.appendChild(opt);
  });

  const presets = card.querySelector('#focusPresets');
  const buildPresets = suggested => {
    presets.innerHTML = '';
    const mins = suggested && !SESSION_PRESETS.includes(suggested) ? [suggested, ...SESSION_PRESETS] : SESSION_PRESETS;
    mins.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.min = m;
      b.textContent = `${faNum(m)} دقیقه`;
      if (m === suggested) b.classList.add('sel');
      b.addEventListener('click', () => {
        presets.querySelectorAll('button').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel');
      });
      presets.appendChild(b);
    });
  };
  const syncPresets = () => buildPresets(getTask(sel.value)?.durationMin || null);
  sel.addEventListener('change', syncPresets);
  syncPresets();

  card.querySelector('#focusStartBtn').addEventListener('click', () => {
    const task = getTask(sel.value);
    if (!task) return;
    const chosen = presets.querySelector('button.sel');
    const min = chosen ? Number(chosen.dataset.min) : (task.durationMin || 25);
    if (!startSession(task.id, min)) { renderFocusPage(); updateFocusPill(); return; }
    state.pomoMin = min; savePomo(min);
    renderFocusPage();
    updateFocusPill();
    beep();
  });
}

/* Natural end: the timer hit zero — the task is NOT auto-completed */
function renderEndedView() {
  const card = $('.focus-page-card');
  if (!card) return;
  const session = state.session;
  card.innerHTML = `
    <span class="focus-char" aria-hidden="true">${jingoolMarkup('excited')}</span>
    <p class="focus-task focus-end-msg">${END_MESSAGE}</p>
    <p class="focus-sub">کارت انجام شد؟</p>
    <div class="focus-page-actions">
      <button class="go" id="endDone">✓ کار انجام شد</button>
      <button class="ghost" id="endContinue">→ هنوز ادامه داره</button>
    </div>`;
  card.querySelector('#endDone').addEventListener('click', () => {
    // The ended-view choice already answers the completion question —
    // go straight to the rating to avoid asking the same thing twice
    if (!getTask(session.taskId)?.done) setTaskDone(session.taskId, true);
    session.taskCompleted = true;
    session._reflectDone = false;
    persist();
    renderRating();
  });
  card.querySelector('#endContinue').addEventListener('click', () => {
    session.taskCompleted = false;
    session._reflectDone = false;
    persist();
    renderRating();
  });
}

/* Reflection: quick completion question (early finish) then rating, then save */
function renderReflection() {
  const card = $('.focus-page-card');
  if (!card) return;
  const session = state.session;
  card.innerHTML = `
    <span class="focus-char" aria-hidden="true">${session.taskCompleted ? jingoolMarkup('celebrating') : fekrbazMarkup('thinking')}</span>
    <p class="focus-task">کارت انجام شد؟</p>
    <div class="focus-page-actions">
      <button class="go" id="reflYes">✓ بله</button>
      <button class="ghost" id="reflNo">→ هنوز ادامه داره</button>
    </div>`;
  card.querySelector('#reflYes').addEventListener('click', () => {
    // Reuse the shared completion action — no second completion path
    if (!getTask(session.taskId)?.done) setTaskDone(session.taskId, true);
    session.taskCompleted = true;
    persist();
    renderRating();
  });
  card.querySelector('#reflNo').addEventListener('click', () => {
    session.taskCompleted = false;
    persist();
    renderRating();
  });
}

/* Rating step: shared by early finish and natural end */
function renderRating() {
  const card = $('.focus-page-card');
  if (!card) return;
  const session = state.session;
  card.innerHTML = `
    <span class="focus-char" aria-hidden="true">${fekrbazMarkup('curious')}</span>
    <p class="focus-task">این تمرکز چطور بود؟</p>
    <div class="focus-rating">
      <button type="button" data-rating="good" aria-label="خوب بود">😊 خوب بود</button>
      <button type="button" data-rating="okay" aria-label="معمولی بود">😐 معمولی بود</button>
      <button type="button" data-rating="hard" aria-label="سخت بود">😵 سخت بود</button>
    </div>`;
  card.querySelectorAll('[data-rating]').forEach(b => {
    b.addEventListener('click', () => {
      session.rating = b.dataset.rating;
      // A task completed from another page still counts here
      session.taskCompleted = !!getTask(session.taskId)?.done;
      finalizeSession('completed');
      // Mark reflection finished BEFORE notify so no re-render brings the
      // ended view back over the summary
      session._reflectDone = true;
      // Reflection complete → archive the historical record (validated +
      // deduped by id inside the history module)
      addSessionToHistory(session);
      persist();
      showSessionSummary();
      updateFocusPill();
      notify();
    });
  });
}

/* Small closing confirmation; the session record is already saved */
function showSessionSummary() {
  const card = $('.focus-page-card');
  if (!card) return;
  const s = state.session;
  const mins = Math.max(1, Math.round((s.activeMs || 0) / 60000));
  const done = s.taskCompleted;
  card.innerHTML = `
    <span class="focus-char" aria-hidden="true">${done ? jingoolMarkup('delighted') : fekrbazMarkup('proud')}</span>
    <p class="focus-task">${done ? 'آفرین! کارت تموم شد 🎉' : 'تمرکزت ثبت شد'}</p>
    <p class="focus-sub">${faNum(mins)} دقیقه تمرکز${s.rating ? ' · ' + RATINGS[s.rating] : ''}</p>
    <div class="focus-page-actions">
      <button class="go" id="summaryOk">باشه</button>
    </div>`;
  card.querySelector('#summaryOk').addEventListener('click', () => {
    if (state.session) delete state.session._reflectDone;
    state.session = null;
    clearSession();
    renderFocusPage();
  });
  if (done) { confetti(); beep(); }
}

/* Rebuild the pick view when the task list changes while it is visible.
   Never steal the card from the reflection/summary flow: only refresh
   when the card is empty or already showing the pick view. */
function refreshIfPickView() {
  const card = $('.focus-page-card');
  if (!card || getActiveSession()) return;
  const showingPick = !!card.querySelector('#focusTaskSelect');
  if (showingPick || !card.innerHTML.trim()) renderFocusPage();
}

/* ═══ Focus indicator pill (every page except focus) ═══ */

let pillEl = null;

function updateFocusPill() {
  const session = getActiveSession();
  const onFocusPage = $('#page-focus')?.classList.contains('active');
  if (!session || onFocusPage) {
    if (pillEl) { pillEl.remove(); pillEl = null; }
    return;
  }
  if (!pillEl) {
    pillEl = document.createElement('button');
    pillEl.className = 'focus-pill';
    pillEl.type = 'button';
    pillEl.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 13V9"/><path d="M12 5V3M9 3h6"/></svg><span></span>`;
    pillEl.addEventListener('click', () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'focus' })));
    document.body.appendChild(pillEl);
  }
  pillEl.classList.toggle('running', session.status === 'active');
  const label = pillEl.querySelector('span');
  if (label) {
    label.textContent = session.status === 'paused'
      ? 'تمرکز متوقف شده — بازگشت به تمرکز'
      : `در حال تمرکز: ${taskTitle(session.taskId)} · ${fmtClock(remainingSec(session))}`;
  }
}

/* Timer reached zero away from the focus page: end the run so the
   reflection waits there (the task is never auto-completed) */
function naturalEnd(session) {
  finalizeSession('completed');
  session._reflectDone = false;
  persist();
  updateFocusPill();
  notify();
  beep();
}

/* Display refresh only — timestamps stay the source of truth */
setInterval(() => {
  const session = getActiveSession();
  if (!session) return;
  if ($('#page-focus')?.classList.contains('active')) {
    if (session.status === 'active' && remainingSec(session) <= 0) { naturalEnd(session); renderEndedView(); return; }
    syncRunningUI();
  } else if (session.status === 'active' && remainingSec(session) <= 0) {
    naturalEnd(session);
    return;
  } else {
    updateFocusPill();
  }
}, 1000);

/* ═══ Public page API ═══ */

export function syncFocusPage() {
  renderFocusPage();
  updateFocusPill();
}

export function clearFocus() {
  const s = getActiveSession();
  if (s) { s.status = 'cancelled'; s.endedAt = Date.now(); s.runStartedAt = null; }
  state.session = null;
  clearSession();
  renderFocusPage();
  updateFocusPill();
}

/* Entry points (Decision Engine, task rows) all land here.
   A running session is never silently overwritten: the user is taken
   back to their existing session instead. */
export function openFocus(taskId) {
  if (getActiveSession()) {
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'focus' }));
    syncFocusPage();
    return;
  }
  const task = getTask(taskId);
  if (!task || task.done) return;
  // Suggested duration = the task's own estimate
  startSession(taskId, task.durationMin || state.pomoMin || 25);
  window.dispatchEvent(new CustomEvent('navigate', { detail: 'focus' }));
  syncFocusPage();
}

export function initFocusPage() {
  // Restore a persisted session from a previous page life; a paused
  // session stays paused (no auto-resume after reload). A completed but
  // unanswered session (natural end while away) keeps its pending reflection.
  const stored = normalizeSession(loadSession());
  state.session = stored && (stored.status === 'active' || stored.status === 'paused'
    || (stored.status === 'completed' && !stored._reflectDone)) ? stored : null;

  initVibe();
  renderFocusPage();
  updateFocusPill();
  notify();
  subscribe(() => { refreshIfPickView(); updateFocusPill(); });
}
