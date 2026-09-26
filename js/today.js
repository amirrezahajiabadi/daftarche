/* ═══ Today Dashboard: Greeting, Quick Add, Frog Hero, Today's Tasks, Progress, Mood ═══
   Reuses existing task state, task actions, frog selection and mood/week modules. */

import { state, getTask } from './state.js';
import { $, faNum, dayKey, startOfToday, formatDuration } from './utils.js';
import { P_LABEL, ICONS } from './constants.js';
import { subscribe } from './bus.js';
import { addTask, dueLabel, collapse, setTaskDone, timeRangeLabel } from './tasks.js';
import { frogScore } from './progress.js';
import { openFocus } from './focus.js';
import { qorqoriMarkup } from './qorqori.js';
import { getHistory } from './focushistory.js';
import { buildDecisionContext } from './decisioncontext.js';
import { getRecommendation, reasonForTask, energyFromMood, ALL_DONE_REASON } from './decision.js';

const DAY = 864e5;
const PRI_COLORS = { high: '#ff5d5d', mid: '#ffb45c', low: '#7fb069' };
const LIST_CAP = 6;

const dueDiff = due => Math.round((new Date(due + 'T00:00:00') - startOfToday()) / DAY);

/* ── Recommendation («الان چی کار کنیم؟») ──
   The Decision Engine picks the primary task; users can skip it, which
   applies a temporary session-only penalty so it isn't repeated right away. */
let skippedRecs = new Map(); // taskId → skip count, session memory only
let shownRecId = null;       // currently displayed recommendation (alternatives switch)

/* True when a task belongs to "today": completed today, due today/late,
   important open work, or freshly added today. */
const isTodayPending = t => {
  if (!t || t.done) return false;
  if (t.p === 'high') return true;
  if (t.dueDate) return dueDiff(t.dueDate) <= 0;
  return !!t.created && dayKey(new Date(t.created)) === dayKey(new Date());
};
const isDoneToday = t => !!t && !!t.done && !!t.doneAt && dayKey(new Date(t.doneAt)) === dayKey(new Date());
const todayPending = () => state.tasks.filter(isTodayPending);
const todayDone = () => state.tasks.filter(isDoneToday);

/* ── Header: greeting, date, summary ── */
function renderHeader() {
  const greet = $('#todayGreet');
  if (greet) greet.textContent = state.userName ? `سلام ${state.userName} 👋` : 'سلام 👋';
  const date = $('#todayDate');
  if (date) date.textContent = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  const summary = $('#todaySummary');
  if (!summary) return;
  const pending = todayPending(), done = todayDone();
  const n = pending.length, m = done.length;
  if (!n && !m) {
    summary.textContent = 'برنامه‌ات برای امروز خالیه؛ هر کاری خواستی اضافه کن ✨';
    return;
  }
  const parts = [];
  if (n) {
    const casual = pending.some(t => t.p !== 'high' && !(t.dueDate && dueDiff(t.dueDate) < 0));
    parts.push(`${faNum(n)} ${casual ? 'کار برای امروز' : 'کار مهم'}`);
  }
  if (m) parts.push(`${faNum(m)} انجام شده`);
  summary.textContent = parts.join(' · ');
}

/* ── Recommendation card (Qorqori companion) ── */
let heroFrog = null; // task object currently shown

/* Simple state → expression mapping for Qorqori.
   High priority = determined, progress today = happy,
   all done = celebrating, nothing to do = thinking. */
function frogExpr() {
  if (heroFrog) {
    if (heroFrog.p === 'high') return 'determined';
    return todayDone().length > 0 ? 'happy' : 'default';
  }
  return todayDone().length > 0 ? 'celebrating' : 'thinking';
}

function recChips(task) {
  const dl = task.dueDate ? dueLabel(task.dueDate) : null;
  const chips = [`<span class="frog-chip" style="--fc:${PRI_COLORS[task.p || 'mid']}">اولویت ${P_LABEL[task.p || 'mid']}</span>`];
  if (dl) {
    const fc = dl.cls === 'late' ? '#d84a4a' : dl.cls === 'today' ? 'var(--accent)' : '#5f8f4d';
    const txt = dl.ltr ? `<span dir="ltr">${dl.text}</span>` : dl.text;
    chips.push(`<span class="frog-chip" style="--fc:${fc}">${txt}</span>`);
  }
  const dlbl = formatDuration(task.durationMin);
  if (dlbl) chips.push(`<span class="frog-chip" style="--fc:#7b6fd8">${dlbl}</span>`);
  return chips.join('');
}

function currentRec() {
  const energy = energyFromMood(state.moods[dayKey(new Date())]);
  /* History → Evidence → Context → Decision: the context is rebuilt from
     the current Focus History on every request, so it can never go stale */
  const context = buildDecisionContext(getHistory(), new Date());
  const rec = getRecommendation({
    tasks: state.tasks,
    today: new Date(),
    energy,
    skipCounts: skippedRecs,
    context,
  });
  // Alternative click: show that task instead, without touching any data
  if (shownRecId) {
    const alt = [rec.primary, ...rec.alternatives].find(t => t && t.id === shownRecId);
    if (alt) {
      const live = getTask(alt.id);
      return { ...rec, primary: alt, reason: live ? reasonForTask(live, { energy }) : rec.reason };
    }
  }
  return rec;
}/* Three visually and emotionally distinct empty states (Priority 8.4):
   no tasks → calm/welcoming with an add CTA · all done → celebrating,
   acknowledged completion · no recommendation → thinking, non-pressuring. */
/* What the hero is currently showing, so an unchanged recommendation can be
   left exactly as it is. Every change that reaches the bus used to tear the
   card down and build it again, which restarted the companion's idle motion and
   the chip pop-in even when the suggestion, its reason and its alternatives were
   all identical — the card twitched for nothing on every check-off. */
let lastFrogSig = '';

/* `force` is for the moves the user asked for directly (skip, picking an
   alternative): those must redraw even when the suggestion comes out the same,
   because a tap with no visible response reads as a broken button. */
function renderFrog(force) {
  const wrap = $('#todayFrog');
  if (!wrap) return;
  const rec = currentRec();
  const frog = rec.primary ? getTask(rec.primary.id) : null;
  heroFrog = frog;
  const alts = frog ? rec.alternatives.filter(a => a.id !== frog.id) : [];
  const sig = frog
    ? ['task', frog.id, frog.text, frog.p || 'mid', frog.dueDate || '', frog.durationMin || '', rec.reason || '', alts.map(a => a.id).join(','), frogExpr()].join('~')
    : ['none', rec.state, rec.reason || ''].join('~');
  if (!force && sig === lastFrogSig) return;
  lastFrogSig = sig;
  if (!frog) {
    shownRecId = null;
    const allDone = rec.state === 'all-done';
    const nothing = rec.state === 'empty';
    const kind = allDone ? 'done' : nothing ? 'none' : 'stuck';
    const expr = allDone ? 'celebrating' : 'thinking';
    const title = allDone ? 'امروز کارت رو جمع کردی.' : 'امروز کاری روی میز نیست.';
    const msg = allDone
      ? (rec.reason || ALL_DONE_REASON)
      : nothing
        ? 'وقتی کاری اضافه کنی، همین‌جا پیشنهادش رو می‌ذارم.'
        : (rec.reason || ALL_DONE_REASON);
    wrap.innerHTML = `
      <div class="frog-hero frog-empty frog-empty-${kind}">
        <span class="frog-emoji" aria-hidden="true">${qorqoriMarkup(expr)}</span>
        <span class="frog-kicker">الان چی کار کنیم؟</span>
        <h3 class="frog-empty-title"></h3>
        <p class="frog-none"></p>
        ${nothing ? '<button class="frog-add" type="button" id="frogAddBtn">+ افزودن کار</button>' : ''}
      </div>`;
    wrap.querySelector('.frog-empty-title').textContent = title;
    wrap.querySelector('.frog-none').textContent = msg;
    return;
  }
  /* Visual order (Priority 8.4): title → metadata → reason → actions.
     The task title outranks the reason; the reason stays secondary. */
  wrap.innerHTML = `
    <div class="frog-hero">
      <span class="frog-emoji" aria-hidden="true">${qorqoriMarkup(frogExpr())}</span>
      <span class="frog-kicker">الان چی کار کنیم؟</span>
      <h3 class="frog-name"></h3>
      <div class="frog-meta">${recChips(frog)}</div>
      ${rec.reason ? `<p class="rec-reason"></p>` : ''}
      <div class="frog-actions">
        <button class="frog-start" type="button">شروع کار</button>
        <button class="frog-next" type="button">یکی دیگه</button>
      </div>
      ${alts.length ? `
      <div class="rec-alts">
        <span class="rec-alts-label">گزینه‌های دیگه</span>
        <ul>${alts.map(a => `<li><button type="button" class="rec-alt" data-id="${a.id}"></button></li>`).join('')}</ul>
      </div>` : ''}
    </div>`;
  wrap.querySelector('.frog-name').textContent = frog.text;
  const startBtn = wrap.querySelector('.frog-start');
  if (startBtn) startBtn.setAttribute('aria-label', `شروع کار: ${frog.text}`);
  const reasonEl = wrap.querySelector('.rec-reason');
  if (reasonEl) reasonEl.textContent = rec.reason;
  wrap.querySelectorAll('.rec-alt').forEach(b => {
    b.textContent = getTask(b.dataset.id)?.text || '';
  });
}

/* Skip: temporary session penalty so the same task isn't re-suggested at once */
function skipCurrentFrog() {
  if (!heroFrog) return;
  skippedRecs.set(heroFrog.id, (skippedRecs.get(heroFrog.id) || 0) + 1);
  shownRecId = null;
  renderFrog(true);
}

/* ── Today's tasks ── */
function todayRow(t) {
  const li = document.createElement('li');
  li.className = 't-row' + (t.done ? ' done' : '');
  li.dataset.id = t.id;
  let dueChip = '';
  /* The chip is built for finished tasks too and hidden in CSS: the row is
     updated in place when it is checked off, so its markup has to stay stable. */
  if (t.dueDate) {
    const dl = dueLabel(t.dueDate);
    if (dl.cls === 'late' || dl.cls === 'today' || dl.cls === 'soon') dueChip = `<span class="t-due ${dl.cls}">${dl.text}</span>`;
  }
  const durLabel = formatDuration(t.durationMin);
  const durChip = durLabel ? `<span class="t-dur">${durLabel}</span>` : '';
  const spanLabel = timeRangeLabel(t);
  const spanChip = spanLabel ? `<span class="t-span">${spanLabel}</span>` : '';
  li.innerHTML = `
    <button class="t-check" type="button" aria-label="تغییر وضعیت تکمیل">${ICONS.check}</button>
    <span class="t-dot" style="--pr:${PRI_COLORS[t.p || 'mid']}"></span>
    <span class="t-title"></span>
    ${spanChip}
    ${dueChip}
    ${durChip}
    <button class="t-del" type="button" aria-label="حذف">${ICONS.trash}</button>`;
  li.querySelector('.t-title').textContent = t.text;
  return li;
}

/* The rows are keyed by task id and reconciled in place.
   Rebuilding the list on every change (the previous behaviour) replaced the row
   the user had just tapped, so one check-off replayed the entrance animation of
   the whole list and the tapped row never finished its own tick. Now a change
   updates the rows it actually affects: a check-off only toggles that row, and
   only genuinely new rows animate in. Order changes reuse the same elements, so
   nothing flickers when a finished task moves down a group. */
const liveRows = new Map(); // taskId → { el, sig }
const rowSig = t => [t.text, t.p || 'mid', t.dueDate || '', t.durationMin || '', t.timeFrom || '', t.timeTo || ''].join('|');

function renderTodayList() {
  const list = $('#todayList');
  if (!list) return;
  const undone = todayPending().slice().sort((a, b) => frogScore(b) - frogScore(a));
  const rows = [...undone, ...todayDone()].slice(0, LIST_CAP);

  if (!rows.length) {
    liveRows.forEach(entry => { if (!entry.el.dataset.exiting) entry.el.remove(); });
    liveRows.clear();
    if (!list.querySelector('.t-empty')) {
      const li = document.createElement('li');
      li.className = 't-empty';
      li.textContent = state.tasks.length
        ? 'چیزی برای امروز برنامه‌ریزی نشده؛ هر کاری خواستی از بالا اضافه کن ✨'
        : 'هنوز کاری نساختی — اولین کار امروزت رو از بالا اضافه کن ✨';
      list.appendChild(li);
    }
    return;
  }
  list.querySelector('.t-empty')?.remove();

  const wanted = new Set(rows.map(t => t.id));
  liveRows.forEach((entry, id) => {
    if (wanted.has(id)) return;
    liveRows.delete(id);
    /* A row already on its way out (just deleted) owns its own removal —
       animateOut takes it off the document when the exit has played. */
    if (!entry.el.dataset.exiting) entry.el.remove();
  });

  let next = list.firstElementChild;
  rows.forEach(t => {
    const sig = rowSig(t);
    let entry = liveRows.get(t.id);

    // Reuse the row, or build a fresh element for changed/new/vanished markup
    if (!entry || !entry.el.isConnected || entry.sig !== sig) {
      /* The element being replaced is kept: a swap stays in the row's own place,
         so a cursor already standing on the old element is standing in front of
         the new one. Comparing the cursor against `entry.el` *after* the swap
         would miss that — it is the new element now — and hand insertBefore a
         node that has just left the list, which is what changing a due date (or
         a title, or a priority) on an important task used to do. */
      const old = entry ? entry.el : null;
      const el = todayRow(t);
      if (old && old.isConnected) old.replaceWith(el);
      entry = { el, sig };
      liveRows.set(t.id, entry);
      if (next === old) next = el.nextElementSibling;
      else list.insertBefore(el, next);
      return;
    }

    entry.el.classList.toggle('done', !!t.done);
    if (next === entry.el) next = entry.el.nextElementSibling;
    else list.insertBefore(entry.el, next);
  });
}

/* ── Daily progress ── */
function renderProgress() {
  const bar = $('#todayProgBar');
  if (!bar) return;
  const pending = todayPending(), done = todayDone();
  const total = pending.length + done.length;
  const text = $('#todayProgText');
  if (!total) {
    bar.style.width = '0%';
    if (text) text.textContent = 'هنوز کاری برای امروز ثبت نشده';
    return;
  }
  const pct = Math.round(done.length / total * 100);
  bar.style.width = pct + '%';
  bar.classList.toggle('full', pct === 100);
  text.innerHTML = pct === 100
    ? `آفرین! هر <b>${faNum(total)}</b> کار امروز انجام شد 🎉`
    : `<b>${faNum(done.length)}</b> از <b>${faNum(total)}</b> کار انجام شده · ${faNum(pct)}٪`;
}

function renderToday() {
  renderHeader();
  renderFrog();
  renderTodayList();
  renderProgress();
}

/* ── Init ── */
export function initToday() {
  const form = $('#todayAddForm');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = $('#todayInput');
      const text = input ? input.value.trim() : '';
      if (!text) {
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        setTimeout(() => form.classList.remove('shake'), 380);
        return;
      }
      addTask(text, 'mid', 'misc');
      if (input) { input.value = ''; input.focus(); }
    });
  }

  $('#todayAllBtn')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'tasks' })));

  const list = $('#todayList');
  if (list) {
    list.addEventListener('click', e => {
      const row = e.target.closest('.t-row');
      if (!row) return;
      const task = getTask(row.dataset.id);
      if (!task) return;
      if (e.target.closest('.t-check')) setTaskDone(task.id, !task.done);
      else if (e.target.closest('.t-del')) collapse(row, task.id);
    });
  }

  const frog = $('#todayFrog');
  if (frog) {
    frog.addEventListener('click', e => {
      if (e.target.closest('.frog-start') && heroFrog) openFocus(heroFrog.id);
      else if (e.target.closest('.frog-next')) skipCurrentFrog();
      else if (e.target.closest('.frog-add')) $('#todayInput')?.focus();
      else {
        const alt = e.target.closest('.rec-alt');
        if (alt) { shownRecId = alt.dataset.id; renderFrog(true); }
      }
    });
  }

  renderToday();
  subscribe(renderToday);
}
