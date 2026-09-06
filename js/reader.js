/* ═══ PDF Reader ═══
The PDF is rendered by the browser's built-in viewer (an iframe over the file blob), not by custom rendering —
because custom rendering (canvas + pdf.js) mangled Persian text on some files.
The browser viewer uses the same engine the browser itself uses to open PDFs, so it always displays correctly.
pdf.js is kept only for counting the number of pages (no text/font rendering).
Result: direct highlighting of the PDF text is no longer possible (the browser viewer is a closed box),
but per-page notes take its place, and old highlights are preserved in the notes panel. */
import { $, faNum, faDigits, dayKey } from './utils.js';
import { getBook, updateBook, getBookBlob, renderShelf } from './library.js';
import { recordDay } from './week.js';
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';

const PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168';
pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/build/pdf.worker.min.mjs`;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let curBook = null, curPage = 1, zoom = 1;
let pdfObjectUrl = null;
let mode = 0;
const MODES = ['mode-light', 'mode-sepia', 'mode-dark'];
let timer = { running: false, start: 0, interval: null };

export function initReader() {
  window.addEventListener('open-book', e => openReader(e.detail));
  $('#readerBack').onclick = closeReader;
  $('#prevPage').onclick = () => gotoPage(curPage - 1);
  $('#nextPage').onclick = () => gotoPage(curPage + 1);
  $('#zoomIn').onclick = () => { zoom = Math.min(3, +(zoom * 1.2).toFixed(2)); renderFrame(); };
  $('#zoomOut').onclick = () => { zoom = Math.max(.5, +(zoom / 1.2).toFixed(2)); renderFrame(); };
  $('#pageRange').addEventListener('change', e => gotoPage(parseInt(e.target.value)));
  $('#readerMode').onclick = () => { mode = (mode + 1) % 3; applyMode(); };

  document.addEventListener('keydown', e => {
    if ($('#readerView').hidden) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') gotoPage(curPage + 1);
    if (e.key === 'ArrowLeft') gotoPage(curPage - 1);
  });

  // Close the reader when navigating away from the library
  $('#bottomNav').addEventListener('click', e => {
    const tab = e.target.closest('.nav-tab');
    if (tab && tab.dataset.page !== 'library' && !$('#readerView').hidden) closeReader();
  });

  /* Page note */
  $('#addNoteBtn').onclick = openNoteForCurrentPage;
  $('#noteSave').onclick = () => {
    const text = $('#noteInput').value.trim();
    if (text) {
      curBook.notes = curBook.notes || [];
      curBook.notes.push({ id: Date.now() + '', page: curPage, text, createdAt: Date.now() });
      updateBook(curBook.id, { notes: curBook.notes });
    }
    $('#noteOverlay').hidden = true;
  };
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
async function openReader(id) {
  curBook = getBook(id); if (!curBook) return;
  $('#shelfView').hidden = true;
  $('#readerView').hidden = false;
  $('#readerTitle').textContent = curBook.title;
  const thumb = $('#readerThumb');
  if (curBook.cover) { thumb.src = curBook.cover; thumb.hidden = false; } else thumb.hidden = true;
  $('#readerLoading').hidden = false;

  const blob = await getBookBlob(id);
  if (!blob) { alert('فایل کتاب پیدا نشد!'); closeReader(); return; }
  if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
  pdfObjectUrl = URL.createObjectURL(blob);

  // Only to get the page count; if it fails, the book can still be opened
  if (!curBook.numPages) {
    try {
      const data = await blob.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data }).promise;
      updateBook(id, { numPages: doc.numPages });
      curBook.numPages = doc.numPages;
      doc.destroy();
    } catch (e) {
      console.warn('گرفتن تعداد صفحه‌ها ممکن نشد:', e);
    }
  }
  $('#pageRange').max = curBook.numPages || 999999;
  curPage = Math.min(curBook.lastPage || 1, curBook.numPages || curBook.lastPage || 1);
  applyMode();
  zoom = 1;
  renderFrame();
  updateGoalBar();
  $('#readerLoading').hidden = true;
}

function closeReader() {
  if (timer.running) stopTimerSession();
  $('#readerView').hidden = true;
  $('#shelfView').hidden = false;
  $('#notesSheet').hidden = true;
  renderShelf();
}

/* ── Render with the browser's built-in viewer (standard PDF Open Parameters: #page= and #zoom=) ── */
function renderFrame() {
  const frame = $('#pdfFrame');
  if (!pdfObjectUrl) return;
  const z = Math.round(zoom * 100);
  frame.src = `${pdfObjectUrl}#page=${curPage}&zoom=${z}`;
  updatePageUI();
}

function updatePageUI() {
  const total = curBook.numPages;
  $('#pageLabel').textContent = total ? `${faNum(curPage)} / ${faNum(total)}` : faNum(curPage);
  $('#pageRange').value = curPage;
  if (total) {
    const pct = Math.round((curPage / total) * 100);
    $('#readerPct').textContent = `${faNum(pct)}٪ خونده شده`;
  } else {
    $('#readerPct').textContent = '';
  }
}

/* ── Navigation + Progress ── */
function gotoPage(n) {
  const total = curBook.numPages || Infinity;
  n = Math.max(1, Math.min(total, n));
  if (n === curPage) return;
  if (n > (curBook.lastPage || 1)) {
    addToday('pages', n - (curBook.lastPage || 1));
    updateBook(curBook.id, { lastPage: n, lastReadAt: Date.now() });
    curBook.lastPage = n;
  }
  curPage = n;
  renderFrame();
  updateGoalBar();
}

function addToday(kind, v) {
  const k = dayKey(new Date());
  curBook.stats = curBook.stats || {};
  curBook.stats[k] = curBook.stats[k] || { pages: 0, minutes: 0 };
  curBook.stats[k][kind] += v;
  updateBook(curBook.id, { stats: curBook.stats });
}

function updateGoalBar() {
  const bar = $('#goalBar');
  const st = curBook.stats?.[dayKey(new Date())] || { pages: 0, minutes: 0 };
  const g = curBook.goal?.pagesPerDay;
  bar.innerHTML = g
    ? `<div class="goal-line"><span>امروز: ${faNum(st.pages)} از ${faNum(g)} صفحه · ${faNum(st.minutes)} دقیقه مطالعه</span><button id="goalEdit">تغییر هدف</button></div>
       <div class="goal-track"><i style="width:${Math.min(100, Math.round((st.pages / g) * 100))}%"></i></div>`
    : `<div class="goal-line"><span>هدفی برای این کتاب تنظیم نشده</span><button id="goalEdit">تنظیم هدف</button></div>`;
  $('#goalEdit').onclick = () => window.dispatchEvent(new CustomEvent('open-goal', { detail: curBook.id }));
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

/* ── Per-Page Notes ── */
function openNoteForCurrentPage() {
  $('#noteForText').textContent = `یادداشت صفحهٔ ${faNum(curPage)}`;
  $('#noteInput').value = '';
  $('#noteOverlay').hidden = false;
  setTimeout(() => $('#noteInput').focus(), 200);
}

/* ── Notes Panel (New Notes + Old Highlights) ── */
function allNoteItems() {
  const legacy = (curBook.highlights || []).map(h => ({
    id: h.id, page: h.page, text: h.text, note: h.note, color: h.color, source: 'highlights',
  }));
  const fresh = (curBook.notes || []).map(n => ({
    id: n.id, page: n.page, text: n.text, note: '', color: null, source: 'notes',
  }));
  return [...legacy, ...fresh].sort((a, b) => a.page - b.page);
}

function buildNotes() {
  const list = $('#notesList'); list.innerHTML = '';
  const items = allNoteItems();
  if (!items.length) { list.innerHTML = '<p class="notes-empty">هنوز یادداشتی نداری؛ موقع خوندن از دکمهٔ 📝 استفاده کن!</p>'; return; }
  items.forEach(it => {
    const el = document.createElement('div');
    el.className = 'note-item';
    el.innerHTML = `
      ${it.color ? `<i class="dot" style="background:${it.color}"></i>` : ''}
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