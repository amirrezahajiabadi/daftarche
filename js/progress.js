/* ═══ حلقهٔ پیشرفت، فیلترها، نوار دسته‌ها، قورباغهٔ روز ═══ */

import { state } from './state.js';
import { $, faNum, startOfToday } from './utils.js';
import { CATS } from './constants.js';
import { subscribe } from './bus.js';
import { renderList, collapse } from './tasks.js';

/* ── حلقهٔ پیشرفت + شمارشگر ── */
let currentDisplayPct = 0, animFrameId = null;

function updateProgress() {
  const total = state.tasks.length;
  const done = state.tasks.filter(t => t.done).length;
  const targetPct = total ? Math.round((done / total) * 100) : 0;

  const ring = $('#ringWrap');
  ring.style.setProperty('--pct', targetPct);
  if (targetPct === 100 && total > 0) ring.classList.add('complete');
  else ring.classList.remove('complete');

  if (animFrameId) cancelAnimationFrame(animFrameId);
  const startPct = currentDisplayPct;
  const startTime = performance.now();
  function tick(now) {
    const progress = Math.min((now - startTime) / 800, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    currentDisplayPct = Math.round(startPct + (targetPct - startPct) * ease);
    $('#percentVal').textContent = faNum(currentDisplayPct);
    if (progress < 1) animFrameId = requestAnimationFrame(tick);
  }
  animFrameId = requestAnimationFrame(tick);

  $('#stats').textContent = total ? `${faNum(done)} از ${faNum(total)} کار انجام شده` : 'هنوز کاری ثبت نشده';
  $('#counter').textContent = total ? `${faNum(total - done)} کار باقی‌مانده` : '';
  $('#clearBtn').style.visibility = done ? 'visible' : 'hidden';
}

/* ── نوار دسته‌ها ── */
function buildCatBar() {
  const wrap = $('#cats');
  const mk = (key, label, color) => {
    const b = document.createElement('button');
    b.className = 'cat-chip' + (key === 'all' ? ' active' : '');
    b.dataset.cat = key;
    b.style.setProperty('--cc', color);
    b.innerHTML = `<span class="dot"></span>${label}<span class="cnt"></span>`;
    return b;
  };
  wrap.appendChild(mk('all', 'همه', 'var(--accent)'));
  CATS.forEach(c => wrap.appendChild(mk(c.key, c.label, c.color)));
  wrap.addEventListener('click', e => {
    const b = e.target.closest('.cat-chip');
    if (!b || b.classList.contains('active')) return;
    wrap.querySelector('.active').classList.remove('active');
    b.classList.add('active');
    state.catFilter = b.dataset.cat;
    renderList();
  });
}

function updateCatCounts() {
  document.querySelectorAll('.cats .cat-chip').forEach(ch => {
    const k = ch.dataset.cat;
    const n = k === 'all'
      ? state.tasks.filter(t => !t.done).length
      : state.tasks.filter(t => !t.done && (t.cat || 'misc') === k).length;
    ch.querySelector('.cnt').textContent = n ? faNum(n) : '';
  });
}

/* ── فیلترها ── */
function movePill() {
  const act = document.querySelector('.filters button.active'), pill = $('#pill');
  pill.style.width = act.offsetWidth + 'px';
  pill.style.transform = `translateX(${act.offsetLeft}px)`;
}

/* ── قورباغهٔ روز ── */
function findFrog() {
  const pool = state.tasks.filter(t => !t.done);
  if (!pool.length) return null;
  const t0 = startOfToday();
  const score = t => {
    let s = 0;
    if (t.p === 'high') s += 3; else if (t.p === 'mid') s += 1.5;
    if (t.due) {
      const diff = Math.round((new Date(t.due + 'T00:00:00') - t0) / 864e5);
      if (diff < 0) s += 4; else if (diff === 0) s += 2.5; else if (diff <= 1) s += 1;
    }
    return s;
  };
  return pool.slice().sort((a, b) => score(b) - score(a))[0];
}

function updateFrog() {
  const frog = findFrog();
  const el = $('#frog');
  if (!frog) { el.hidden = true; return; }
  el.hidden = false;
  $('#frogName').textContent = frog.text;
}

/* ── راه‌اندازی ── */
export function initProgress() {
  buildCatBar();
  $('#frog').addEventListener('click', () => {
    const frog = findFrog();
    if (frog) {
      const el = $('#taskList').querySelector(`[data-id="${frog.id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 1600);
      }
    }
  });

  $('#filters').addEventListener('click', e => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn || btn.classList.contains('active')) return;
    document.querySelector('.filters .active').classList.remove('active');
    btn.classList.add('active');
    state.filter = btn.dataset.filter;
    movePill();
    renderList();
  });
  addEventListener('resize', movePill);
  movePill();

  $('#clearBtn').onclick = () => {
    [...$('#taskList').querySelectorAll('.task.done')].forEach((el, i) => setTimeout(() => collapse(el, el.dataset.id), i * 80));
  };

  subscribe(() => { updateProgress(); updateCatCounts(); updateFrog(); });
}