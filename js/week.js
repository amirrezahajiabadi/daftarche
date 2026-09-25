/* ═══ Today's mood — and the day marker that keeps the streak honest ═══
   The week chart and the streak chip that used to live here are on the stats
   page now (js/stats.js). They were never really about *this* week: they are
   the same two numbers seen through a window, so they are drawn by the module
   that owns windows, and they answer for whichever range the reader has chosen
   instead of always for the last seven days. What is left here belongs to today
   and to nothing else. */

import { state } from './state.js';
import { saveHistory, saveMoods } from './store.js';
import { $, dayKey } from './utils.js';
import { MOODS, FACES } from './constants.js';
import { subscribe } from './bus.js';

export function recordDay() {
  const k = dayKey(new Date());
  if (!state.history.includes(k)) {
    state.history.push(k);
    saveHistory(state.history);
  }
}

/* ── Mood: read stored values defensively ──
   The picker writes 1..5, but storage can still hold something else — a value
   from an older scale, a hand-edited key, a string. Reading it as "no mood for
   that day" keeps a stray value from being used as an index into MOODS, which
   used to throw while the chart was being built. */
const readMood = value => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MOODS.length ? n : 0;
};

function buildMoods() {
  const wrap = $('#moods');
  MOODS.forEach((m, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = m.label;
    b.style.setProperty('--mc', m.color);
    if (m.sub) b.dataset.sub = m.sub;
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${FACES[i]}</svg>`;
    b.onclick = () => {
      state.moods[dayKey(new Date())] = i + 1;
      saveMoods(state.moods);
      renderMoods();
    };
    wrap.appendChild(b);
  });
}

function renderMoods() {
  const cur = readMood(state.moods[dayKey(new Date())]);
  const buttons = document.querySelectorAll('#moods button');
  buttons.forEach((b, i) => {
    b.classList.toggle('sel', i + 1 === cur);
    const mood = MOODS[i];
    if (mood.sub) b.dataset.sub = mood.sub;
    else delete b.dataset.sub;
  });
  if (cur) {
    const m = MOODS[cur - 1];
    $('#moodLabel').innerHTML = `حال امروزت: <strong style="color:${m.color}">${m.label}</strong>`;
  } else {
    $('#moodLabel').textContent = '';
  }
}

export function initWeek() {
  buildMoods();
  renderMoods();
  /* The chosen mood is read by the stats page too, so a change repaints
     whatever is on screen that shows it. */
  subscribe(() => renderMoods());
}