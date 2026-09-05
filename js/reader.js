/* ═══ مطالعهٔ PDF: رندر شارپ، هایلایت، یادداشت، تایمر، هدف، حالت مطالعه ═══ */
import { $, faNum, faDigits, dayKey } from './utils.js';
import { getBook, updateBook, getBookBlob, renderShelf } from './library.js';
import { recordDay } from './week.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* نسخهٔ pdf.js — همهٔ منابع از یک نسخه باشن */
const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}`;

let pdf = null, curBook = null, curPage = 1, zoom = 1, renderTask = null;
let pending = null, noteFor = null, mode = 0;
const MODES = ['mode-light', 'mode-sepia', 'mode-dark'];
let timer = { running: false, start: 0, interval: null };

const P = () => window.pdfjsLib;

export function initReader() {
  window.addEventListener('open-book', e => openReader(e.detail));
  $('#readerBack').onclick = closeReader;
  $('#prevPage').onclick = () => gotoPage(curPage - 1);
  $('#nextPage').onclick = () => gotoPage(curPage + 1);
  $('#zoomIn').onclick = () => { zoom = Math.min(3, zoom * 1.2); renderPage(); };
  $('#zoomOut').onclick = () => { zoom = Math.max(.6, zoom / 1.2); renderPage(); };
  $('#pageRange').addEventListener('input', e => gotoPage(parseInt(e.target.value)));
  $('#readerMode').onclick = () => { mode = (mode + 1) % 3; applyMode(); };

  document.addEventListener('keydown', e => {
    if ($('#readerView').hidden) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') gotoPage(curPage + 1);
    if (e.key === 'ArrowLeft') gotoPage(curPage - 1);
  });

  // رندر مجدد موقع تغییر سایز صفحه
  let rzT;
  window.addEventListener('resize', () => {
    if ($('#readerView').hidden) return;
    clearTimeout(rzT);
    rzT = setTimeout(() => renderPage(), 250);
  });

  // بستن reader وقتی از کتابخانه می‌ریم بیرون
  $('#bottomNav').addEventListener('click', e => {
    const tab = e.target.closest('.nav-tab');
    if (tab && tab.dataset.page !== 'library' && !$('#readerView').hidden) closeReader();
  });

  /* هایلایت */
  const tl = $('#textLayer');
  tl.addEventListener('mouseup', onSelection);
  tl.addEventListener('touchend', onSelection);
  $('#hlToolbar').addEventListener('click', e => {
    const b = e.target.closest('button[data-c]');
    if (b && pending) addHighlight(b.dataset.c);
  });
  $('#hlNoteBtn').onclick = () => {
    if (pending) addHighlight('#ffd97d', true);
    else if ((curBook.highlights || []).length) openNoteFor(curBook.highlights[curBook.highlights.length - 1].id);
  };
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('#hlToolbar') && !e.target.closest('.textLayer')) hideToolbar();
  });

  /* یادداشت */
  $('#noteSave').onclick = () => {
    const h = (curBook.highlights || []).find(x => x.id === noteFor);
    if (h) { h.note = $('#noteInput').value.trim(); updateBook(curBook.id, { highlights: curBook.highlights }); }
    $('#noteOverlay').hidden = true;
  };
  $('#noteClose').onclick = () => { $('#noteOverlay').hidden = true; };

  /* پنل یادداشت‌ها */
  $('#readerNotes').onclick = () => { buildNotes(); $('#notesSheet').hidden = false; };
  $('#notesClose').onclick = () => { $('#notesSheet').hidden = true; };
  $('#notesExport').onclick = exportNotes;

  /* تایمر */
  $('#readTimerBtn').onclick = toggleTimer;
}

function applyMode() {
  const stage = $('#readerStage');
  MODES.forEach(m => stage.classList.remove(m));
  stage.classList.add(MODES[mode]);
  $('#readerMode').title = ['حالت روشن', 'حالت سپیا', 'حالت شب'][mode];
}

/* ── باز/بستن ── */
async function openReader(id) {
  curBook = getBook(id); if (!curBook) return;
  $('#shelfView').hidden = true;
  $('#readerView').hidden = false;
  $('#readerTitle').textContent = curBook.title;
  const thumb = $('#readerThumb');
  if (curBook.cover) { thumb.src = curBook.cover; thumb.hidden = false; } else thumb.hidden = true;

  const blob = await getBookBlob(id);
  if (!blob) { alert('فایل کتاب پیدا نشد!'); closeReader(); return; }
  const data = await blob.arrayBuffer();

  /* ── رفع بهم‌ریختگی متن فارسی: cMap + فونت‌های استاندارد ── */
  P().GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/build/pdf.worker.min.js`;
  pdf = await P().getDocument({
    data,
    cMapUrl: `${PDFJS_BASE}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_BASE}/standard_fonts/`,
    useSystemFonts: true,
  }).promise;

  if (!curBook.numPages) {
    updateBook(id, { numPages: pdf.numPages });
    curBook.numPages = pdf.numPages;
  }
  $('#pageRange').max = pdf.numPages;
  curPage = Math.min(curBook.lastPage || 1, pdf.numPages);
  applyMode();
  renderPage();
  updateGoalBar();
  if (!curBook.cover) makeCover();
}

function closeReader() {
  if (timer.running) stopTimerSession();
  $('#readerView').hidden = true;
  $('#shelfView').hidden = false;
  $('#notesSheet').hidden = true;
  hideToolbar();
  renderShelf();
}

/* ── رندر صفحه (شارپ + مدیریت لغو) ── */
async function renderPage() {
  if (!pdf) return;
  $('#readerLoading').hidden = false;
  try {
    const page = await pdf.getPage(curPage);
    const stage = $('#readerStage');
    const wrapW = Math.max(200, stage.clientWidth - 28);
    const base = wrapW / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale: base * zoom });
    const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));

    const canvas = $('#pdfCanvas');
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = Math.floor(viewport.width) + 'px';
    canvas.style.height = Math.floor(viewport.height) + 'px';

    const wrap = $('#pageWrap');
    wrap.style.width = Math.floor(viewport.width) + 'px';
    wrap.style.height = Math.floor(viewport.height) + 'px';

    if (renderTask) { try { renderTask.cancel(); } catch (e) {} }
    renderTask = page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
      transform: [dpr, 0, 0, dpr, 0, 0]
    });
    await renderTask.promise;

    const tl = $('#textLayer');
    tl.innerHTML = '';
    const tc = await page.getTextContent();
    const t = P().renderTextLayer({ textContent: tc, container: tl, viewport });
    if (t && t.promise) await t.promise;

    drawHighlights();
    updatePageUI();
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException') console.error(e);
  }
  $('#readerLoading').hidden = true;
}

function updatePageUI() {
  const total = pdf.numPages;
  const pct = Math.round((curPage / total) * 100);
  $('#pageLabel').textContent = `${faNum(curPage)} / ${faNum(total)}`;
  $('#pageRange').value = curPage;
  $('#readerPct').textContent = `${faNum(pct)}٪ خونده شده`;
}

async function makeCover() {
  try {
    const p1 = await pdf.getPage(1);
    const vp = p1.getViewport({ scale: .3 });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await p1.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const cover = c.toDataURL('image/jpeg', .55);
    updateBook(curBook.id, { cover });
    const thumb = $('#readerThumb');
    thumb.src = cover; thumb.hidden = false;
  } catch (e) {}
}

/* ── ناوبری + پیشرفت ── */
function gotoPage(n) {
  if (!pdf) return;
  n = Math.max(1, Math.min(pdf.numPages, n));
  if (n === curPage) return;
  if (n > (curBook.lastPage || 1)) {
    addToday('pages', n - (curBook.lastPage || 1));
    updateBook(curBook.id, { lastPage: n, lastReadAt: Date.now() });
    curBook.lastPage = n;
  }
  curPage = n;
  renderPage();
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

/* ── تایمر مطالعه ── */
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

/* ── هایلایت ── */
function onSelection() {
  setTimeout(() => {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount < 1) { hideToolbar(); return; }
    const text = sel.toString().trim();
    if (!text) { hideToolbar(); return; }
    const wrap = $('#pageWrap').getBoundingClientRect();
    const rects = [...sel.getRangeAt(0).getClientRects()].filter(r => r.width > 2).map(r => ({
      x: +(((r.left - wrap.left) / wrap.width) * 100).toFixed(2),
      y: +(((r.top - wrap.top) / wrap.height) * 100).toFixed(2),
      w: +((r.width / wrap.width) * 100).toFixed(2),
      h: +((r.height / wrap.height) * 100).toFixed(2),
    }));
    if (!rects.length) { hideToolbar(); return; }
    pending = { text, rects };
    const tb = $('#hlToolbar');
    tb.hidden = false;
    const first = sel.getRangeAt(0).getClientRects()[0];
    const tbW = 210;
    tb.style.top = Math.max(8, first.top - 54) + 'px';
    tb.style.left = Math.min(innerWidth - tbW - 8, Math.max(8, first.left)) + 'px';
  }, 10);
}
function hideToolbar() { $('#hlToolbar').hidden = true; pending = null; }

function addHighlight(color, withNote = false) {
  if (!pending) return;
  const h = { id: Date.now() + '', page: curPage, ...pending, color, note: '' };
  curBook.highlights = curBook.highlights || [];
  curBook.highlights.push(h);
  updateBook(curBook.id, { highlights: curBook.highlights });
  drawHighlights();
  hideToolbar();
  getSelection()?.removeAllRanges();
  if (withNote) openNoteFor(h.id);
}
function openNoteFor(id) {
  noteFor = id;
  const h = (curBook.highlights || []).find(x => x.id === id);
  $('#noteForText').textContent = '«' + (h?.text || '').slice(0, 80) + '»';
  $('#noteInput').value = h?.note || '';
  $('#noteOverlay').hidden = false;
  setTimeout(() => $('#noteInput').focus(), 200);
}
function drawHighlights() {
  const layer = $('#hlLayer'); layer.innerHTML = '';
  (curBook.highlights || []).filter(h => h.page === curPage).forEach(h => {
    h.rects.forEach(r => {
      const d = document.createElement('div');
      d.className = 'hl';
      d.style.left = r.x + '%'; d.style.top = r.y + '%';
      d.style.width = r.w + '%'; d.style.height = r.h + '%';
      d.style.background = h.color;
      layer.appendChild(d);
    });
  });
}

/* ── پنل یادداشت‌ها ── */
function buildNotes() {
  const list = $('#notesList'); list.innerHTML = '';
  const hs = [...(curBook.highlights || [])].sort((a, b) => a.page - b.page);
  if (!hs.length) { list.innerHTML = '<p class="notes-empty">هنوز هایلایتی نداری؛ متن رو انتخاب کن!</p>'; return; }
  hs.forEach(h => {
    const it = document.createElement('div');
    it.className = 'note-item';
    it.innerHTML = `
      <i class="dot" style="background:${h.color}"></i>
      <div class="note-body">
        <span class="note-text">${esc(h.text)}</span>
        ${h.note ? `<span class="note-note">📝 ${esc(h.note)}</span>` : ''}
      </div>
      <span class="note-page">ص ${faNum(h.page)}</span>
      <button class="note-del" aria-label="حذف">✕</button>`;
    it.addEventListener('click', e => {
      if (e.target.closest('.note-del')) {
        curBook.highlights = curBook.highlights.filter(x => x.id !== h.id);
        updateBook(curBook.id, { highlights: curBook.highlights });
        buildNotes(); drawHighlights();
        return;
      }
      $('#notesSheet').hidden = true;
      gotoPage(h.page);
    });
    list.appendChild(it);
  });
}

function exportNotes() {
  const hs = curBook.highlights || [];
  let md = `# ${curBook.title}\n\n`;
  hs.forEach(h => { md += `- صفحه ${h.page}: «${h.text}»${h.note ? ` — ${h.note}` : ''}\n`; });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
  a.download = curBook.title + '.md';
  a.click();
}