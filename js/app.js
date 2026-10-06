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
import { initSettings, renderSettings } from './settings.js';
import { initInsights } from './insights.js';
import { initStats } from './stats.js';
import { initShareCard } from './sharecard.js';
import { initAchievements, renderAchievements } from './achievementsview.js';
import { initToday } from './today.js';
import { initPlanner, renderPlanner } from './planner.js';
import { initNotifications, notificationsSupported } from './notifications.js';
import { initDuePicker } from './duepicker.js';
import { initBirthday } from './birthday.js';
import { initChangelogCheck } from './changelog.js';
import { initModalContainment } from './modal.js';
import { isBusy } from './calm.js';
import { initStorageWarning } from './storagewarn.js';

/* Each section is initialized separately; an error in one section doesn't break the rest of the app */
const safe = (name, fn) => {
  try { fn(); }
  catch (err) { console.error(`[دَفتَرچه] خطا در راه‌اندازی «${name}»:`, err); }
};

/* ═══ Navigation + Glass Glider ═══
   Primary tabs: Today, Tasks, Focus, Library, Week.
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
    /* While a dock drag holds the capsule it is the pointer, not the active
       tab, that decides where it sits — a resize or a per-page sync landing
       mid-gesture must not yank it out from under the finger. The drag ends
       by taking the class off and calling this itself. */
    if (nav.classList.contains('nav-dragging')) return;
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
    if (page === 'achv') renderAchievements();
    if (page === 'settings') renderSettings();
    if (page === 'week') renderPlanner();
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

  /* A press that turns into a dock drag lands through the drag itself; the
     click the browser still fires afterwards is the very same step again and
     is dropped. The mark is deliberately short-lived — the pointerdown of the
     next press clears it and a timer keeps it from outliving the drag — so it
     can never grow into a tap that is silently ignored. A plain tap never
     sets it, so a tap is untouched. */
  let swallowClick = false;

  nav.addEventListener('click', e => {
    if (swallowClick) { swallowClick = false; return; }
    const tab = e.target.closest('.nav-tab');
    if (!tab || tab.classList.contains('active')) return;
    go(tab.dataset.page);
  });

  /* ── The dock answers the pointer, not just the press ──
     A tap is the click above. A press that then *moves* down the bar is a
     drag: the capsule leaves the active tab and rides with the pointer, and
     the tab it is over reads as chosen for as long as it is there. Nothing is
     navigated until the pointer is let go — one press, one step, one history
     entry, exactly like a tap — so the trail never learns about the tabs a
     finger merely passed over.

     The capsule is measured in the dock's own coordinates and blended between
     the two tab centres the pointer sits between, so it tracks the pointer
     continuously instead of hopping from tab to tab. The geometry is sorted by
     position before it is read: the bar is RTL, so the first button in the
     markup is the rightmost tab on screen and "which is on the left" is a
     question about x, not about the DOM. */
  const tabs = [...nav.querySelectorAll('.nav-tab')];
  const localX = clientX => clientX - nav.getBoundingClientRect().left - nav.clientLeft;
  let ndrag = null;

  const paintDrag = x => {
    const g = tabs.map(t => ({ el: t, left: t.offsetLeft, w: t.offsetWidth }));
    if (!g.length) return;
    g.sort((a, b) => a.left - b.left);
    const mid = g.map(m => m.left + m.w / 2);
    let left, w;
    if (x <= mid[0]) ({ left, w } = g[0]);
    else if (x >= mid[mid.length - 1]) ({ left, w } = g[g.length - 1]);
    else {
      let i = 0;
      while (i < mid.length - 1 && x > mid[i + 1]) i++;
      const t = (x - mid[i]) / ((mid[i + 1] - mid[i]) || 1);
      left = g[i].left + (g[i + 1].left - g[i].left) * t;
      w = g[i].w + (g[i + 1].w - g[i].w) * t;
    }
    /* The tab the pointer is over is the one whose centre is nearest — read
       from the pointer directly rather than from the blend, so at the very
       ends of the bar the far tab is still chosen. */
    let over = g[0].el, best = Infinity;
    for (const m of g) {
      const d = Math.abs(x - (m.left + m.w / 2));
      if (d < best) { best = d; over = m.el; }
    }
    glider.style.opacity = 1;
    glider.style.width = w + 'px';
    glider.style.transform = `translateX(${left}px)`;
    tabs.forEach(t => t.classList.toggle('nav-preview', t === over));
    if (ndrag) ndrag.page = over.dataset.page;
  };

  const endDrag = commit => {
    const d = ndrag;
    if (!d) return;
    ndrag = null;
    nav.classList.remove('nav-dragging');
    tabs.forEach(t => t.classList.remove('nav-preview'));
    if (d.started) {
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 350);
    }
    /* Only a real drag reaches the page; a press that never moved is left to
       the click above. The capsule goes back to the tab that is now active
       either way, and with the dragging class gone that return glides. */
    const act = nav.querySelector('.nav-tab.active')?.dataset.page;
    if (d.started && commit && d.page && d.page !== act) go(d.page);
    else moveGlider();
  };

  /* A drag belongs to the dock until the pointer is released, so the press is
     captured once it is unmistakably a drag — a tap keeps its own target and
     its click, a drag keeps the pointer even when it leaves the bar. */
  const onDockDown = e => {
    swallowClick = false;                 // a new press owns the next click
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || !t.closest('.nav-tab')) return;
    const rv = document.getElementById('readerView');
    if (rv && !rv.hidden) return;                   // inside a book: not our bar
    if (document.querySelector('.overlay:not([hidden]), .sheet:not([hidden])')) return;
    ndrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, started: false, page: null };
  };

  const onDockMove = e => {
    if (!ndrag || e.pointerId !== ndrag.id) return;
    const dx = e.clientX - ndrag.x0;
    const dy = e.clientY - ndrag.y0;
    if (!ndrag.started) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      /* A press that is really going up or down is not a walk along the bar:
         it is dropped outright, so a thumb on the dock never slides the
         capsule sideways on its way somewhere else. */
      if (Math.abs(dy) > Math.abs(dx)) { ndrag = null; return; }
      ndrag.started = true;
      nav.classList.add('nav-dragging');
      /* A mouse drag that began on a label has already started the browser's
         own selection; the gesture owns the pointer from here. Touch never
         selects by dragging. */
      if (e.pointerType === 'mouse') getSelection()?.removeAllRanges();
      try { nav.setPointerCapture(e.pointerId); } catch (err) {}
    }
    if (e.cancelable) e.preventDefault();
    paintDrag(localX(e.clientX));
  };

  const onDockUp = e => { if (ndrag && e.pointerId === ndrag.id) endDrag(true); };
  const onDockCancel = e => { if (ndrag && e.pointerId === ndrag.id) endDrag(false); };

  /* The one touch event that can still beat the dock: with touch-action:none
     on the bar the browser is not scrolling it, and this keeps a move off the
     page underneath even where that declaration is not honoured. A move with
     no drag behind it is left completely alone. */
  nav.addEventListener('touchmove', e => { if (ndrag) e.preventDefault(); }, { passive: false });
  nav.addEventListener('pointerdown', onDockDown);
  document.addEventListener('pointermove', onDockMove);
  document.addEventListener('pointerup', onDockUp);
  document.addEventListener('pointercancel', onDockCancel);
  addEventListener('blur', () => { if (ndrag) endDrag(false); });

  /* And the third way in: a horizontal drag — a thumb on a phone or the mouse
     on a desktop — that carries the pages sideways like a chat app. It lands
     on the neighbour through the very same go(), so everything above (the
     trail, the history entries, the glider) reacts exactly as it does to a
     tap. */
  initSwipeNavigation(() => trail[trail.length - 1], go);

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

/* The five homes the bottom bar already moves between, in bar order — the
   order a swipe walks through, one neighbour at a time. A page in here needs
   no back control of its own: the bar is its way in and out. */
const TAB_ORDER = ['today', 'tasks', 'focus', 'library', 'week'];
const TAB_PAGES = new Set(TAB_ORDER);

/* ═══ Swipe / drag between tab pages ═══
   A horizontal drag — touch or mouse, no dependency and no library — carries
   the current page under the pointer while the neighbour slides in behind it
   with a parallax delay, Telegram-style. Release past a quarter of the screen
   (or a quick flick) lands on that neighbour; anything less springs back.

   What the gesture deliberately does not do: it never starts on an interactive
   surface (forms, buttons, the PDF reader's canvas, the week's draggable rows),
   never fights vertical scrolling — the pages declare touch-action:pan-y, so a
   vertical thumb is answered by the browser's own scroll and a pointercancel —
   and never runs while a dialog or the book reader is open. At the first and
   last tab the drag meets resistance, the way a drawer meets its frame.

   The landing itself is a plain go(): the trail, the history entry, the glider
   and every per-page sync behave exactly as they do for a tap on the bar.
   Readers who ask the system for reduced motion skip the live follow and get
   the same threshold landing without the theatre. */
function initSwipeNavigation(curPage, go) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rtl = () => document.documentElement.dir === 'rtl';
  const IGNORE = 'input, textarea, select, button, a, label, iframe, canvas, '
    + '[contenteditable], [data-no-swipe]';
  let drag = null;

  const overlayOpen = () =>
    !!document.querySelector('.overlay:not([hidden]), .sheet:not([hidden])');

  /* Which neighbour a drag toward dx leads to, or -1 at either end of the bar.
     In RTL the next page lives to the left, so there the drag runs the other
     way: pulling rightward is what pulls the next page into view. */
  const neighbor = dx => {
    const idx = TAB_ORDER.indexOf(curPage());
    if (idx < 0) return -1;
    const forward = rtl() === (dx > 0);
    const j = forward ? idx + 1 : idx - 1;
    return j >= 0 && j < TAB_ORDER.length ? j : -1;
  };

  /* Stage both pages out of the document flow for the length of the drag:
     fixed to the viewport, each with its own scrollbar, so the live follow
     never reflows the page behind. The outgoing page keeps its scroll
     position; the incoming one starts at its top, like any page switch. */
  const enter = () => {
    const fromEl = document.getElementById('page-' + curPage());
    /* At either end of the bar there is no neighbour to bring in — the drag
       still stages, so paint() can show the drawer-meets-frame resistance
       instead of nothing at all. */
    const toEl = drag.j >= 0
      ? document.getElementById('page-' + TAB_ORDER[drag.j]) : null;
    if (!fromEl) { drag = null; return; }
    drag.fromEl = fromEl;
    drag.toEl = toEl;
    drag.w = window.innerWidth;
    document.body.classList.add('page-swiping');
    for (const el of [fromEl, toEl]) {
      if (!el) continue;
      el.style.transition = 'none';        // a re-drag during a spring-back
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.overflowY = 'auto';
      el.style.display = 'block';
    }
    fromEl.scrollTop = window.scrollY;
    if (toEl) { toEl.scrollTop = 0; toEl.style.zIndex = '1'; }
  };

  /* The follow itself. The outgoing page rides the pointer one to one; the
     incoming one trails at a third of that, the parallax that makes the pair
     read as two sheets of paper rather than one sliding pane. */
  const paint = () => {
    const { fromEl, toEl, dx, w, j } = drag;
    const d = j < 0 ? dx * 0.3 : dx;       // resistance past the first/last tab
    const side = rtl() ? -1 : 1;           // the side the neighbour parks on
    fromEl.style.transform = `translateX(${d}px)`;
    if (toEl) toEl.style.transform = `translateX(${side * w + d / 3}px)`;
  };

  const cleanup = d => {
    /* A drag released moments ago may still have its spring-back timer pending
       while a new drag takes the pages over — the new drag owns the styles,
       and its own cleanup will return them. */
    if (drag) return;
    for (const el of [d.fromEl, d.toEl]) {
      if (!el) continue;
      for (const prop of ['position', 'inset', 'overflowY', 'display',
        'transform', 'transition', 'zIndex']) el.style[prop] = '';
    }
    document.body.classList.remove('page-swiping');
  };

  const settle = commit => {
    const d = drag;
    if (!d) return;
    /* The gesture ends here, whatever follows: an abort must never leave the
       pointer armed, or the same release could land the very swipe it was
       meant to cancel. */
    drag = null;
    if (reduced) {                          // no staging happened; just land
      if (commit && d.j >= 0) go(TAB_ORDER[d.j]);
      return;
    }
    if (!d.fromEl) { cleanup(d); return; }
    const { fromEl, toEl, w } = d;
    if (!(commit && d.j >= 0)) {           // spring back to where it started
      const side = rtl() ? -1 : 1;
      fromEl.style.transition = 'transform .22s cubic-bezier(.2,.7,.3,1)';
      fromEl.style.transform = 'translateX(0)';
      if (toEl) {
        toEl.style.transition = 'transform .22s cubic-bezier(.2,.7,.3,1)';
        toEl.style.transform = `translateX(${side * w}px)`;
      }
      setTimeout(() => cleanup(d), 240);
      return;
    }
    go(TAB_ORDER[d.j]);
    const side = rtl() ? 1 : -1;           // exit the way it was dragged
    fromEl.style.transition = 'transform .26s cubic-bezier(.2,.7,.3,1)';
    fromEl.style.transform = `translateX(${side * w}px)`;
    if (toEl) {
      toEl.style.transition = 'transform .26s cubic-bezier(.2,.7,.3,1)';
      toEl.style.transform = 'translateX(0)';
    }
    setTimeout(() => cleanup(d), 290);
  };

  const onDown = e => {
    if (drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest(IGNORE) || overlayOpen()) return;
    const rv = document.getElementById('readerView');
    if (rv && !rv.hidden) return;          // inside a book: the pages are its own
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0,
      t0: e.timeStamp, tLast: e.timeStamp, decided: false, j: -2,
      fromEl: null, toEl: null };
  };

  const onMove = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.decided) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      drag.decided = true;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) { drag = null; return; } // a scroll
      /* A mouse drag that began on text has already begun the browser's own
         selection — a few pixels of highlight that would otherwise smear
         across the staged pages and survive the swipe. The gesture owns the
         pointer from here: clear what the first pixels caught; the swiping
         class's user-select:none keeps the rest off. Touch never selects by
         dragging, so its path is untouched. */
      if (e.pointerType === 'mouse') getSelection()?.removeAllRanges();
      drag.j = neighbor(dx);
      if (reduced) return;                 // threshold landing, no live follow
      enter();
      if (!drag) return;
      try { document.documentElement.setPointerCapture(e.pointerId); } catch (err) {}
    }
    drag.dx = dx;
    drag.tLast = e.timeStamp;
    if (drag && drag.fromEl) paint();
  };

  const onUp = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dx, t0, tLast } = drag;
    const j = Math.abs(dx) >= 45 ? neighbor(dx) : -1;
    /* A quarter of the screen is a thumb's reach on a phone — and an absurd
       arm's length on a desktop window, where it would make a normal mouse
       drag spring back every time. The cap keeps the landing within a wrist's
       movement there; on phones the cap never wins and nothing changes. */
    const far = Math.abs(dx) > Math.min(window.innerWidth * 0.25, 150);
    const flick = Math.abs(dx) > 60 && tLast - t0 < 240;
    settle(j >= 0 && j === drag.j && (far || flick));
  };

  const onCancel = e => {
    if (drag && e.pointerId === drag.id) settle(false);
  };

  /* A native drag-and-drop — an image, a highlighted run of text — would
     answer the pointer with a pointercancel and kill the swipe mid-air, and
     it has no business inside the notebook pages anyway. While a swipe holds
     the pointer the native drag is refused and the swipe springs back
     cleanly; everywhere else the browser's drag stays untouched. */
  document.addEventListener('dragstart', e => {
    if (drag) { e.preventDefault(); settle(false); }
  });

  /* And a drag that loses the window — alt-tab, a system gesture — must never
     hang the module with a drag that has no end: the spring-back runs and the
     next drag starts from nothing. */
  addEventListener('blur', () => { if (drag) settle(false); });

  document.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
}

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
safe('تنظیمات', initSettings);
safe('تولد', initBirthday);
safe('هشدار ذخیره‌سازی', initStorageWarning);
safe('آمار', initStats);
safe('بینش‌ها', initInsights);
safe('کارت آمار', initShareCard);
/* After the profile, because the card this page is entered from is the one it
   paints (js/profile.js calls the same refresh). */
safe('نشان‌ها', initAchievements);
safe('امروز', initToday);
safe('برنامه‌ریزی هفتگی', initPlanner);
safe('مهلت', initDuePicker);
/* Due-date watcher: silently no-ops until the user grants notification
   permission from a task card. */
if (notificationsSupported()) safe('یادآوری‌ها', () => initNotifications(() => state.tasks));

const dl = $('#dateLine');
if (dl) dl.textContent = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

safe('نام', applyName);
/* Painted at boot as well as on entry, because the page can be the one the URL
   hash names — and then neither of the two events above has happened yet. */
safe('رندر تنظیمات', renderSettings);
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