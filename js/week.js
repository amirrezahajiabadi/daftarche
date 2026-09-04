import { state } from './state.js';
import { saveHistory, saveMoods } from './store.js';
import { $, faNum, dayKey } from './utils.js';
import { MOODS, FACES, WEEKDAY_LETTERS } from './constants.js';
import { subscribe } from './bus.js';

export function recordDay() {
  const k = dayKey(new Date());
  if (!state.history.includes(k)) {
    state.history.push(k);
    saveHistory(state.history);
  }
}

function calcStreak() {
  const set = new Set(state.history);
  let s = 0;
  const d = new Date();
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (set.has(dayKey(d))) { s++; d.setDate(d.getDate() - 1); }
  return s;
}

function updateStreakUI() {
  const s = calcStreak();
  $('#streakChip').classList.toggle('hot', s > 0);
  $('#streakVal').textContent = s > 0 ? `${faNum(s)} روز پیاپی` : 'اولین تیک رو بزن';
}

/* ── نمودار هفته: فقط بار اول انیمیشن، بعدش آپدیت نرم ── */
let chartInitialized = false;

function renderChart() {
  const chart = $('#chart');
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d);
    days.push({
      k, letter: WEEKDAY_LETTERS[d.getDay()], today: i === 0,
      n: state.tasks.filter(t => t.done && t.doneAt && dayKey(new Date(t.doneAt)) === k).length,
      mood: state.moods[k] || 0,
    });
  }
  const max = Math.max(...days.map(x => x.n), 1);

  // بار اول: ساخت ستون‌ها
  if (!chartInitialized) {
    chart.innerHTML = '';
    days.forEach((c, i) => {
      const col = document.createElement('div');
      col.className = 'col' + (c.today ? ' today' : '');
      col.title = `${faNum(c.n)} کار انجام‌شده${c.mood ? ' · حال: ' + MOODS[c.mood - 1].label : ''}`;
      const bar = document.createElement('div');
      bar.className = 'bar' + (c.n ? '' : ' zero');
      bar.style.height = '6%';
      const lbl = document.createElement('span');
      lbl.textContent = c.letter;
      const md = document.createElement('i');
      md.className = 'mdot';
      md.style.background = c.mood ? MOODS[c.mood - 1].color : 'transparent';
      col.appendChild(bar); col.appendChild(lbl); col.appendChild(md);
      chart.appendChild(col);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        bar.style.transitionDelay = (i * 55) + 'ms';
        bar.style.height = c.n ? (20 + (c.n / max) * 80) + '%' : '6%';
      }));
    });
    chartInitialized = true;
    return;
  }

  // بارهای بعدی: آپدیت نرم بدون بازسازی
  const cols = chart.querySelectorAll('.col');
  days.forEach((c, i) => {
    const col = cols[i];
    if (!col) return;
    const bar = col.querySelector('.bar');
    const md = col.querySelector('.mdot');
    col.title = `${faNum(c.n)} کار انجام‌شده${c.mood ? ' · حال: ' + MOODS[c.mood - 1].label : ''}`;
    bar.className = 'bar' + (c.n ? '' : ' zero');
    bar.style.transitionDelay = '0ms';
    bar.style.height = c.n ? (20 + (c.n / max) * 80) + '%' : '6%';
    md.style.background = c.mood ? MOODS[c.mood - 1].color : 'transparent';
  });
}

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
      renderChart();
    };
    wrap.appendChild(b);
  });
}

function renderMoods() {
  const cur = state.moods[dayKey(new Date())] || 0;
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
    $('#moodLabel').textContent = 'حال امروزت چطوره؟';
  }
}

export function initWeek() {
  buildMoods();
  renderMoods();
  subscribe(() => { updateStreakUI(); renderChart(); });
}