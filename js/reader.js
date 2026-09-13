/* ═══ PDF Reader — Daftarche reading workspace ═══
   Two rendering engines:
   1. Custom pdf.js renderer (default): canvas + text layer. The text layer is
      the source of truth for selection → highlights. Falls back gracefully
      (scanned PDFs simply get no text layer; manual page completion still works).
   2. Browser built-in viewer (iframe): used only when it is chosen for a book
      or when the internal renderer fails; that is remembered for the session
      only, so a book recovers on the next visit. No text layer there, hence no
      selection, highlights or notes.
   pdf.js is only used for rendering/counting, never for reading state.
   Reading state (currentPage, completedPages, goal, highlights, notes) lives
   in the book meta record — fully separated from UI. */
import { $, faNum, faDigits, dayKey } from './utils.js';
import { getBook, updateBook, getBookBlob, renderShelf, bookDone, bookPct, bookComplete } from './library.js';
import { recordDay } from './week.js';
import { jingoolMarkup } from './jingool.js';
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';

const PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168';
pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/build/pdf.worker.min.mjs`;

/* Persian/Arabic/CJK documents often reference predefined CMaps and standard
   font programs that ship with pdf.js instead of inside the file. When those
   URLs are missing pdf.js degrades silently and glyphs can be substituted or
   mapped to the wrong code — visible as jumbled or wrongly spaced text. */
const PDF_ASSETS = {
  cMapUrl: `${PDFJS_BASE}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${PDFJS_BASE}/standard_fonts/`,
};

const HL_COLORS = { yellow: 'rgba(246,196,69,.4)', green: 'rgba(159,206,127,.4)', blue: 'rgba(143,183,217,.4)', pink: 'rgba(231,154,176,.4)' };

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let curBook = null, curPage = 1, zoom = 1, pageScale = 1;
let pdfDoc = null, renderTask = null, textLayerTask = null;
let pdfObjectUrl = null;
let mode = 0;
const MODES = ['mode-light', 'mode-sepia', 'mode-dark'];
let timer = { running: false, start: 0, interval: null };
let resizeTimer = null;
let textLayerBroken = false;
/* Set when a draw was inconclusive because the tab was hidden (background tabs
   throttle the render pipeline). The draw is retried once the tab is visible
   instead of degrading the book to the browser viewer. */
let retryOnVisible = false;
let engine = 'internal';   /* 'internal' = our pdf.js renderer, 'browser' = viewer iframe */
let openSeq = 0;           /* invalidates an in-flight open when another book opens */
let hintTimer = null;
let hintShown = false;
/* Books whose internal render already failed here. Held in memory only, so the
   internal engine is retried on the next visit and no book stays degraded. */
const sessionFallback = new Set();

const withTimeout = (p, ms) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error('render-timeout')), ms))
]);

/* A timed-out draw can still be attached to the canvas, and pdf.js tracks that
   attachment per canvas. The previous task therefore has to finish — or be
   cancelled and allowed to settle — before the canvas is drawn on again. The
   wait is bounded: a task stuck on a throttled worker must not block the next
   attempt forever. */
async function settleRenderTask() {
  const task = renderTask;
  renderTask = null;
  if (!task) return;
  try { task.cancel(); } catch (e) {}
  await Promise.race([
    Promise.resolve(task.promise).catch(() => {}),
    new Promise(r => setTimeout(r, 1500)),
  ]);
}

/* Budget for one page draw. The first page of a document pays for worker
   start-up and font/CMap fetches, which can take many seconds on a slow
   device — a too-tight budget is what pushes books into the browser viewer. */
const CANVAS_BUDGET = 12000;
const CANVAS_BUDGET_LAST = 20000;
const TEXT_BUDGET = 12000;
const TEXT_BUDGET_LAST = 24000;
/* Backstop for one complete opening draw. It must sit above the sum of the step
   budgets above, so the per-step decisions — which know whether it was the
   canvas or only the text layer that struggled — always decide first. */
const OPEN_BACKSTOP = 90000;

export function initReader() {
  window.addEventListener('open-book', e => openReader(e.detail));
  $('#readerBack').onclick = closeReader;
  $('#prevPage').onclick = () => gotoPage(curPage - 1);
  $('#nextPage').onclick = () => gotoPage(curPage + 1);
  $('#zoomIn').onclick = () => { zoom = Math.min(3, +(zoom * 1.2).toFixed(2)); renderPage(); };
  $('#zoomOut').onclick = () => { zoom = Math.max(.5, +(zoom / 1.2).toFixed(2)); renderPage(); };
  $('#pageRange').addEventListener('input', e => gotoPage(parseInt(e.target.value)));
  $('#readerMode').onclick = () => { mode = (mode + 1) % 3; applyMode(); };
  $('#markReadBtn').onclick = togglePageRead;
  $('#readerEngine').onclick = () => switchEngine();
  $('#fallbackRetry').onclick = () => switchEngine('internal');
  $('#readerHint').onclick = () => { $('#readerHint').hidden = true; };
  /* The goal bar belongs to the book that is open, so it has to follow that
     book's goal: otherwise it keeps showing an outdated goal until the next
     page turn. */
  window.addEventListener('goal-changed', () => {
    if (curBook && !$('#readerView').hidden) updateGoalBar();
  });

  /* Highlight bar actions */
  $('#hlBar').addEventListener('click', e => {
    const dot = e.target.closest('.hl-dot');
    if (dot) createHighlight(dot.dataset.color);
    if (e.target.closest('#hlNoteBtn')) { pendingNoteHl = lastSelectionRects; openNoteForCurrentPage(); }
  });

  document.addEventListener('keydown', e => {
    if ($('#readerView').hidden) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') gotoPage(curPage + 1);
    if (e.key === 'ArrowLeft') gotoPage(curPage - 1);
    if (e.key === 'PageDown') { gotoPage(curPage + 1); e.preventDefault(); }
    if (e.key === 'PageUp') { gotoPage(curPage - 1); e.preventDefault(); }
    if (e.key === 'Escape') { $('#hlBar').hidden = true; $('#notesSheet').hidden = true; }
  });
  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('mousedown', e => {
    if (!$('#hlBar').hidden && !e.target.closest('#hlBar')) $('#hlBar').hidden = true;
  });

  window.addEventListener('resize', () => {
    if ($('#readerView').hidden || !pdfDoc || engine === 'browser') return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderPage(true), 250);
  });

  /* A draw that only failed because the tab was hidden gets a second chance as
     soon as the tab is shown — the reader must not fall back for that. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !retryOnVisible) return;
    if ($('#readerView').hidden || !pdfDoc || engine === 'browser') return;
    retryOnVisible = false;
    renderPage();
    updatePageUI();
  });

  // Close the reader when navigating away from the library
  $('#bottomNav').addEventListener('click', e => {
    const tab = e.target.closest('.nav-tab');
    if (tab && tab.dataset.page !== 'library' && !$('#readerView').hidden) closeReader();
  });

  /* Page note */
  $('#addNoteBtn').onclick = () => { pendingNoteHl = null; openNoteForCurrentPage(); };
  $('#noteSave').onclick = saveNote;
  $('#noteClose').onclick = () => { $('#noteOverlay').hidden = true; };

  /* Notes panel */
  $('#readerNotes').onclick = () => { buildNotes(); $('#notesSheet').hidden = false; };
  $('#notesClose').onclick = () => { $('#notesSheet').hidden = true; };
  $('#notesExport').onclick = exportNotes;

  /* Timer */
  $('#readTimerBtn').onclick = toggleTimer;
}

function applyMode() {
  const stage = $('#readerStage');
  MODES.forEach(m => stage.classList.remove(m));
  stage.classList.add(MODES[mode]);
  $('#readerMode').title = ['حالت روشن', 'حالت سپیا', 'حالت شب'][mode];
}

/* ── Open/Close ── */

/* Tear down whatever the previous document left behind: pending renders, the
   document itself, its object URL and the layers attached to it. Every open
   starts from a clean engine, so two books can never share state. */
function teardownEngine() {
  if (renderTask) { try { renderTask.cancel(); } catch (e) {} renderTask = null; }
  if (textLayerTask) { try { textLayerTask.cancel(); } catch (e) {} textLayerTask = null; }
  if (pdfDoc) { try { pdfDoc.destroy(); } catch (e) {} pdfDoc = null; }
  if (pdfObjectUrl) { URL.revokeObjectURL(pdfObjectUrl); pdfObjectUrl = null; }
  $('#pdfFrame').removeAttribute('src');
  $('#pdfCanvas').hidden = false;
  $('#textLayer').hidden = false;
  $('#highlightLayer').hidden = false;
  $('#pdfFallback').hidden = true;
  retryOnVisible = false;
  $('#textLayer').innerHTML = '';
  $('#highlightLayer').innerHTML = '';
  $('#hlBar').hidden = true;
}

/* Flip between our own renderer and the browser viewer for the open book. */
function switchEngine(to) {
  if (!curBook) return;
  const target = to || (engine === 'browser' ? 'internal' : 'browser');
  updateBook(curBook.id, { viewer: target, fallback: false });
  curBook.viewer = target;
  if (target === 'internal') sessionFallback.delete(curBook.id);
  openReader(curBook.id, { forceInternal: target === 'internal' });
}

/* One-time, session-scoped hint that highlighting starts with selecting text. */
function maybeShowHighlightHint() {
  if (hintShown || engine !== 'internal') return;
  if (!$('#textLayer').querySelector('span')) return;   /* scanned page: nothing to select */
  hintShown = true;
  const hint = $('#readerHint');
  hint.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { hint.hidden = true; }, 7000);
}

async function openReader(id, opts = {}) {
  const seq = ++openSeq;                 /* supersede any in-flight open */
  const book = getBook(id); if (!book) return;
  curBook = book;
  /* Bind the page before the first draw: renderPage() reads curPage, so
     without this a freshly opened book would first paint the previous book's
     page number. Clamped again once the page count is known. */
  curPage = Math.max(1, book.lastPage || 1);
  teardownEngine();
  textLayerBroken = false;
  $('#shelfView').hidden = true;
  $('#readerView').hidden = false;
  $('#readerHint').hidden = true;
  $('#readerTitle').textContent = book.title;
  /* Reset the page chrome to this book before the first draw, so the previous
     book's page numbers, percentage and goal can't linger while it loads. */
  updatePageUI();
  updateGoalBar();
  const thumb = $('#readerThumb');
  if (book.cover) { thumb.src = book.cover; thumb.hidden = false; } else thumb.hidden = true;
  $('#readerLoading').hidden = false;

  const blob = await getBookBlob(id);
  if (seq !== openSeq) return;                       /* another book took over */
  if (!blob) { alert('فایل کتاب پیدا نشد!'); closeReader(); return; }
  pdfObjectUrl = URL.createObjectURL(blob);

  /* Our own renderer is the default. The browser viewer is used only when it
     was chosen deliberately for this book, or after the internal renderer
     already failed here in this session — never written to the book, so the
     internal engine gets a fresh chance next time. */
  const browserViewer = book.viewer === 'browser' || (sessionFallback.has(id) && !opts.forceInternal);

  let ok = false;
  let drawn = false;
  if (!browserViewer) {
    try {
      const data = new Uint8Array(await blob.arrayBuffer());
      if (seq !== openSeq) return;
      const doc = await pdfjsLib.getDocument({ data, ...PDF_ASSETS }).promise;
      if (seq !== openSeq) { doc.destroy(); return; }
      pdfDoc = doc;
      ok = true;
    } catch (err) {
      console.warn('رندر اختصاصی ممکن نشد؛ نمایشگر مرورگر استفاده می‌شود:', err);
    }
  }
  if (ok) {
    let status = null;
    try {
      /* Backstop only: the per-step budgets inside renderPage (canvas, then
         text layer) are what bound the work. */
      status = await withTimeout(renderPage(), OPEN_BACKSTOP);
      drawn = true;
    } catch (err) {
      /* Same rule as a failed draw: a backstop timeout in a throttled hidden
         tab is not evidence that the file can't be rendered. */
      console.warn('رندر صفحه کامل نشد:', err);
      if (document.visibilityState === 'hidden') retryOnVisible = true;
      else ok = false;
    }
    if (seq !== openSeq) return;
    /* Only a canvas that truly failed switches the engine. A slow or
       unbuildable text layer must never do that, otherwise a heavy RTL page
       would lose its selection, highlights and notes. */
    if (status && status.canvasOk === false) {
      /* Hidden tabs throttle the render pipeline, so a timeout there says
         nothing about the file. Stay on the internal engine and draw again
         when the tab is visible. */
      if (document.visibilityState === 'hidden') retryOnVisible = true;
      else ok = false;
    }
  }
  if (!ok) {
    engine = 'browser';
    sessionFallback.add(id);              /* remembered for this session only */
    if (pdfDoc) { try { pdfDoc.destroy(); } catch (e) {} pdfDoc = null; }
    if (!book.numPages) {
      try {
        const data = await blob.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data, ...PDF_ASSETS }).promise;
        if (seq !== openSeq) { doc.destroy(); return; }
        updateBook(id, { numPages: doc.numPages });
        book.numPages = doc.numPages;
        doc.destroy();
      } catch (e) { console.warn('گرفتن تعداد صفحه‌ها ممکن نشد:', e); }
    }
    engageFallbackUI(book.viewer === 'browser' ? 'manual' : 'auto');
  } else {
    engine = 'internal';
    sessionFallback.delete(id);
    if (!book.numPages || book.numPages !== pdfDoc.numPages) updateBook(id, { numPages: pdfDoc.numPages });
    book.numPages = pdfDoc.numPages;
    /* Older builds could pin a book to the iframe viewer for good. Only a
       record that actually carries that stale flag is rewritten — opening a
       book must not touch records that never had one. */
    if (book.fallback || (book.viewer && book.viewer !== 'internal')) {
      updateBook(id, { viewer: 'internal', fallback: false });
    }
  }

  $('#pageRange').max = book.numPages || 999999;
  curPage = Math.min(Math.max(1, curPage), book.numPages || curPage);
  applyMode();
  zoom = 1;
  if (engine === 'browser') {
    $('#pdfFrame').src = `${pdfObjectUrl}#page=${curPage}&zoom=100`;
  } else {
    /* A draw that already finished must not be repeated — a second full render
       costs the same again. Only a first draw that never completed is retried,
       and only when the tab can actually paint; a throttled background tab is
       handled by the visibility handler instead. */
    if (!drawn && document.visibilityState === 'visible') await renderPage();
    if (seq !== openSeq) return;
    maybeShowHighlightHint();
  }
  if (seq !== openSeq) return;
  updatePageUI();
  updateGoalBar();
  $('#readerLoading').hidden = true;
}

/* Switch the visible stage to the browser-viewer iframe */
function engageFallbackUI(reason) {
  $('#pdfCanvas').hidden = true;
  $('#textLayer').hidden = true;
  $('#highlightLayer').hidden = true;
  $('#pdfFallback').hidden = false;
  $('#fallbackText').textContent = reason === 'manual'
    ? 'نمایشگر مرورگر فعال است؛ متن، هایلایت و یادداشت در دسترس نیست.'
    : 'این فایل با نمایشگر داخلی رندر نشد؛ متن، هایلایت و یادداشت در دسترس نیست.';
}

function closeReader() {
  openSeq++;
  teardownEngine();
  if (timer.running) stopTimerSession();
  $('#readerView').hidden = true;
  $('#shelfView').hidden = false;
  $('#notesSheet').hidden = true;
  $('#donePop').hidden = true;
  $('#readerHint').hidden = true;
  $('#readerLoading').hidden = true;
  renderShelf();
}

/* ── Custom page rendering (canvas + text layer) ── */

/* A book can be opened before its stage has been laid out (tab restored in the
   background, container not yet measured). Reading the box at that moment gives
   a zero size, which clamps the page to the minimum scale. Wait briefly for the
   layout, then fall back to the window box so a page always gets a usable size. */
async function stageBox() {
  const stage = $('#readerStage');
  /* A hidden tab never computes layout, and its timers are throttled — waiting
     there would only delay the first page, so use the window box at once. */
  if (document.visibilityState === 'visible') {
    for (let i = 0; i < 8 && stage.clientWidth < 40; i++) await new Promise(r => setTimeout(r, 40));
  }
  return {
    w: stage.clientWidth || window.innerWidth || 360,
    h: stage.clientHeight || window.innerHeight || 640,
  };
}

async function renderPage(keepScroll) {
  if (!pdfDoc || !curBook) return { canvasOk: true, cancelled: true };
  const doc = pdfDoc, seq = openSeq;
  if (renderTask) { try { renderTask.cancel(); } catch (e) {} }
  if (textLayerTask) { try { textLayerTask.cancel(); } catch (e) {} }
  const page = await doc.getPage(curPage);
  /* Another book took over while we were fetching this page. */
  if (doc !== pdfDoc || seq !== openSeq) return { canvasOk: true, cancelled: true };
  const wrap = $('#pageWrap');
  const stage = $('#readerStage');
  const box = await stageBox();
  /* Another book took over, or the reader closed, while waiting for layout. */
  if (doc !== pdfDoc || seq !== openSeq) return { canvasOk: true, cancelled: true };
  const availW = box.w - 28;
  const availH = box.h - 28;
  const base = page.getViewport({ scale: 1 });
  const fit = Math.min(availW / base.width, availH / base.height);
  const scale = Math.max(.2, fit * zoom);
  const viewport = page.getViewport({ scale });

  pageScale = scale;
  const canvas = $('#pdfCanvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = viewport.width + 'px';
  canvas.style.height = viewport.height + 'px';
  wrap.style.width = viewport.width + 'px';
  wrap.style.height = viewport.height + 'px';

  const ctx = canvas.getContext('2d');
  /* Two attempts: a cold worker can spend longer than one budget on the very
     first page and still be perfectly able to draw it right after. */
  let canvasOk = false;
  const budgets = [CANVAS_BUDGET, CANVAS_BUDGET_LAST];
  for (let attempt = 0; attempt < budgets.length && !canvasOk; attempt++) {
    /* The previous attempt has to be settled before the canvas is reused,
       otherwise pdf.js refuses the second render, both attempts are spent on
       that error and a perfectly renderable page is written off. */
    await settleRenderTask();
    try {
      renderTask = page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
      await withTimeout(renderTask.promise, budgets[attempt]);
      canvasOk = true;
    } catch (e) {
      /* A cancelled render was superseded by a newer one, which is not a failure. */
      if (e?.name === 'RenderingCancelledException') { canvasOk = true; break; }
      console.warn(e);
    }
  }
  await settleRenderTask();
  if (doc !== pdfDoc || seq !== openSeq) return { canvasOk: true, cancelled: true };
  if (!canvasOk) {
    /* Don't leave the previous page's invisible runs behind: stale text would
       still be selectable and would mis-map highlights. */
    $('#textLayer').innerHTML = '';
    paintHighlights();
    return { canvasOk: false };
  }

  /* The page is readable now; the text layer only adds selection on top of it,
     so it must not keep the reader hidden behind the loading veil. The goal bar
     is stored state too, so it is revealed together with the page. */
  if (!$('#readerLoading').hidden) {
    updatePageUI();
    updateGoalBar();
    $('#readerLoading').hidden = true;
  }

  /* Text layer — source of truth for selection.
     pdf.js lays out every run with `calc(var(--scale-factor) * Npx)`, so the
     scale factor has to be published on the container before the layer is
     built. Without it those declarations are invalid and the transparent runs
     stop matching the canvas — selection and highlights then sit on the wrong
     glyphs (very visible with RTL/Persian lines).
     If the environment can't build it (scanned page, stalled layer), skip
     further attempts instead of paying the timeout on every page. */
  const tl = $('#textLayer');
  tl.innerHTML = '';
  tl.style.setProperty('--scale-factor', String(scale));
  tl.style.width = viewport.width + 'px';
  tl.style.height = viewport.height + 'px';
  /* Selection is the only way to a highlight, so a heavy RTL page (thousands
     of runs) gets a second, longer attempt before the page is written off. */
  if (!textLayerBroken) {
    const textBudgets = [TEXT_BUDGET, TEXT_BUDGET_LAST];
    for (let attempt = 0; attempt < textBudgets.length; attempt++) {
      try {
        /* disableNormalization keeps the document's own characters (as upstream's
           text layer does) instead of letting the pipeline rewrite RTL runs. */
        const textContent = await page.getTextContent({ disableNormalization: true });
        if (doc !== pdfDoc || seq !== openSeq) break;
        textLayerTask = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: tl,
          viewport,
        });
        await withTimeout(textLayerTask.render(), textBudgets[attempt]);
        break;
      } catch (e) {
        if (doc !== pdfDoc || seq !== openSeq) break;
        console.warn(e);
        /* The timed-out layer may still hold the container or keep writing to
           it; cancel it and start the next attempt from an empty layer so runs
           can't be duplicated (duplicates would double up selections). */
        try { textLayerTask.cancel(); } catch (err) {}
        textLayerTask = null;
        tl.innerHTML = '';
        if (attempt === textBudgets.length - 1) textLayerBroken = true;
      }
    }
  }

  paintHighlights();
  if (!keepScroll) stage.scrollTop = 0;
  return { canvasOk: true };
}

/* ── Page UI + progress ── */
function updatePageUI() {
  const total = curBook.numPages;
  $('#pageLabel').textContent = total ? `${faNum(curPage)} / ${faNum(total)}` : faNum(curPage);
  $('#pageRange').value = curPage;
  if (total) {
    const done = bookDone(curBook).size;
    $('#readerPct').textContent = `${faNum(Math.round((done / total) * 100))}٪ خونده شده`;
  } else {
    $('#readerPct').textContent = '';
  }
  updateMarkBtn();
}

/* ── Navigation + Resume ── */
function gotoPage(n) {
  const total = curBook.numPages || Infinity;
  n = Math.max(1, Math.min(total, n));
  if (n === curPage && engine === 'internal') return;
  /* A selection made on the previous page must not be turned into a highlight
     of this one: the rects are measured in that page's coordinate space. */
  clearSelectionState();
  /* A text layer that timed out on one page says nothing about the next one, and
     selection is the only way to a highlight — so every page gets a fresh try.
     The flag only stops repeat attempts on the page that already failed. */
  textLayerBroken = false;
  const forward = n > curPage;
  curPage = n;
  updateBook(curBook.id, { lastPage: n, lastReadAt: Date.now() });
  curBook.lastPage = n;
  if (forward) addToday('pages', 1);
  if (engine === 'browser') {
    $('#pdfFrame').src = `${pdfObjectUrl}#page=${n}&zoom=${Math.round(zoom * 100)}`;
  } else {
    renderPage();
  }
  updatePageUI();
  updateGoalBar();
}

/* ── Page completion ── */
function updateMarkBtn() {
  const btn = $('#markReadBtn');
  const read = bookDone(curBook).has(curPage);
  btn.classList.toggle('is-read', read);
  btn.textContent = read ? '✓ خوانده شد' : 'صفحه را خواندم';
}

function togglePageRead() {
  const done = new Set(curBook.completedPages || []);
  if (done.has(curPage)) done.delete(curPage);
  else done.add(curPage);
  curBook.completedPages = [...done];
  updateBook(curBook.id, { completedPages: curBook.completedPages, lastReadAt: Date.now() });
  updatePageUI();
  updateGoalBar();
  if (bookComplete(curBook)) celebrateCompletion();
}

/* ── Goal bar ── */
function updateGoalBar() {
  const bar = $('#goalBar');
  const st = curBook.stats?.[dayKey(new Date())] || { pages: 0, minutes: 0 };
  /* Only a positive count is a page goal. A record that carries anything else
     (an older negative or non-numeric value) is shown as having no page goal
     instead of a progress track measured against a nonsensical target. */
  const rawG = Number(curBook.goal?.pagesPerDay);
  const g = Number.isFinite(rawG) && rawG > 0 ? rawG : null;
  const goalName = curBook.goal?.text ? `<span class="goal-name">🎯 ${esc(curBook.goal.text)}</span>` : '';
  bar.innerHTML = (g || goalName)
    ? `<div class="goal-line">${goalName}<span>${g ? `امروز: ${faNum(st.pages)} از ${faNum(g)} صفحه · ${faNum(st.minutes)} دقیقه` : ''}</span><button id="goalEdit">تغییر هدف</button></div>
       ${g ? '<div class="goal-track"><i style="width:' + Math.min(100, Math.round((st.pages / g) * 100)) + '%"></i></div>' : ''}`
    : `<div class="goal-line"><span>هدفی برای این کتاب تنظیم نشده</span><button id="goalEdit">تنظیم هدف</button></div>`;
  $('#goalEdit').onclick = () => window.dispatchEvent(new CustomEvent('open-goal', { detail: curBook.id }));
}

/* ── Book completion reaction (Jingool, small and brief) ── */
let donePopTimer = null;
function celebrateCompletion() {
  $('#donePopChar').innerHTML = jingoolMarkup('celebrating');
  $('#donePop').hidden = false;
  clearTimeout(donePopTimer);
  donePopTimer = setTimeout(() => { $('#donePop').hidden = true; }, 3200);
}

/* ── Highlights ── */
let lastSelectionRects = null;
let pendingNoteHl = null;

/* Scroll offset of the stage expressed in its own coordinate system.
   `scrollLeft` is negative inside an RTL scroll container, which would move
   the toolbar by twice the horizontal overflow; deriving the offset from the
   page wrapper's box is direction independent. */
function stageScroll() {
  const st = $('#readerStage').getBoundingClientRect();
  const wrap = $('#pageWrap');
  const wr = wrap.getBoundingClientRect();
  return { x: st.left - wr.left + wrap.offsetLeft, y: st.top - wr.top + wrap.offsetTop };
}

function onSelectionChange() {
  if ($('#readerView').hidden || engine === 'browser') return;
  const sel = window.getSelection();
  const bar = $('#hlBar');
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const tl = $('#textLayer');
  if (!tl.contains(range.commonAncestorContainer) || !sel.toString().trim()) { bar.hidden = true; return; }
  const rects = [...range.getClientRects()].filter(r => r.width > 1 && r.height > 1);
  if (!rects.length) { bar.hidden = true; return; }
  lastSelectionRects = { text: sel.toString(), rects };
  const stage = $('#readerStage');
  const stRect = stage.getBoundingClientRect();
  const first = rects[0];
  const sc = stageScroll();
  bar.hidden = false;
  bar.style.left = Math.max(8, Math.min(stage.clientWidth - bar.offsetWidth - 8, first.left - stRect.left + sc.x)) + 'px';
  bar.style.top = Math.max(8, Math.max(8, first.top - stRect.top + sc.y - bar.offsetHeight - 8)) + 'px';
}

/* Build a highlight record from a captured selection. `scale` records the
   render scale these rects were measured at, so the mark can be re-placed when
   the page is zoomed or the window resized. */
function highlightFromSelection(color, selection) {
  const wrapRect = $('#pageWrap').getBoundingClientRect();
  const rects = selection.rects.map(r => ({
    x: r.left - wrapRect.left,
    y: r.top - wrapRect.top,
    w: r.width, h: r.height,
  }));
  return { id: Date.now() + '', page: curPage, text: selection.text, color, rects, note: '', createdAt: Date.now(), scale: pageScale };
}

/* Drop the captured selection geometry and hide the contextual toolbar. */
function clearSelectionState() {
  lastSelectionRects = null;
  $('#hlBar').hidden = true;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
}

function createHighlight(color) {
  if (!lastSelectionRects) return;
  curBook.highlights = curBook.highlights || [];
  curBook.highlights.push(highlightFromSelection(color, lastSelectionRects));
  updateBook(curBook.id, { highlights: curBook.highlights });
  paintHighlights();
  clearSelectionState();
}

function paintHighlights() {
  const layer = $('#highlightLayer');
  layer.innerHTML = '';
  if (!curBook) return;
  (curBook.highlights || []).filter(h => h.page === curPage).forEach(h => {
    /* Records saved before the scale was captured keep their original pixels. */
    const f = h.scale ? pageScale / h.scale : 1;
    (h.rects || []).forEach(r => {
      const d = document.createElement('i');
      d.style.left = +(r.x * f).toFixed(2) + 'px';
      d.style.top = +(r.y * f).toFixed(2) + 'px';
      d.style.width = +(r.w * f).toFixed(2) + 'px';
      d.style.height = +(r.h * f).toFixed(2) + 'px';
      d.style.background = HL_COLORS[h.color] || HL_COLORS.yellow;
      if (h.note) d.classList.add('has-note');
      d.title = h.note ? 'یادداشت: ' + h.note : '';
      layer.appendChild(d);
    });
  });
}

/* ── Notes ── */
function saveNote() {
  const text = $('#noteInput').value.trim();
  if (text) {
    if (pendingNoteHl) {
      /* Anchor the note to the highlight of the selection it was written for.
         If that text was never highlighted yet, create the highlight now so a
         note can't be silently orphaned. */
      curBook.highlights = curBook.highlights || [];
      const same = curBook.highlights.filter(h => h.page === curPage && h.text === pendingNoteHl.text);
      const hl = same.find(h => !h.note) || same[0] || null;
      if (hl) {
        hl.note = text;
      } else {
        const created = highlightFromSelection('yellow', pendingNoteHl);
        created.note = text;
        curBook.highlights.push(created);
      }
      updateBook(curBook.id, { highlights: curBook.highlights });
      paintHighlights();
    } else {
      curBook.notes = curBook.notes || [];
      curBook.notes.push({ id: Date.now() + '', page: curPage, text, createdAt: Date.now() });
      updateBook(curBook.id, { notes: curBook.notes });
    }
  }
  pendingNoteHl = null;
  $('#noteOverlay').hidden = true;
}

function openNoteForCurrentPage() {
  $('#noteForText').textContent = pendingNoteHl
    ? `یادداشت برای هایلایت صفحهٔ ${faNum(curPage)}`
    : `یادداشت صفحهٔ ${faNum(curPage)}`;
  $('#noteInput').value = '';
  $('#noteOverlay').hidden = false;
  $('#hlBar').hidden = true;
  setTimeout(() => $('#noteInput').focus(), 200);
}

/* ── Notes Panel (new notes + highlights) ── */
function allNoteItems() {
  const hls = (curBook.highlights || []).map(h => ({
    id: h.id, page: h.page, text: h.text, note: h.note, color: h.color, source: 'highlights',
  }));
  const fresh = (curBook.notes || []).map(n => ({
    id: n.id, page: n.page, text: n.text, note: '', color: null, source: 'notes',
  }));
  return [...hls, ...fresh].sort((a, b) => a.page - b.page);
}

function buildNotes() {
  const list = $('#notesList'); list.innerHTML = '';
  const items = allNoteItems();
  if (!items.length) { list.innerHTML = '<p class="notes-empty">هنوز یادداشتی نداری؛ موقع خوندن متن رو انتخاب کن یا از دکمهٔ 📝 استفاده کن!</p>'; return; }
  items.forEach(it => {
    const el = document.createElement('div');
    el.className = 'note-item';
    el.innerHTML = `
      ${it.color ? `<i class="dot" style="background:${HL_COLORS[it.color] || it.color}"></i>` : ''}
      <div class="note-body">
        <span class="note-text">${esc(it.text)}</span>
        ${it.note ? `<span class="note-note">📝 ${esc(it.note)}</span>` : ''}
      </div>
      <span class="note-page">ص ${faNum(it.page)}</span>
      <button class="note-del" aria-label="حذف">✕</button>`;
    el.addEventListener('click', e => {
      if (e.target.closest('.note-del')) {
        if (it.source === 'highlights') curBook.highlights = (curBook.highlights || []).filter(x => x.id !== it.id);
        else curBook.notes = (curBook.notes || []).filter(x => x.id !== it.id);
        updateBook(curBook.id, { highlights: curBook.highlights, notes: curBook.notes });
        paintHighlights();
        buildNotes();
        return;
      }
      $('#notesSheet').hidden = true;
      gotoPage(it.page);
    });
    list.appendChild(el);
  });
}

function exportNotes() {
  const items = allNoteItems();
  let md = `# ${curBook.title}\n\n`;
  items.forEach(it => { md += `- صفحه ${it.page}: «${it.text}»${it.note ? ` — ${it.note}` : ''}\n`; });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
  a.download = curBook.title + '.md';
  a.click();
}

/* ── Reading Timer ── */
function toggleTimer() {
  const btn = $('#readTimerBtn');
  if (!timer.running) {
    timer.running = true; timer.start = Date.now();
    btn.classList.add('on');
    timer.interval = setInterval(() => {
      const s = Math.floor((Date.now() - timer.start) / 1000);
      btn.textContent = faDigits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    }, 1000);
  } else stopTimerSession();
}
function stopTimerSession() {
  const ms = Date.now() - timer.start;
  clearInterval(timer.interval);
  timer.running = false;
  const btn = $('#readTimerBtn');
  btn.classList.remove('on'); btn.textContent = '▶';
  const m = Math.max(1, Math.round(ms / 60000));
  addToday('minutes', m);
  recordDay();
  updateGoalBar();
}

/* ── Daily stats ── */
function addToday(kind, v) {
  const k = dayKey(new Date());
  curBook.stats = curBook.stats || {};
  curBook.stats[k] = curBook.stats[k] || { pages: 0, minutes: 0 };
  curBook.stats[k][kind] += v;
  updateBook(curBook.id, { stats: curBook.stats });
}
