import { state } from './state.js';
import { $ } from './utils.js';
import { saveName } from './store.js';
import { initTheme } from './theme.js';
import { notify } from './bus.js';
import { initTasks, initAddForm, renderList, updateEmpty } from './tasks.js';
import { initProgress } from './progress.js';
import { initWeek } from './week.js';
import { initFocusPage, syncFocusPage } from './focus.js';
import { initRoll } from './roll.js';
import { initLibrary } from './library.js';
import { initReader } from './reader.js';
import { initProfile, renderProfile } from './profile.js';
import { initInsights } from './insights.js';
import { initStats } from './stats.js';
import { initShareCard } from './sharecard.js';
import { initToday } from './today.js';
import { initNotifications, notificationsSupported } from './notifications.js';
import { initDuePicker } from './duepicker.js';
import { initChangelogCheck } from './changelog.js';
import { initModalContainment } from './modal.js';
import { isBusy } from './calm.js';

/* Each section is initialized separately; an error in one section doesn't break the rest of the app */
const safe = (name, fn) => {
  try { fn(); }
  catch (err) { console.error(`[دَفتَرچه] خطا در راه‌اندازی «${name}»:`, err); }
};

/* ═══ Navigation + Glass Glider ═══
   Primary tabs: Today, Tasks, Focus, Library.
   Profile & Stats stay as regular pages: Profile opens from the header avatar,
   Stats opens from the Profile page.

   Every switch is a step and every step can be taken back. The trail of pages
   the reader has walked is kept in the history entry itself, so the on-screen
   back control, the browser's back button and an Android back gesture are one
   and the same movement — one entry back through the trail, wherever it leads.
   A reader on the very first page has nowhere to go back to and is offered no
   control for it. */
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

  /* Measuring the active tab forces layout, and a resize can fire dozens of
     times per second (a rotating phone, a dragged window). Coalescing the
     measurement into one frame keeps the glider following the tab smoothly
     instead of making every intermediate size pay for a forced reflow. */
  let glideFrame = 0;
  const scheduleGlider = () => {
    if (glideFrame) return;
    glideFrame = requestAnimationFrame(() => { glideFrame = 0; moveGlider(); });
  };

  /* ── The trail ──
     One array, mirrored into every history entry, is the whole back story: the
     page the reader is on is its last element and the page behind is the one
     before. Because each entry carries its own trail, a forward jump replays a
     trail that is already correct, and nothing has to be reconstructed. */
  let trail = [startPage()];

  /* Painting one page — no history, no bookkeeping, just the screen. */
  const reflect = page => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pg = $(`#page-${page}`);
    if (pg) pg.classList.add('active');
    nav.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
    /* A page switch lands at the top of the new page immediately.
       Scrolling there smoothly fought the incoming page's own entrance
       animation, and on a long list it turned one tap into a second of travel.
       In-list jumps still scroll smoothly — there the movement is the point. */
    window.scrollTo({ top: 0, behavior: 'instant' });
    moveGlider();
    if (page === 'today' || page === 'stats') notify();
    if (page === 'tasks') renderList(); // Keep the imperative list in sync with state
    if (page === 'focus') syncFocusPage();
    if (page === 'profile') renderProfile();
    /* The way back exists exactly while there is a step behind. */
    backBtns.forEach(b => { b.hidden = trail.length < 2; });
  };

  /* A step the reader took: one more entry on the trail. */
  const go = page => {
    if (!page || page === trail[trail.length - 1] || !$(`#page-${page}`)) return;
    trail = [...trail, page];
    history.pushState({ page, trail }, '', '#' + page);
    reflect(page);
  };

  const back = () => { if (trail.length > 1) history.back(); };

  /* The control itself, above the header so it never competes with the title
     for the same corner — but only on the pages the bottom bar cannot reach.
     Today, Tasks, Focus and Library are one tap apart in the bar, so a second
     way back there was noise; Profile and Stats are not on it, and they are
     where a way back is actually wanted. */
  const backBtns = [];
  document.querySelectorAll('.page').forEach(page => {
    if (TAB_PAGES.has(page.id.replace(/^page-/, ''))) return;
    const main = page.querySelector('main.app');
    if (!main) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-back';
    btn.hidden = true;
    btn.setAttribute('aria-label', 'بازگشت به صفحهٔ قبل');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg><span>بازگشت</span>';
    btn.addEventListener('click', back);
    main.prepend(btn);
    backBtns.push(btn);
  });

  /* The hash survives a reload, so a refresh comes back to the page the reader
     was on instead of always to the first tab. */
  history.replaceState({ page: trail[0], trail }, '', '#' + trail[0]);
  if (trail[0] !== 'today') {
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${trail[0]}`));
  }

  /* Any module can request a page change (avatar, frog start, stats entry) */
  window.addEventListener('navigate', e => go(String(e.detail || '')));

  nav.addEventListener('click', e => {
    const tab = e.target.closest('.nav-tab');
    if (!tab || tab.classList.contains('active')) return;
    go(tab.dataset.page);
  });

  /* Back, in the way the system sends it. A gesture made over an open dialog
     belongs to the dialog: it closes, and the page entry is put straight back,
     so a reader is never carried away from what they were answering. */
  addEventListener('popstate', e => {
    if (closeTopDialog()) {
      const cur = trail[trail.length - 1];
      history.pushState({ page: cur, trail }, '', '#' + cur);
      return;
    }
    const st = e.state;
    if (st && st.page && $(`#page-${st.page}`)) {
      trail = Array.isArray(st.trail) && st.trail.length ? st.trail : [st.page];
      reflect(trail[trail.length - 1]);
      return;
    }
    /* An entry this app did not write: the reader has stepped off its trail
       (they opened the tab from somewhere else, or a system gesture carried
       them past it). While there is still a trail to hold, stay pinned to it,
       so the pages behind cannot be lost under the reader's feet. On the first
       page there is nothing to hold, and the step is allowed to stand — that
       is how the system takes them out of the app. */
    if (trail.length > 1) {
      const cur = trail[trail.length - 1];
      history.pushState({ page: cur, trail }, '', '#' + cur);
    }
  });

  addEventListener('resize', scheduleGlider);
  addEventListener('load', scheduleGlider);
  if (document.fonts?.ready) document.fonts.ready.then(scheduleGlider);
  moveGlider();
}

/* The four homes the bottom bar already moves between. A page in here needs no
   back control of its own: the bar is its way in and out. */
const TAB_PAGES = new Set(['today', 'tasks', 'focus', 'library']);

/* The page named by the URL hash, if it names a real one; otherwise the first
   tab. Used both at boot and when a history entry carries no state at all. */
function startPage() {
  const h = (location.hash || '').replace(/^#/, '');
  return document.getElementById(`page-${h}`) ? h : 'today';
}

/* The dialog on top, if one is open — seen the same way the containment layer
   sees them. A back gesture made over a dialog is handed to it as Escape, which
   every dialog in the app already answers; nothing is force-closed here, so a
   card that insists on an answer keeps it. */
function closeTopDialog() {
  const open = [...document.querySelectorAll('.overlay, .sheet')]
    .filter(el => !el.hidden && el.getClientRects().length > 0);
  const top = open[open.length - 1];
  if (!top) return false;
  top.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return true;
}

/* ═══ Visibility ═══
   Marks the root while the app is not on screen so every ambient loop can be
   paused (base.css). The theme itself is applied by the inline script in
   index.html, before the first paint; from here on this module only reads it. */
function initVisibility() {
  const sync = () => document.documentElement.classList.toggle('tab-hidden', document.hidden);
  document.addEventListener('visibilitychange', sync);
  sync();
}

/* ═══ Theme ═══
   The colours, the picker and the one-tap switch all live in js/theme.js now —
   including the theme-color meta, which is read from the same token the CSS
   paints with. This page only starts it (safe('تم', initTheme) below); every
   rule after that reads the tokens it sets. */

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

/* What to run once the name card has been answered — set only for the first
   visit, so the release notes can follow the name card instead of landing on
   top of it (see Startup). Editing the name later passes nothing. */
let nameFlowDone = null;

function openNameModal(edit = false, done = null) {
  const t = $('#nameTitle'), i = $('#nameInput'), o = $('#nameOverlay');
  if (!t || !i || !o) return;
  t.textContent = edit ? 'اسمت رو عوض کن' : 'سلام! اسمت چیه؟';
  i.value = edit ? state.userName : '';
  nameFlowDone = done;
  o.hidden = false;
  setTimeout(() => i.focus(), 350);
}

/* Ends the first-visit flow. It runs whichever way the card is left — with a
   name or with "بعداً می‌گم" — because both mean the welcome is over. */
function finishNameFlow() {
  const done = nameFlowDone;
  nameFlowDone = null;
  if (done) done();
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
    finishNameFlow();
  });
  const skip = $('#skipName');
  if (skip) skip.onclick = () => { $('#nameOverlay').hidden = true; finishNameFlow(); };
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

/* ═══ Offline Shell ═══
   Registers the service worker. Registration waits for the load event so it
   never competes with the first paint. A freshly installed worker is offered
   to the user as a persistent toast: tapping it swaps the worker and the page
   reloads exactly once onto the new build. As a fallback, the hand-over also
   happens silently while the page is in the background — a running session is
   still never swapped out from under the user without a reload. */
function initPWA() {
  if (!('serviceWorker' in navigator)) return;

  /* controllerchange fires after SKIP_WAITING; reload once so the old JS that
     is already running is replaced by the new build (guard against loops). */
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  /* ══ The prompt, and the moment it is allowed to appear ══

     An update can land at any second, and the worst seconds are the ones where
     the reader is in the middle of something: half a task typed, a focus
     session running, a dialog they are answering, an undo they have not taken
     back yet. So the prompt is not shown when it is ready — it is shown at the
     first moment that is free, and until then it is only held.

     Two gates guard it:

     1. It is offered once per waiting worker. The browser reports the same
        waiting worker twice (once on registration, once on `updatefound`), and
        an entrance animation is not free — it is played when the reader is
        told, not once per report.
     2. That moment has to be a calm one (`calm`, below). */
  let waiting = null;    // the worker waiting to take over
  let announced = null;  // the worker the prompt has already spoken for
  let poll = 0;          // the retry clock; alive only while an offer is held

  /* A moment has to be calm (`isBusy`, js/calm.js — the rule the reminders obey
     too) and two more things have to hold here, in the prompt's own terms: */
  const calm = () => {
    /* Nobody is looking: the silent hand-over below owns this case. */
    if (document.hidden) return false;
    /* Nobody in the middle of anything. */
    if (isBusy()) return false;
    /* And not on top of the undo toast, which owns the same corner of the
       screen for its five seconds. */
    for (const t of document.querySelectorAll('.toast')) {
      if (t.id !== 'updateToast' && !t.hidden) return false;
    }
    return true;
  };

  const stopPolling = () => { clearInterval(poll); poll = 0; };

  const showUpdateToast = () => {
    const toast = $('#updateToast');
    const btn = $('#updateBtn');
    if (!toast || !btn || !waiting || announced === waiting) return;
    if (!calm()) { startPolling(); return; }
    announced = waiting;
    stopPolling();
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('show'));
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      toast.classList.remove('show');
      toast.hidden = true;
      /* Read the waiting worker at click time, not at bind time: the prompt
         lives for the whole session and may outlive the worker it first
         announced. */
      if (waiting) waiting.postMessage('SKIP_WAITING');
      /* controllerchange reloads; if it never fires (edge cases), recover
         after a grace period so the user is not stuck on the old build. */
      setTimeout(() => { if (!reloading) location.reload(); }, 3000);
    });
  };

  /* The offer is held, not dropped. One quiet check every couple of seconds
     asks whether the moment has come; the clock exists only while there is
     still something to say, and it stops with the prompt. */
  function startPolling() {
    if (poll || announced === waiting) return;
    poll = setInterval(() => { if (calm()) showUpdateToast(); }, 2000);
  }

  const offerUpdate = worker => {
    if (!worker) return;
    waiting = worker;
    showUpdateToast();
  };

  const register = () => {
    /* `updateViaCache: 'none'` keeps an update check on the network: the worker
       and the release marker it loads must never be answered from the browser's
       HTTP cache, or a deploy would only be noticed whenever that cache happens
       to expire. */
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { updateViaCache: 'none' })
      .then(reg => {
        /* An update may already be waiting from a previous visit. */
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              offerUpdate(reg.waiting);
            }
          });
        });

        /* Fallback hand-over as the app goes to the background or is closed:
           the moment the user is not looking at the loaded build. */
        const handOver = () => {
          if (!reg.waiting || document.visibilityState !== 'hidden') return;
          reg.waiting.postMessage('SKIP_WAITING');
        };
        /* Coming back to the page is also the moment an offer that arrived
           while it was away gets shown. */
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') showUpdateToast();
          handOver();
        });
        addEventListener('pagehide', handOver);
        handOver();
      })
      .catch(() => { /* the app runs fine without it */ });
  };

  if (document.readyState === 'complete') register();
  else addEventListener('load', register);
}

/* ═══ Startup ═══ */
safe('تم', initTheme);
safe('وضعیت نمایش', initVisibility);
/* Keeps focus inside whichever dialog is open and freezes the page behind it —
   registered before any dialog can be shown, so the first one is already
   contained. */
safe('دربرگیری رویه‌ها', initModalContainment);
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
safe('آمار', initStats);
safe('بینش‌ها', initInsights);
safe('کارت آمار', initShareCard);
safe('امروز', initToday);
safe('مهلت', initDuePicker);
/* Due-date watcher: silently no-ops until the user grants notification
   permission from a task card. */
if (notificationsSupported()) safe('یادآوری‌ها', () => initNotifications(() => state.tasks));

const dl = $('#dateLine');
if (dl) dl.textContent = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

safe('نام', applyName);
safe('رندر اولیه', () => { renderList(); notify(); });
safe('پوستهٔ آفلاین', initPWA);

/* First visit: stay on the Today page and ask for the name.
   The name card and the release notes are both welcome moments, and one after
   the other is enough — on a fresh install the notes used to open over the card
   asking for a name, which read as an interruption of the very first thing the
   app says. Now the release check waits for that flow to finish; a reader who
   already has a name gets the notes on the usual beat after boot. */
if (state.userName) {
  safe('چی خبر', initChangelogCheck);
} else {
  safe('اولین بازدید', () => openNameModal(false, () => safe('چی خبر', initChangelogCheck)));
}