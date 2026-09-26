/* ═══ Achievements — the page, the summary card, and the moment ═══
   Three surfaces, one engine behind them (js/achievements.js) and one book
   (js/ledger.js):

     · the summary card in the profile — how far along, and the three badges
       closest to opening, so the shelf pulls from the page it lives on;
     · the page — the rank, the tabs, the whole catalogue, the records and the
       weekly head-to-head;
     · the celebration — one sheet at a time, and only for something genuinely
       new.

   The rule that keeps it honest runs through all three: **the evaluation
   happens once, here, in tick()**. Every surface then reads what it produced.
   A page that re-derived its own numbers could disagree with the card beside
   it, and a badge that gets unlocked is written down immediately — before it is
   celebrated — so a celebration that is never seen (the tab closed, the reader
   busy) can never cost the reader the badge itself.

   `tick()` is called on every change to the app's data (js/bus.js) and is
   guarded by a fingerprint, so a keystroke elsewhere costs one string compare
   rather than a walk over a year of days. */

import { $, faNum, dayKey } from './utils.js';
import { state } from './state.js';
import { subscribe } from './bus.js';
import { STORAGE_KEYS } from './constants.js';
import { loadAchv, saveAchv, loadFreeze, saveFreeze } from './store.js';
import { collectTotals } from './ledger.js';
import { getBooks } from './library.js';
import { getHistory } from './focushistory.js';
import { formatJalaliDate, dateToJalali, JALALI_MONTHS } from './jalali.js';
import { qorqoriMarkup } from './qorqori.js';
import { confetti, beep } from './confetti.js';
import { isBusy } from './calm.js';
import {
  FAMILIES, TIER_NAMES, KIND_LABEL, byId, iconOf, emptyState, normalizeState,
  evaluate, nearest, weekBoard,
} from './achievements.js';

/* ── Kept between ticks ── */
let book = null;      // the day book, from js/ledger.js
let res = null;       // the last evaluation
let saved = emptyState();
let tab = 'all';
let lastSig = '';
let queue = [];
let celebrating = false;
let flushTimer = 0;
let toastTimer = 0;

const pe = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── The fingerprint ──
   Everything that can move a number, and nothing that cannot. A tick of the
   clock is not in it: the day changing is, which is the only clock event the
   book cares about. */
function fingerprint() {
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  let done = 0, lastDone = 0;
  for (const t of tasks) {
    if (!t.done) continue;
    done++;
    if (Number(t.doneAt) > lastDone) lastDone = Number(t.doneAt) || 0;
  }
  const books = getBooks().map(b =>
    `${b.id}:${(b.highlights || []).length}:${(b.notes || []).length}:${(b.completedPages || []).length}:${Object.keys(b.stats || {}).length}`).join(',');
  let led = 0;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.ledger));
    led = raw && raw.days ? Object.keys(raw.days).length : 0;
  } catch { /* unreadable ledger counts as empty */ }
  const moods = state.moods && typeof state.moods === 'object' ? Object.keys(state.moods).length : 0;
  return [
    tasks.length, done, lastDone,
    Array.isArray(state.history) ? state.history.length : 0,
    moods, getHistory().length, books, led, loadFreeze() ? 1 : 0, dayKey(new Date()),
  ].join('|');
}

/* ═══ Tick ═══
   Read the book → evaluate → write down what is now unlocked → celebrate what
   is genuinely new → repaint what is on screen. */
function tick(force = false) {
  const sig = fingerprint();
  if (!force && sig === lastSig && res) return;
  lastSig = sig;

  book = collectTotals();
  const prev = normalizeState(loadAchv());
  res = evaluate(book, prev);

  /* The first run of the shelf is a baseline, not a victory: everything already
     earned is written down as unlocked-with-no-date, and nothing is announced.
     Without this, a reader with six months behind them would be shown twenty
     celebration sheets for a feature that arrived this morning. */
  const firstRun = !prev.baselineAt;
  const unlocked = {};
  for (const r of res.rows) {
    if (!r.tier) continue;
    const before = prev.unlocked[r.a.id];
    unlocked[r.a.id] = {
      tier: r.tier,
      at: before && before.tier >= r.tier ? before.at : (firstRun ? null : book.today),
    };
  }

  /* The rows keep the dates that were just decided, so a badge unlocked in this
     very tick already knows the day it happened on. */
  for (const r of res.rows) {
    const u = unlocked[r.a.id];
    if (u) r.at = u.at;
  }

  const recSeen = { ...prev.recSeen };
  const broken = [];
  for (const r of res.records) {
    /* A record is broken when today's number beats the runner-up — never the
       first time a number is simply set, and never twice in one day. A growing
       streak is the one that could fire every day, so it is held to the exact
       day the old best was passed. */
    if (!r.fresh || r.prev <= 0 || recSeen[r.key] === book.today) continue;
    if (r.key === 'streak' && r.value !== r.prev + 1) continue;
    recSeen[r.key] = book.today;
    broken.push({ kind: 'record', rec: r });
  }

  saved = { v: 1, baselineAt: prev.baselineAt || book.today, unlocked, recSeen };
  saveAchv(saved);

  if (!firstRun) {
    for (const r of res.newly) queue.push({ kind: r.tier === 1 ? 'badge' : 'tier', row: r });
    queue.push(...broken);
  }
  flush();

  renderSummary();
  if ($('#page-achv')?.classList.contains('active')) renderAchievements();
}

/* The one door the rest of the app uses (js/profile.js). Idempotent. */
export function refreshAchievements() { tick(); }

/* ═══ Summary card (Profile) ═══ */
function pips(tier, max) {
  let out = '';
  for (let i = 0; i < max; i++) {
    out += `<i class="achv-pip${i < tier ? ' on' : ''}"></i>`;
  }
  return `<span class="achv-pips" role="img" aria-label="${tier ? TIER_NAMES[tier - 1] : 'باز نشده'}">${out}</span>`;
}

function rowProgress(r) {
  const pct = Math.round(r.pct * 100);
  return `<span class="achv-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"` +
    ` aria-valuenow="${pct}" aria-label="${pe(r.a.title)}">` +
    `<i class="achv-fill" style="width:${pct}%"></i></span>`;
}

const leftText = r => r.nextGoal === null ? 'کامل' : `${faNum(r.value)} از ${faNum(r.nextGoal)} ${r.a.unit}`;

function renderSummary() {
  const host = $('#achvSummary');
  if (!host || !res) return;
  const near = nearest(res.rows, 3);
  /* The arc counts badges, because the number in the middle of it is the badge
     count. Showing a rung percentage around a badge count would be two answers
     to one question — the rungs keep their own line right below. */
  const pct = res.total ? Math.round((res.earned / res.total) * 100) : 0;
  const sig = [res.earned, res.total, res.steps, res.rank.index, res.rank.pct.toFixed(2), pct,
    near.map(n => `${n.a.id}${n.tier}${Math.round(n.pct * 100)}`).join(',')].join('|');
  if (host.dataset.sig === sig) return;
  host.dataset.sig = sig;

  const head = $('#achvHeadHint');
  if (head) head.textContent = `${faNum(res.earned)} از ${faNum(res.total)} نشان`;

  const minis = near.map(r => `
    <li class="achv-mini">
      <span class="achv-mini-top"><b>${pe(r.a.title)}</b><small>${pe(leftText(r))}</small></span>
      ${rowProgress(r)}
    </li>`).join('');

  host.innerHTML = `
    <div class="achv-sum-head">
      <div class="ring-wrap achv-ring" style="--pct:${pct}" role="img" aria-label="${pct}٪ از پله‌های نشان‌ها">
        <div class="ring-inner"><div class="ring-text"><span>${faNum(res.earned)}</span></div></div>
      </div>
      <div class="achv-sum-text">
        <strong>رتبهٔ ${pe(res.rank.name)}</strong>
        <span>${faNum(res.earned)} از ${faNum(res.total)} نشان</span>
        <span>${faNum(res.steps)} پله از ${faNum(res.totalSteps)} پله</span>
        <span class="achv-sum-score"><b>${faNum(res.score)}</b> امتیاز</span>
      </div>
    </div>
    ${near.length ? `<ul class="achv-minis">${minis}</ul>` : ''}`;

  const openBtn = $('#openAchvBtn');
  if (openBtn) openBtn.hidden = false;
}

/* ═══ Page ═══ */
function tabButtons() {
  const items = [{ key: 'all', label: 'همه' }, ...FAMILIES];
  return items.map(f => {
    const on = f.key === tab;
    const count = f.key === 'all' ? res.rows.length : res.rows.filter(r => r.a.family === f.key).length;
    return `<button type="button" class="achv-tab${on ? ' sel' : ''}" role="tab" aria-selected="${on}" data-key="${f.key}">` +
      `${f.label}<small>${faNum(count)}</small></button>`;
  }).join('');
}

function itemHtml(r) {
  const a = r.a;
  const locked = !r.open;
  /* The medal is decoration: the badge's name is right there in text, so the
     icon is hidden from the accessibility tree instead of being announced as a
     second, emptier name. */
  return `<button type="button" class="achv-item${locked ? ' locked' : ''}${r.complete ? ' complete' : ''}" data-id="${a.id}" aria-haspopup="dialog">` +
    `<span class="achv-medal" aria-hidden="true">${iconOf(a.icon)}</span>` +
    `<span class="achv-item-main">` +
      `<span class="achv-item-top"><b>${pe(a.title)}</b>` +
      `<span class="achv-kind k-${a.kind}">${KIND_LABEL[a.kind]}</span></span>` +
      (locked ? `<span class="achv-how">${pe(a.how)}</span>` : '') +
      `<span class="achv-item-foot">${pips(r.tier, a.tiers.length)}${rowProgress(r)}` +
      `<small>${locked ? `${faNum(r.value)} از ${faNum(r.nextGoal)}` : pe(leftText(r))}</small></span>` +
    `</span></button>`;
}

function recordsHtml() {
  return `<div class="stat-sec-head"><strong>رکوردها</strong><span>بهترین‌های خودت</span></div>` +
    `<div class="achv-records">` + res.records.map(r => `
      <div class="achv-record${r.fresh ? ' fresh' : ''}">
        <span class="achv-medal sm" aria-hidden="true">${iconOf(r.icon)}</span>
        <span class="achv-record-main">
          <b>${pe(r.label)}</b>
          <small>${r.at ? (r.key === 'month' ? pe(monthLabel(r.at)) : pe(dayLabel(r.at))) : '—'}</small>
        </span>
        <span class="achv-record-val"><b>${faNum(r.value)}</b><small>${pe(r.unit)}</small></span>
        <span class="achv-record-prev">${r.prev > 0 ? `رکورد قبلی: ${faNum(r.prev)}` : 'اولین رکورد'}</span>
      </div>`).join('') + `</div>`;
}

function weekHtml() {
  const w = weekBoard(book);
  const arrow = d => d > 0 ? '<i class="achv-dir up">▲</i>' : d < 0 ? '<i class="achv-dir down">▼</i>' : '<i class="achv-dir same">—</i>';
  const verdict = w.outcome > 0 ? 'این هفته بردی' : w.outcome < 0 ? 'هفتهٔ پیش جلوتر بود' : 'مساوی';
  const lines = w.lines.map(l => `<li><span>${pe(l.label)}</span><b>${faNum(l.a)}</b>${arrow(l.dir)}<b class="past">${faNum(l.b)}</b></li>`).join('');
  return `<div class="stat-sec-head"><strong>این هفته در برابر هفتهٔ پیش</strong><span>${pe(verdict)}</span></div>` +
    `<div class="achv-vs">` +
      `<div class="achv-vs-score"><b>${faNum(w.scoreA)}</b><span>امتیاز این هفته</span>` +
      `<b class="past">${faNum(w.scoreB)}</b><span>هفتهٔ پیش</span></div>` +
      `<ul class="achv-vs-lines">${lines}</ul>` +
      `<p class="achv-season">کارنامه: <b>${faNum(w.season.wins)}</b> برد · <b>${faNum(w.season.losses)}</b> باخت · <b>${faNum(w.season.draws)}</b> مساوی` +
      (w.season.run > 0 ? ` · ${faNum(w.season.run)} هفتهٔ پیاپی بردی` : '') +
      (w.season.bestRun > 1 ? ` · بهترین رشته: ${faNum(w.season.bestRun)} هفته` : '') + `</p>` +
    `</div>`;
}

const dayLabel = key => formatJalaliDate(new Date(key + 'T00:00:00'));
const monthLabel = key => {
  const j = dateToJalali(new Date(key + '-01T00:00:00'));
  return `${JALALI_MONTHS[j.jm - 1]} ${faNum(j.jy)}`;
};

export function renderAchievements() {
  if (!res) tick();
  if (!res) return;
  const page = $('#page-achv');

  const sub = $('#achvSub');
  if (sub) sub.textContent = `${faNum(res.earned)} از ${faNum(res.total)} نشان · ${faNum(res.steps)} پله`;

  /* Rank: the number, the bar, and where the points come from — said out loud,
     because a score nobody can account for is a score nobody trusts. */
  const rank = $('#achvRank');
  const rankSig = `${res.score}|${res.rank.index}`;
  if (rank && rank.dataset.sig !== rankSig) {
    rank.dataset.sig = rankSig;
    rank.innerHTML = `
      <div class="achv-rank-top"><strong>رتبهٔ ${pe(res.rank.name)}</strong><span><b>${faNum(res.score)}</b> امتیاز</span></div>
      <span class="achv-track tall" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(res.rank.pct * 100)}" aria-label="امتیاز تا رتبهٔ بعد">
        <i class="achv-fill" style="width:${Math.round(res.rank.pct * 100)}%"></i>
      </span>
      <p class="achv-rank-next">${res.rank.next ? `${faNum(res.rank.left)} امتیاز تا «${pe(res.rank.next.name)}»` : 'بالاترین رتبه را داری'}</p>
      ${res.rank.next ? `<details class="achv-how-score"><summary>امتیاز از کجا می‌آید؟</summary><ul>` +
        res.parts.map(p => `<li><span>${pe(p.label)}</span><b>${faNum(p.value)}</b><i>×${faNum(p.weight)}</i><em>${faNum(p.points)}</em></li>`).join('') +
        `</ul></details>` : ''}`;
  }

  const tabs = $('#achvTabs');
  if (tabs) tabs.innerHTML = tabButtons();

  const near = nearest(res.rows, 3);
  const nearHost = $('#achvNear');
  if (nearHost) {
    nearHost.innerHTML = near.length
      ? `<div class="stat-sec-head"><strong>نزدیک‌ترین‌ها</strong><span>چیزی نمانده</span></div>` +
        `<div class="achv-near">` + near.map(r => `
          <button type="button" class="achv-near-card" data-id="${r.a.id}" aria-haspopup="dialog">
            <span class="achv-medal" aria-hidden="true">${iconOf(r.a.icon)}</span>
            <b>${pe(r.a.title)}</b>
            ${rowProgress(r)}
            <small>${pe(leftText(r))}</small>
          </button>`).join('') + `</div>`
      : '';
  }

  const rows = tab === 'all' ? res.rows : res.rows.filter(r => r.a.family === tab);
  const list = $('#achvList');
  if (list) list.innerHTML = rows.map(itemHtml).join('');

  const rec = $('#achvRecords');
  if (rec) rec.innerHTML = recordsHtml();
  const wk = $('#achvWeek');
  if (wk) wk.innerHTML = weekHtml();
}

/* ═══ Detail ═══ */
function openDetail(id) {
  const r = res?.rows.find(x => x.a.id === id);
  const overlay = $('#achvDetailOverlay');
  const body = $('#achvDetailBody');
  if (!r || !overlay || !body) return;
  const a = r.a;
  const family = FAMILIES.find(f => f.key === a.family);
  const rungs = a.tiers.map((goal, i) => {
    const reached = r.tier > i;
    return `<li class="achv-rung${reached ? ' on' : ''}"><i class="achv-pip${reached ? ' on' : ''}"></i>` +
      `<span>${TIER_NAMES[i]}</span><b>${faNum(goal)} ${pe(a.unit)}</b></li>`;
  }).join('');
  const when = r.at ? `باز شد در ${formatJalaliDate(new Date(r.at + 'T00:00:00'))}`
    : r.open ? 'قبل از اینکه این صفحه ساخته شود بازش کرده بودی' : '';
  body.innerHTML = `
    <span class="achv-detail-medal" aria-hidden="true">${iconOf(a.icon)}</span>
    <h2>${pe(a.title)}</h2>
    <p class="achv-detail-kind">${pe(family ? family.label : '')} · ${KIND_LABEL[a.kind]}</p>
    <ul class="achv-ladder">${rungs}</ul>
    ${r.nextGoal === null ? '<p class="achv-detail-done">همهٔ پله‌های این نشان بالا رفته.</p>' : `<p class="achv-detail-how">${pe(a.how)} — ${pe(leftText(r))}</p>`}
    ${when ? `<p class="achv-detail-at">${pe(when)}</p>` : ''}
    <span class="achv-detail-char" aria-hidden="true">${qorqoriMarkup(r.tier ? 'proud' : 'thinking')}</span>
    <button class="ghost" type="button" id="achvDetailClose">بستن</button>`;
  overlay.hidden = false;
  $('#achvDetailClose')?.addEventListener('click', () => { overlay.hidden = true; });
}

/* ═══ The moment ═══
   One sheet at a time, never over something the reader is in the middle of, and
   never twice for the same thing. A badge is a sheet; a rung is only worth a
   line at the bottom of the screen. */
/* One line per family, so a badge says something about the life behind it rather
   than repeating the same three words seven times. The hard rungs have their own
   register: an «افسانه‌ای» badge announced like a first tick would be a lie about
   how long it took. */
const FAMILY_LINE = {
  start: 'شروع خوبیه.',
  streak: 'روزهای پیاپی‌ات داره شکل می‌گیره.',
  work: 'کارها یکی‌یکی زمین مونن.',
  focus: 'تمرکز این روزها کمیاب‌ترین چیزه.',
  read: 'این صفحه‌ها یواش‌یواش جمع می‌شن.',
  mood: 'ثبت حال، خودش نصف کاره.',
  legend: 'این دیگه افسانه‌ست.',
};

function sentence(item) {
  const name = (state.userName || '').trim();
  const who = name ? `${name} جان، ` : '';
  if (item.kind === 'record') {
    const r = item.rec;
    return `${who}رکورد «${r.label}» را شکستی — ${faNum(r.value)} ${r.unit} در برابر ${faNum(r.prev)} قبلی.`;
  }
  const a = item.row.a;
  if (item.kind === 'tier') return `«${a.title}» رفت روی ${TIER_NAMES[item.row.tier - 1]}.`;
  if (a.kind === 'legend') return `${who}این دیگه افسانه‌ست. «${a.title}» باز شد.`;
  if (a.kind === 'skilled') return `${who}این یکی کارِ هر روز نیست. «${a.title}» باز شد.`;
  return `${who}«${a.title}» باز شد — ${FAMILY_LINE[a.family] || 'ادامه بده.'}`;
}

function showSheet(item) {
  const overlay = $('#achvOverlay');
  const body = $('#achvUnlockBody');
  if (!overlay || !body) return;
  const isRecord = item.kind === 'record';
  const title = isRecord ? 'رکورد شکست!' : item.row.a.title;
  const icon = isRecord ? 'crown' : item.row.a.icon;
  const tierLine = !isRecord && item.row.tier > 1 ? `<em class="achv-unlock-tier">${TIER_NAMES[item.row.tier - 1]}</em>` : '';
  body.innerHTML = `
    <span class="achv-unlock-char" aria-hidden="true">${qorqoriMarkup('celebrating')}</span>
    <span class="achv-unlock-medal" aria-hidden="true">${iconOf(icon)}</span>
    <h2>${pe(title)}${tierLine}</h2>
    <p>${pe(sentence(item))}</p>
    <button class="go" type="button" id="achvUnlockOk">دمت گرم!</button>
    <button class="ghost sm" type="button" id="achvUnlockMore">دیدن نشان‌ها</button>`;
  overlay.hidden = false;
  confetti();
  beep();
  $('#achvUnlockOk')?.addEventListener('click', () => { overlay.hidden = true; });
  $('#achvUnlockMore')?.addEventListener('click', () => {
    overlay.hidden = true;
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'achv' }));
  });
}

function showToast(item) {
  const el = $('#achvToast');
  const txt = $('#achvToastText');
  if (!el || !txt) return;
  txt.textContent = sentence(item);
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; el.classList.remove('show'); }, 4000);
}

function flush() {
  clearTimeout(flushTimer);
  flushTimer = 0;
  if (celebrating || !queue.length) return;
  /* Never over a dialog, a running focus session or moving hands. The queue
     waits; it does not evaporate. */
  if (isBusy()) {
    flushTimer = setTimeout(flush, 4000);
    return;
  }
  const item = queue.shift();
  celebrating = true;
  if (item.kind === 'tier') {
    showToast(item);
    setTimeout(() => { celebrating = false; flush(); }, 3200);
    return;
  }
  /* A sheet is the wait: the next one comes up when this one is closed — by its
     button, the scrim or Escape. Closing is watched rather than hooked into
     each of those three, so none of them can forget to carry on (see the
     watcher in initAchievements). */
  showSheet(item);
}

/* ═══ Wiring ═══ */
export function initAchievements() {
  $('#openAchvBtn')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'achv' })));
  $('#achvDetailOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });
  $('#achvOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });
  /* Escape, delivered by the app's own dialog handling (js/app.js dispatches a
     synthetic Escape at the top dialog) as well as by the browser directly. */
  for (const id of ['#achvDetailOverlay', '#achvOverlay']) {
    $(id)?.addEventListener('keydown', e => { if (e.key === 'Escape') $(id).hidden = true; });
  }

  /* Delegated, so the list can be rebuilt at will without losing its wiring. */
  document.querySelectorAll('#achvList, #achvNear').forEach(host => {
    host.addEventListener('click', e => {
      const b = e.target.closest('[data-id]');
      if (b) openDetail(b.dataset.id);
    });
  });
  $('#achvTabs')?.addEventListener('click', e => {
    const b = e.target.closest('.achv-tab');
    if (!b || b.dataset.key === tab) return;
    tab = b.dataset.key;
    renderAchievements();
  });

  /* The freeze switch: a setting with consequences, so it says out loud what it
     does rather than being a bare toggle. */
  const btn = $('#profFreezeBtn');
  const paint = () => {
    const on = loadFreeze();
    if (btn) {
      btn.setAttribute('aria-checked', String(on));
      btn.classList.toggle('on', on);
    }
    const txt = $('#profFreezeText');
    if (txt) txt.textContent = on ? 'روشن' : 'خاموش';
  };
  btn?.addEventListener('click', () => {
    saveFreeze(!loadFreeze());
    paint();
    tick(true);
  });
  paint();

  /* One watcher for the whole app: whenever the unlock sheet is closed, the
     queue moves on. */
  const sheet = $('#achvOverlay');
  if (sheet) {
    new MutationObserver(() => {
      if (sheet.hidden && celebrating) { celebrating = false; flush(); }
    }).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
  }

  subscribe(() => tick());
  tick(true);
}
