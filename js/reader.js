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
import { STORAGE_KEYS } from './constants.js';
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
let bright = 1;            /* brightness factor applied on top of the page tint */
const MODES = ['mode-light', 'mode-sepia', 'mode-dark'];
let timer = { running: false, start: 0, interval: null };
let resizeTimer = null;
let textLayerBroken = false;
/* Freehand pen state. penActive mirrors the dock toggle; drawing happens on a
   dedicated canvas sized to the page wrap, so a stroke never touches the PDF
   render stack. Stroke colour follows the same four hues as the selection
   highlights, stored at the solid accent, not the translucent overlay. */
let penActive = false;
let strokeColor = 'yellow';
const STROKE_COLORS = { yellow: '#f6c445', green: '#9fce7f', blue: '#8fb7d9', pink: '#e79ab0' };
/* Three nib sizes, page-space px. Restored from localStorage so the reader
   comes back exactly as the reader left it. */
const PEN_WIDTHS = { thin: 8, medium: 14, thick: 22 };
let strokeWidth = PEN_WIDTHS.medium;
/* A stroke records its nib in page-space px, which is the same unit every
   repaint uses. Records written when the nib was kept by name still carry the
   name, and records from before the choice existed carry neither — both fall
   back to the default nib so their drawn look is preserved. */
const nibPx = w => typeof w === 'number' ? w : (PEN_WIDTHS[w] || PEN_WIDTHS.medium);
let drawCtx = null, drawStroke = null;
let penHintShown = false;
/* Eraser state. eraseActive turns every drag on the draw surface into a
   hit-test sweep; erasedStrokes parks removed records for the undo toast. */
let eraseActive = false;
let erasing = false, erasedStrokes = null;
const ERASER_RADIUS = 22;   /* page-space px, generous for fingers */
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
  $('#zoomIn').onclick = () => applyZoom(zoom * 1.2);
  $('#zoomOut').onclick = () => applyZoom(zoom / 1.2);
  $('#pageRange').addEventListener('input', e => gotoPage(parseInt(e.target.value)));
  $('#markReadBtn').onclick = togglePageRead;
  $('#readerEngine').onclick = () => switchEngine();

  /* Direct access: the floating zoom + tint stack. The tint button cycles
     light → sepia → night, exactly the order of the old mode button. */
  $('#dockMode').onclick = () => { mode = (mode + 1) % MODES.length; applyMode(); };

  /* Study dock: the two popovers are mutually exclusive and any interaction
     outside the dock closes them, so the page never keeps a stale menu open. */
  $('#dockPen').onclick = () => toggleDockPop('#penPop');
  $('#pagePill').onclick = () => toggleDockPop('#pagePop');
  $('#dockSettings').onclick = () => toggleSettings(true);
  $('#settingsClose').onclick = () => toggleSettings(false);
  $('#modeChips').addEventListener('click', e => {
    const chip = e.target.closest('.set-chip[data-mode]');
    if (!chip) return;
    mode = Number(chip.dataset.mode) % MODES.length;
    applyMode();
  });
  $('#readerBright').addEventListener('input', e => setBrightness(Number(e.target.value)));
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('.reader-dock')) toggleDockPop(null);
  }, true);

  /* Freehand pen: one pointer trail per gesture, committed as a highlight on
     release. Drawn on a dedicated canvas sized to the page wrap. */
  $('#hlTool').onclick = togglePen;
  $('#eraserTool').onclick = toggleEraser;
  $('#drawLayer').addEventListener('pointerdown', startPenStroke);
  window.addEventListener('pointermove', penMove);
  window.addEventListener('pointerup', penEnd);
  window.addEventListener('pointercancel', penEnd);
  /* Eraser drag lives on the same surface; pen/eraser states are exclusive so
     only one of the two handlers actually fires. */
  $('#drawLayer').addEventListener('pointerdown', startErase);
  window.addEventListener('pointermove', eraseMove);
  window.addEventListener('pointerup', endErase);
  window.addEventListener('pointercancel', endErase);
  $('#penWidths').addEventListener('click', e => {
    const chip = e.target.closest('.pen-width[data-width]');
    if (!chip) return;
    strokeWidth = PEN_WIDTHS[chip.dataset.width] || PEN_WIDTHS.medium;
    try { localStorage.setItem(STORAGE_KEYS.penWidth, chip.dataset.width); } catch (err) {}
    syncPenUI();
  });
  restorePenPrefs();

  /* Zen mode: the dock follows the reading gesture — out of the way while the
     page scrolls forward, back on a tap. Scroll work is coalesced into a single
     animation frame, so a fast flick never queues a layout per event. */
  $('#readerStage').addEventListener('scroll', onStageScroll, { passive: true });
  $('#readerStage').addEventListener('click', onStageTap);
  $('#fallbackRetry').onclick = () => switchEngine('internal');
  $('#readerHint').onclick = () => { $('#readerHint').hidden = true; };
  /* The goal bar belongs to the book that is open, so it has to follow that
     book's goal: otherwise it keeps showing an outdated goal until the next
     page turn. */
  window.addEventListener('goal-changed', () => {
    if (curBook && !$('#readerView').hidden) updateGoalBar();
  });

  /* Pen colour swatches live in the pen popover; picking one updates the
     active hue everywhere (dock + floating stack share the state). */
  $('#penPop').addEventListener('click', e => {
    const dot = e.target.closest('.hl-dot');
    if (dot) { strokeColor = dot.dataset.color; syncPenUI(); }
  });

  /* Text-selection toolbar: highlight the selected run or open a note for it. */
  $('#hlBar').addEventListener('click', e => {
    const dot = e.target.closest('.hl-dot');
    if (dot && lastSelectionRects) {
      curBook.highlights = curBook.highlights || [];
      curBook.highlights.push(highlightFromSelection(dot.dataset.color, lastSelectionRects));
      updateBook(curBook.id, { highlights: curBook.highlights });
      paintHighlights();
      clearSelectionState();
    }
    if (e.target.closest('#hlNoteBtn')) { pendingNoteHl = lastSelectionRects; openNoteForCurrentPage(); }
  });

  document.addEventListener('keydown', e => {
    if ($('#readerView').hidden) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') gotoPage(curPage + 1);
    if (e.key === 'ArrowLeft') gotoPage(curPage - 1);
    if (e.key === 'PageDown') { gotoPage(curPage + 1); e.preventDefault(); }
    if (e.key === 'PageUp') { gotoPage(curPage - 1); e.preventDefault(); }
    if (e.key === 'p' && !e.ctrlKey && !e.metaKey) { togglePen(); e.preventDefault(); }
    if (e.key === 'e' && !e.ctrlKey && !e.metaKey) { toggleEraser(); e.preventDefault(); }
    if (e.key === 'Escape') { $('#notesSheet').hidden = true; $('#hlBar').hidden = true; $('#eraseToast').hidden = true; toggleSettings(false); toggleDockPop(null); }
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

  /* Keyboard and rotation also resize the *visual* viewport without firing a
     window resize; without this hook the canvas keeps its stale dimensions and
     the page stays cropped after the notes field closes. Debounced exactly like
     the plain resize path. */
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', () => {
      if ($('#readerView').hidden || !pdfDoc || engine === 'browser') return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => renderPage(true), 250);
    });
  }

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
  $('#addNoteBtn').onclick = () => { toggleDockPop(null); pendingNoteHl = null; togglePen(false); openNoteForCurrentPage(); };
  $('#noteSave').onclick = saveNote;
  $('#noteClose').onclick = () => { $('#noteOverlay').hidden = true; };

  /* Notes panel */
  $('#readerNotes').onclick = () => { toggleDockPop(null); buildNotes(); $('#notesSheet').hidden = false; };
  $('#notesClose').onclick = () => { $('#notesSheet').hidden = true; };
  $('#notesExport').onclick = exportNotes;
  $('#eraseUndoBtn')?.addEventListener('click', performEraseUndo);

  /* Timer */
  $('#readTimerBtn').onclick = toggleTimer;
}

function applyMode() {
  const stage = $('#readerStage');
  MODES.forEach(m => stage.classList.remove(m));
  stage.classList.add(MODES[mode]);
  applyOptics();
  syncModeBtn();
  syncSettingsUI();
}

/* One dock-side button reflects the current tint; the glyph swaps with it. */
function syncModeBtn() {
  const btn = $('#dockMode');
  MODES.forEach(m => btn.classList.remove(m));
  btn.classList.add(MODES[mode]);
  btn.title = ['نور روز', 'سپیا', 'نور شب'][mode];
  btn.setAttribute('aria-label', btn.title);
}

/* ── Optical filters ──
   The tint and the manual brightness are separate: one decides the character
   of the page (day / sepia / night), the other how bright it renders. Both are
   published as CSS variables the render stack reads, so pdf.js is never asked
   to repaint for a colour change. */
function applyOptics() {
  const stage = $('#readerStage');
  stage.style.setProperty('--reader-bright', String(bright));
  stage.classList.toggle('has-fx', mode !== 0 || bright !== 1);
}

function setBrightness(percent) {
  bright = Math.min(1.4, Math.max(.6, percent / 100));
  applyOptics();
  syncSettingsUI();
}

function applyZoom(next) {
  const z = Math.min(3, Math.max(.5, +next.toFixed(2)));
  if (z === zoom) return;
  zoom = z;
  /* The fallback engine keeps its own zoom inside the frame URL; the internal
     renderer redraws. Zoom used to be a no-op on the fallback engine. */
  if (engine === 'browser') {
    $('#pdfFrame').src = `${pdfObjectUrl}#page=${curPage}&zoom=${Math.round(zoom * 100)}`;
  } else {
    renderPage();
  }
  syncSettingsUI();
}

/* ── Reading settings sheet ── */
function toggleSettings(on) {
  const open = typeof on === 'boolean' ? on : $('#settingsSheet').hidden;
  $('#settingsSheet').hidden = !open;
  $('#dockSettings').classList.toggle('on', open);
  $('#dockSettings').setAttribute('aria-expanded', String(open));
  if (open) toggleDockPop(null);
  syncSettingsUI();
}

function syncSettingsUI() {
  const b = Math.round(bright * 100);
  $('#readerBright').value = String(b);
  $('#brightVal').textContent = faNum(b) + '٪';
  $('#zoomVal').textContent = faNum(Math.round(zoom * 100)) + '٪';
  document.querySelectorAll('#modeChips .set-chip').forEach(c => {
    const on = Number(c.dataset.mode) === mode;
    c.classList.toggle('on', on);
    c.setAttribute('aria-pressed', String(on));
  });
}

/* ── Freehand pen ──
   A stroke is a page-space polyline, not a text selection: it works on scanned
   pages and anywhere the text layer does not reach. On release the polyline is
   stored as a highlight record with `free: true`, so it persists, survives
   zoom/resize re-placement, shows up in the notes panel and exports with the
   rest — with its drawn shape instead of a text quote. */
function togglePen(force) {
  const target = typeof force === 'boolean' ? force : !penActive;
  /* The pen and the eraser are exclusive: picking one retires the other. */
  if (target && eraseActive) toggleEraser(false);
  penActive = target;
  $('#hlTool').classList.toggle('on', penActive);
  $('#hlTool').setAttribute('aria-pressed', String(penActive));
  $('#hlTool').title = penActive ? 'قلم روشنه — برای خاموش کردن دوباره بزن' : 'قلم روشن/خاموش';
  $('#drawLayer').classList.toggle('pen-on', penActive);
  $('#textLayer').classList.toggle('pen-off', penActive);
  $('#dockPen').classList.toggle('on', penActive);
  if (penActive) {
    toggleDockPop(null);
    prepareDrawCanvas();
    if (!penHintShown && engine === 'internal') {
      penHintShown = true;
      const hint = $('#readerHint');
      hint.hidden = false;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { hint.hidden = true; }, 4500);
    }
  } else {
    /* Deselecting the pen also stops any in-flight stroke. */
    drawStroke = null;
    $('#readerHint').hidden = true;
  }
}

/* ── Eraser ──
   A drag over the page removes any hand-drawn stroke it touches (hit-test on
   the recorded polylines, scale-aware). The pen and the eraser are exclusive:
   turning one on turns the other off. Removed strokes stay recoverable through
   the undo toast until the reader closes. */
function toggleEraser(force) {
  const target = typeof force === 'boolean' ? force : !eraseActive;
  eraseActive = target;
  if (eraseActive) togglePen(false);
  $('#eraserTool').classList.toggle('on', eraseActive);
  $('#eraserTool').setAttribute('aria-pressed', String(eraseActive));
  $('#eraserTool').title = eraseActive ? 'پاک‌کن روشنه — برای خاموش کردن دوباره بزن' : 'پاک‌کن — روی خط بکش تا پاک شه';
  $('#drawLayer').classList.toggle('eraser-on', eraseActive);
  if (eraseActive) {
    toggleDockPop(null);
    prepareDrawCanvas();
  } else if (erasing) {
    endErase();
  }
}

/* Point-to-segment distance in *current page space* — the hit radius is
   expressed in what the user sees, so it works identically at every zoom. */
function strokeHit(h, px, py, f) {
  const pts = h.pts || [];
  if (pts.length < 2) {
    const dx = pts[0].x * f - px, dy = pts[0].y * f - py;
    return dx * dx + dy * dy <= ERASER_RADIUS * ERASER_RADIUS;
  }
  const r2 = ERASER_RADIUS * ERASER_RADIUS;
  let ax = pts[0].x * f, ay = pts[0].y * f;
  for (let i = 1; i < pts.length; i++) {
    const bx = pts[i].x * f, by = pts[i].y * f;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const ex = ax + t * dx - px, ey = ay + t * dy - py;
    if (ex * ex + ey * ey <= r2) return true;
    ax = bx; ay = by;
  }
  return false;
}

function startErase(e) {
  if (!eraseActive || penActive || e.button > 0) return;
  e.preventDefault();
  prepareDrawCanvas();
  toggleDockPop(null);
  erasing = true;
  erasedStrokes = [];
  eraseCursor(e);
  eraseAt(e);
  /* A synthetic/stale pointer must not break the gesture. */
  try { $('#drawLayer').setPointerCapture(e.pointerId); } catch (err) {}
}

function eraseAt(e) {
  if (!erasing || !eraseActive || penActive || !curBook) return;
  const p = penPos(e);
  const keep = [];
  let removedAny = false;
  (curBook.highlights || []).forEach((h, i) => {
    const f = h.scale ? pageScale / h.scale : 1;
    /* Both mark kinds are erasable: drawn strokes hit by their polyline,
       text-selection highlights by any of their rects. */
    let hit = false;
    if (h.page === curPage) {
      if (h.free && h.pts) hit = strokeHit(h, p.x, p.y, f);
      else if (h.rects) hit = h.rects.some(r =>
        p.x >= r.x * f - ERASER_RADIUS && p.x <= (r.x + r.w) * f + ERASER_RADIUS &&
        p.y >= r.y * f - ERASER_RADIUS && p.y <= (r.y + r.h) * f + ERASER_RADIUS);
    }
    if (hit) { erasedStrokes.push({ h, index: i }); removedAny = true; }
    else keep.push(h);
  });
  if (removedAny) {
    curBook.highlights = keep;
    updateBook(curBook.id, { highlights: keep });
    paintHighlights();
  }
}

function eraseMove(e) {
  if (!eraseActive || penActive || !erasing) return;
  eraseCursor(e);
  eraseAt(e);
}

function endErase() {
  erasing = false;
  hideEraserCursor();
  if (erasedStrokes && erasedStrokes.length) {
    showEraseUndo();
    /* Keep the removed records parked until the toast hides or the user acts —
       performEraseUndo/hideEraseUndo own this reference from here on. */
    return;
  }
  erasedStrokes = null;
}

function eraseCursor(e) {
  let c = $('#eraserCursor');
  if (!c) {
    c = document.createElement('div');
    c.id = 'eraserCursor';
    c.className = 'eraser-cursor';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
  }
  c.style.left = e.clientX + 'px';
  c.style.top = e.clientY + 'px';
}

function hideEraserCursor() {
  /* Removed outright — a stale halo must never linger into another book or
     engine (teardown relies on this, not just on visibility). */
  $('#eraserCursor')?.remove();
}

/* Undo toast for erasing — reuses the existing toast styles with its own
   element so the task-undo flow is never disturbed. */
let eraseUndoTimer = null;
function showEraseUndo() {
  const toast = $('#eraseToast');
  if (!toast) return;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(eraseUndoTimer);
  eraseUndoTimer = setTimeout(hideEraseUndo, 5000);
}
function hideEraseUndo() {
  const toast = $('#eraseToast');
  if (!toast) return;
  toast.classList.remove('show');
  setTimeout(() => { toast.hidden = true; }, 300);
  erasedStrokes = null;
}
function performEraseUndo() {
  /* The parked strokes are still live until the toast goes away. */
  if (!erasedStrokes || !erasedStrokes.length || !curBook) { hideEraseUndo(); return; }
  clearTimeout(eraseUndoTimer);
  curBook.highlights = curBook.highlights || [];
  erasedStrokes.forEach(({ h }) => {
    curBook.highlights.push(h);
  });
  erasedStrokes = null;
  updateBook(curBook.id, { highlights: curBook.highlights });
  paintHighlights();
  hideEraseUndo();
}

/* Size the draw surface to the current page wrap. Called on pen enable and on
   every page render; cheap, and idempotent when nothing changed. `force`
   wipes the surface even when the size is unchanged — that is how a page turn
   guarantees strokes from the previous page never linger. */
function prepareDrawCanvas(force) {
  const wrap = $('#pageWrap');
  const c = $('#drawLayer');
  const w = Math.round(wrap.offsetWidth), h = Math.round(wrap.offsetHeight);
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  if (force || c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    drawCtx = c.getContext('2d');
    drawCtx.scale(dpr, dpr);
  }
}

function penPos(e) {
  const r = $('#drawLayer').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function startPenStroke(e) {
  if (!penActive || eraseActive || e.button > 0) return;
  e.preventDefault();
  prepareDrawCanvas();
  if (!drawCtx) return;
  toggleDockPop(null);
  const p = penPos(e);
  drawStroke = { color: strokeColor, pts: [p] };
  /* A stale/synthetic pointer must never break the stroke (or throw). */
  try { $('#drawLayer').setPointerCapture(e.pointerId); } catch (err) {}
  paintStrokeLive();
}

/* Live trail: only the newest segment is drawn on the overlay canvas — no
   clearing, so the gesture stays smooth even on long strokes. */
function paintStrokeLive() {
  if (!drawCtx || !drawStroke) return;
  const pts = drawStroke.pts;
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  if (!a) return;
  drawCtx.strokeStyle = STROKE_COLORS[drawStroke.color];
  drawCtx.globalAlpha = .85;
  drawCtx.lineWidth = strokeWidth;
  drawCtx.lineCap = 'round';
  drawCtx.lineJoin = 'round';
  drawCtx.beginPath();
  drawCtx.moveTo(a.x, a.y);
  drawCtx.lineTo(b.x, b.y);
  drawCtx.stroke();
}

function penMove(e) {
  if (!penActive || eraseActive || !drawStroke) return;
  const p = penPos(e);
  const pts = drawStroke.pts;
  const last = pts[pts.length - 1];
  /* Skip micro-moves: fewer points, lighter records. */
  if (last && Math.abs(p.x - last.x) < 1.5 && Math.abs(p.y - last.y) < 1.5) return;
  pts.push(p);
  paintStrokeLive();
}

function penEnd() {
  if (eraseActive || !drawStroke) return;
  const s = drawStroke;
  drawStroke = null;
  const pts = simplifyStroke(s.pts);
  if (pts.length < 2) { clearDrawCanvas(); return; }   /* a tap is not a mark */
  curBook.highlights = curBook.highlights || [];
  curBook.highlights.push({
    id: Date.now() + '', page: curPage, text: '', color: s.color,
    free: true, pts, width: strokeWidth, scale: pageScale, note: '', createdAt: Date.now(),
  });
  updateBook(curBook.id, { highlights: curBook.highlights });
  /* Wipe the live trail first, then let paintHighlights redraw the committed
     strokes — the reverse order would erase the fresh mark. */
  clearDrawCanvas();
  paintHighlights();
}

/* Douglas–Peucker-lite: keep points that bend the trail more than 2px. A
   stroke recorded at ~60 points loses ~80% of its points with no visible
   difference, which is what keeps localStorage light. */
function simplifyStroke(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  let lastA = pts[0], lastB = pts[1];
  for (let i = 2; i < pts.length; i++) {
    const p = pts[i];
    const dx = lastB.x - lastA.x, dy = lastB.y - lastA.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((p.x - lastA.x) * dx + (p.y - lastA.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = lastA.x + t * dx - p.x, py = lastA.y + t * dy - p.y;
    if (px * px + py * py > 4) { out.push(p); lastA = lastB; lastB = p; }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function clearDrawCanvas() {
  if (drawCtx) drawCtx.clearRect(0, 0, $('#drawLayer').width, $('#drawLayer').height);
}

/* ── Study dock ── */
const DOCK_POPS = { '#penPop': '#dockPen', '#pagePop': '#pagePill' };
let openPop = null;
function toggleDockPop(sel) {
  const target = sel && sel !== openPop ? sel : null;
  for (const pop of Object.keys(DOCK_POPS)) {
    const onPop = pop === target;
    const btn = $(DOCK_POPS[pop]);
    $(pop).hidden = !onPop;
    btn.classList.toggle('on', onPop);
    btn.setAttribute('aria-expanded', String(onPop));
  }
  if (target) $('#hlBar').hidden = true;
  openPop = target;
}

let zenHidden = false, scrollRaf = 0, lastScrollTop = 0;
function setZen(on) {
  if (on === zenHidden) return;
  zenHidden = on;
  $('#readerDock').classList.toggle('zen', on);
  if (on) toggleDockPop(null);
}

function onStageScroll() {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    const stage = $('#readerStage');
    const dy = stage.scrollTop - lastScrollTop;
    lastScrollTop = stage.scrollTop;
    if (stage.scrollTop < 16) setZen(false);
    else if (dy > 8) setZen(true);
    else if (dy < -8) setZen(false);
  });
}

/* A tap on the page brings the dock back; it never hides it, so a stray tap
   while selecting text cannot take the controls away. */
function onStageTap(e) {
  if (e.target.closest('#hlBar,.dock-pop,.sheet,.overlay')) return;
  if (zenHidden) setZen(false);
  else toggleDockPop(null);
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
  clearDrawCanvas();
  drawStroke = null;
  /* Nothing from the eraser session may survive the book that owns its
     strokes: the mode itself, an in-flight drag, the halo cursor and the undo
     toast (with its timer) are all invalidated right here. */
  erasing = false;
  hideEraserCursor();
  clearTimeout(eraseUndoTimer);
  $('#eraseToast').hidden = true;
  if (eraseActive) toggleEraser(false);
  erasedStrokes = null;
  /* A pen left on from the previous book must not silently swallow the first
     drag on the new one — the toggle also re-syncs every visual state. */
  if (penActive) togglePen(false);
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
  /* A new book starts from a clean reading surface: dock visible, no stale
     menu, no leftover scroll anchor from the previous book. */
  setZen(false);
  lastScrollTop = 0;
  toggleDockPop(null);
  toggleSettings(false);
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
  zoom = 1;
  applyMode();
  prepareDrawCanvas();
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
  /* The iframe never sees our pointer events: the pen, the eraser and any
     in-flight gesture have to retire the moment this engine takes over. */
  if (penActive) togglePen(false);
  if (eraseActive) toggleEraser(false);
  erasing = false;
  hideEraserCursor();
  clearTimeout(eraseUndoTimer);
  $('#eraseToast').hidden = true;
  erasedStrokes = null;
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
  setZen(false);
  toggleDockPop(null);
  toggleSettings(false);
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

  /* The trail surface must follow the rendered page — zoom, resize and page
     turns all change the wrap box; a resize also wipes the surface, so the
     strokes of the *new* page are painted after it, never the old ones. The
     forced wipe is what separates a page turn from a same-size redraw. */
  prepareDrawCanvas(true);
  paintHighlights();
  if (!keepScroll) stage.scrollTop = 0;
  return { canvasOk: true };
}

/* Two small helpers wired after init: the pen colour selection needs a visual
   state, and the sync of the draw surface happens inside renderPage. */
/* Re-apply the remembered nib size and colour on every boot. Missing or
   corrupt storage falls back to the defaults silently. */
function restorePenPrefs() {
  try {
    const w = localStorage.getItem(STORAGE_KEYS.penWidth);
    if (w && PEN_WIDTHS[w]) strokeWidth = PEN_WIDTHS[w];
  } catch (e) {}
  syncPenUI();
}

function syncPenUI() {
  document.querySelectorAll('.hl-dot').forEach(d => {
    d.classList.toggle('sel', d.dataset.color === strokeColor);
  });
  /* Reflect the active nib on its chip group and every stroked mark drawn
     after this point. */
  const active = Object.keys(PEN_WIDTHS).find(k => PEN_WIDTHS[k] === strokeWidth);
  document.querySelectorAll('#penWidths .pen-width').forEach(c => {
    const on = c.dataset.width === active;
    c.classList.toggle('on', on);
    c.setAttribute('aria-pressed', String(on));
  });
  /* The dock button carries a live badge of the current nib: the swatch hue
     plus a size class, so the state is readable without opening the menu. */
  const ind = $('#dockPen .pen-indicator');
  if (ind) {
    ind.style.background = STROKE_COLORS[strokeColor] || STROKE_COLORS.yellow;
    ind.className = 'pen-indicator w-' + (active || 'medium');
  }
}
syncPenUI();

/* ── Page UI + progress ── */
function updatePageUI() {
  const total = curBook.numPages;
  $('#pageLabel').textContent = total ? `${faNum(curPage)} / ${faNum(total)}` : faNum(curPage);
  $('#pageRange').value = curPage;
  /* The dock reports the page's read state next to its number, so marking a
     page is visible without opening the page menu. */
  const read = bookDone(curBook).has(curPage);
  $('#pagePill').classList.toggle('is-read', read);
  $('#pagePill').setAttribute('aria-label', read
    ? `صفحهٔ ${faNum(curPage)} — خوانده شده`
    : `صفحهٔ ${faNum(curPage)}`);
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
  curPage = n;
  updateBook(curBook.id, { lastPage: n, lastReadAt: Date.now() });
  curBook.lastPage = n;
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
  const marked = !done.has(curPage);
  if (marked) done.add(curPage);
  else done.delete(curPage);
  curBook.completedPages = [...done];
  /* The day's page count moves with this very action and with nothing else:
     marking a page read counts it, unmarking takes it back, never below zero.
     It is written in the same update as the page itself, so the goal bar and
     the book's progress can never disagree about what was read today. */
  curBook.stats = withTodayPages(curBook.stats, marked ? 1 : -1);
  updateBook(curBook.id, { completedPages: curBook.completedPages, stats: curBook.stats, lastReadAt: Date.now() });
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
  if ($('#readerView').hidden || engine === 'browser' || penActive) return;
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
  bar.style.top = Math.max(8, Math.min(stage.clientHeight - bar.offsetHeight - 8, first.top - stRect.top + sc.y - bar.offsetHeight - 8)) + 'px';
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

function paintHighlights() {
  const layer = $('#highlightLayer');
  layer.innerHTML = '';
  if (!curBook) return;
  /* Strokes live on the draw canvas: it must start clean every repaint or the
     pixels of erased strokes would linger after eraseAt/undo/zoom. */
  if (drawCtx) {
    drawCtx.clearRect(0, 0, $('#drawLayer').width, $('#drawLayer').height);
    drawCtx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    drawCtx.scale(dpr, dpr);
  }
  (curBook.highlights || []).filter(h => h.page === curPage).forEach(h => {
    /* Records saved before the scale was captured keep their original pixels. */
    const f = h.scale ? pageScale / h.scale : 1;
    if (h.free) {
      /* Hand-drawn stroke: repaint the recorded polyline into the draw canvas
         at the current render scale. Lives on the canvas, not as DOM nodes.
         Marks from before the width choice existed keep their drawn look via
         the default nib. */
      if (drawCtx) {
        drawCtx.strokeStyle = STROKE_COLORS[h.color] || STROKE_COLORS.yellow;
        drawCtx.globalAlpha = .85;
        drawCtx.lineWidth = nibPx(h.width);
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
        drawCtx.beginPath();
        (h.pts || []).forEach((p, i) => {
          const x = p.x * f, y = p.y * f;
          if (i === 0) drawCtx.moveTo(x, y);
          else drawCtx.lineTo(x, y);
        });
        drawCtx.stroke();
        drawCtx.globalAlpha = 1;
      }
      return;
    }
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
    free: !!h.free,
  }));
  const fresh = (curBook.notes || []).map(n => ({
    id: n.id, page: n.page, text: n.text, note: '', color: null, source: 'notes',
  }));
  return [...hls, ...fresh].sort((a, b) => a.page - b.page);
}

function buildNotes() {
  const list = $('#notesList'); list.innerHTML = '';
  const items = allNoteItems();
  if (!items.length) { list.innerHTML = '<p class="notes-empty">هنوز یادداشتی نداری؛ قلم رو بردار و روی صفحه بکش یا متنی رو انتخاب کن!</p>'; return; }
  items.forEach(it => {
    const el = document.createElement('div');
    el.className = 'note-item';
    /* Hand-drawn marks have no quoted text — the stroke itself is the content. */
    el.innerHTML = `
      ${it.color ? `<i class="dot" style="background:${HL_COLORS[it.color] || it.color}"></i>` : ''}
      <div class="note-body">
        <span class="note-text">${it.free ? '<b class="free-tag">نشان قلمی</b>' : esc(it.text)}</span>
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
  items.forEach(it => {
    md += it.free
      ? `- صفحه ${it.page}: [نشان قلمی - ${it.color}]${it.note ? ` — ${it.note}` : ''}\n`
      : `- صفحه ${it.page}: «${it.text}»${it.note ? ` — ${it.note}` : ''}\n`;
  });
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
    btn.setAttribute('aria-pressed', 'true');
    btn.title = 'پایان تایمر مطالعه';
    $('#timerText').textContent = faDigits('0:00');
    timer.interval = setInterval(() => {
      const s = Math.floor((Date.now() - timer.start) / 1000);
      $('#timerText').textContent = faDigits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    }, 1000);
  } else stopTimerSession();
}
function stopTimerSession() {
  const ms = Date.now() - timer.start;
  clearInterval(timer.interval);
  timer.running = false;
  const btn = $('#readTimerBtn');
  btn.classList.remove('on');
  btn.setAttribute('aria-pressed', 'false');
  btn.title = 'شروع تایمر مطالعه';
  /* The capsule keeps the finished count so the session reads as a closed
     loop instead of resetting to zero. */
  const s = Math.floor(ms / 1000);
  $('#timerText').textContent = faDigits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  const m = Math.max(1, Math.round(ms / 60000));
  addToday('minutes', m);
  recordDay();
  updateGoalBar();
}

/* ── Daily stats ── */
/* Returns the book's stats with today's page count moved by `delta`, keeping
   the other days and the day's reading minutes untouched. */
function withTodayPages(stats, delta) {
  const k = dayKey(new Date());
  const next = Object.assign({}, stats || {});
  const day = Object.assign({ pages: 0, minutes: 0 }, next[k]);
  day.pages = Math.max(0, (Number(day.pages) || 0) + delta);
  next[k] = day;
  return next;
}

function addToday(kind, v) {
  const k = dayKey(new Date());
  curBook.stats = curBook.stats || {};
  curBook.stats[k] = curBook.stats[k] || { pages: 0, minutes: 0 };
  curBook.stats[k][kind] += v;
  updateBook(curBook.id, { stats: curBook.stats });
}


