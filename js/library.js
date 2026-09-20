/* ═══ Library: Reading Workspace — Shelf, Reading State, Goal, Storage ═══ */
import { $, faNum } from './utils.js';

const META_KEY = 'daftarche-books-meta';
let books = JSON.parse(localStorage.getItem(META_KEY) || '[]');
const saveMeta = () => localStorage.setItem(META_KEY, JSON.stringify(books));

export const getBooks = () => books;
export const getBook = id => books.find(b => b.id === id);
export function updateBook(id, patch) {
  const b = getBook(id); if (!b) return;
  Object.assign(b, patch); saveMeta();
}

/* ── Reading progress (deterministic: completed pages / total pages) ── */
export const bookDone = b => new Set(b.completedPages || []);
export const bookPct = b => (b.numPages ? Math.round((bookDone(b).size / b.numPages) * 100) : 0);
export const bookComplete = b => !!b.numPages && bookDone(b).size >= b.numPages;

/* ── IndexedDB for the PDF file ── */
const DB_NAME = 'daftarche-books';
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('books', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbP;
}
export async function getBookBlob(id) {
  const d = await db();
  return new Promise(res => {
    const q = d.transaction('books').objectStore('books').get(id);
    q.onsuccess = () => res(q.result ? q.result.blob : null);
    q.onerror = () => res(null);
  });
}
async function putBook(rec) {
  const d = await db();
  return new Promise(res => { const tx = d.transaction('books', 'readwrite'); tx.objectStore('books').put(rec); tx.oncomplete = res; });
}
async function delBookBlob(id) {
  const d = await db();
  return new Promise(res => { const tx = d.transaction('books', 'readwrite'); tx.objectStore('books').delete(id); tx.oncomplete = res; });
}

/* Clear All: the whole library database goes, PDF files included, because that
   store is the user's own reading material and no part of it is recoverable
   once the metadata is gone. The connection this page is holding is closed
   first — an open handle of our own makes the delete request blocked, and a
   blocked request would leave the files on disk while the app reports a clean
   wipe. Resolves true only when the database is really gone; a failed or
   blocked delete resolves false so the caller can say so instead of reloading
   as if everything had been removed. */
export function clearLibraryData() {
  return new Promise(resolve => {
    const remove = () => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    };
    /* A connection may still be opening; it is awaited so it is closed before
       the delete request is issued, and dropped so a later use reopens fresh. */
    db().then(
      d => { try { d.close(); } catch (e) {} dbP = null; remove(); },
      () => { dbP = null; remove(); }
    );
  });
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TRASH = `<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M10 11v6M14 11v6"/></svg>`;
const BOOK_ICON = `<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`;

/* ── Book totals (new notes + old highlights) ── */
function bookTotals(b) {
  let minutes = 0;
  Object.values(b.stats || {}).forEach(s => { minutes += s.minutes || 0; });
  return { minutes, notes: (b.highlights || []).length + (b.notes || []).length };
}
const bookStatus = b => bookComplete(b) ? 'done' : ((bookDone(b).size > 0 || (b.lastPage || 1) > 1) ? 'reading' : 'new');

/* ── Shelf + Currently Reading ── */
export function renderShelf() {
  const grid = $('#shelfGrid');
  const doneGrid = $('#doneGrid');
  const doneWrap = $('#doneShelf');
  grid.innerHTML = ''; doneGrid.innerHTML = '';
  const active = books.filter(b => bookStatus(b) !== 'done');
  const finished = books.filter(b => bookStatus(b) === 'done');
  $('#shelfEmpty').hidden = books.length > 0;
  doneWrap.hidden = finished.length === 0;
  const cnt = $('#shelfCount');
  if (cnt) cnt.textContent = books.length ? `${faNum(books.length)} کتاب` : 'خالی';

  /* Currently Reading card — the dominant element of Library Home */
  const slot = $('#lastReadSlot');
  slot.innerHTML = '';
  const last = [...active].filter(b => b.numPages).sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0))[0];
  if (last) {
    const done = bookDone(last).size;
    const pct = bookPct(last);
    const t = bookTotals(last);
    const goalLine = last.goal?.text ? `<span class="lr-goal">🎯 ${esc(last.goal.text)}</span>` : '';
    const card = document.createElement('div');
    card.className = 'lastread';
    card.innerHTML = `
      ${last.cover ? `<img src="${last.cover}" alt="">` : ''}
      <div class="lr-info">
        <span class="lr-kicker">در حال مطالعه</span>
        <div class="lr-top"><span class="lr-title">${esc(last.title)}</span><span class="lr-pct">${faNum(pct)}٪</span></div>
        <div class="lr-track"><i style="width:${pct}%"></i></div>
        <span class="lr-sub">${faNum(done)} صفحهٔ خوانده‌شده از ${faNum(last.numPages)} · صفحهٔ ${faNum(last.lastPage || 1)}${t.notes ? ` · ${faNum(t.notes)} یادداشت` : ''}</span>
        ${goalLine}
      </div>
      <button class="lr-btn">ادامه مطالعه</button>`;
    card.addEventListener('click', () => window.dispatchEvent(new CustomEvent('open-book', { detail: last.id })));
    slot.appendChild(card);
  }

  /* Shelf cards — active books */
  active.forEach((b, i) => {
    grid.appendChild(bookCard(b, i, false));
  });
  /* Completed books — kept, quieter */
  finished.forEach((b, i) => {
    doneGrid.appendChild(bookCard(b, i, true));
  });
}

function bookCard(b, i, isDone) {
  const done = bookDone(b).size;
  const pct = bookPct(b);
  const st = bookStatus(b);
  const t = bookTotals(b);
  const cta = st === 'done' ? 'مطالعه کامل شد' : (st === 'reading' ? 'ادامه مطالعه' : 'شروع مطالعه');
  const card = document.createElement('div');
  card.className = 'book-card' + (isDone ? ' book-done' : '');
  card.style.animationDelay = (i * 60) + 'ms';
  card.innerHTML = `
    <div class="book-cover">
      ${b.cover ? `<img src="${b.cover}" alt="">` : BOOK_ICON}
      <span class="book-prog" style="width:${pct}%"></span>
      ${st === 'reading' ? `<span class="book-pct-badge">${faNum(pct)}٪</span>` : ''}
      ${st === 'done' ? `<span class="book-done-badge" aria-label="مطالعهٔ کامل‌شده">✓</span>` : ''}
    </div>
    <div class="book-title">${esc(b.title)}</div>
    <div class="book-meta">
      ${b.numPages ? `<span>${faNum(done)} از ${faNum(b.numPages)} ص</span>` : '<span>خوانده نشده</span>'}
      ${t.notes ? `<span>· ${faNum(t.notes)} یادداشت</span>` : ''}
    </div>
    <div class="book-actions">
      <button class="b-go" data-act="open">${cta}</button>
      <button class="b-ghost" data-act="goal" aria-label="هدف مطالعه">هدف</button>
      <button class="b-del" data-act="del" aria-label="حذف">${TRASH}</button>
    </div>`;
  card.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'open') window.dispatchEvent(new CustomEvent('open-book', { detail: b.id }));
    if (act === 'goal') openGoal(b.id);
    if (act === 'del') {
      if (confirm(`«${b.title}» با همهٔ یادداشت‌هاش حذف بشه؟`)) {
        delBookBlob(b.id);
        books = books.filter(x => x.id !== b.id);
        saveMeta(); renderShelf();
      }
    }
  });
  return card;
}

/* ── Reading Goal (metadata only) ── */
let goalBookId = null;
export function openGoal(id) {
  goalBookId = id;
  const b = getBook(id);
  const gp = $('#goalPages');
  gp.value = b.goal?.pagesPerDay > 0 ? b.goal.pagesPerDay : '';
  /* The input can never ask for more pages than the book has. */
  gp.max = String(b.numPages || 500);
  $('#goalText').value = b.goal?.text || '';
  const gtype = b.goal?.text ? 'personal' : 'full';
  document.querySelectorAll('.goal-choice').forEach(c => c.classList.toggle('sel', c.dataset.gtype === gtype));
  $('#goalText').hidden = gtype !== 'personal';
  $('#goalOverlay').hidden = false;
}
function initGoal() {
  document.querySelectorAll('.goal-choice').forEach(c => {
    c.onclick = () => {
      document.querySelectorAll('.goal-choice').forEach(x => x.classList.remove('sel'));
      c.classList.add('sel');
      $('#goalText').hidden = c.dataset.gtype !== 'personal';
      if (c.dataset.gtype === 'personal') $('#goalText').focus();
    };
  });
  $('#goalSave').onclick = () => {
    const b = getBook(goalBookId); if (!b) return;
    const sel = document.querySelector('.goal-choice.sel');
    const gtype = sel?.dataset.gtype || 'full';
    const text = gtype === 'personal' ? $('#goalText').value.trim() : '';
    /* A daily page goal is a positive count and can never exceed the book, so
       an empty, zero, negative or non-numeric entry means "no page goal"
       rather than a value that renders as a broken progress track. */
    const entered = Number($('#goalPages').value);
    let pages = Number.isFinite(entered) && entered > 0 ? Math.floor(entered) : null;
    if (pages && b.numPages) pages = Math.min(pages, b.numPages);
    updateBook(goalBookId, { goal: (text || pages) ? { type: gtype, text: text || null, pagesPerDay: pages } : null });
    $('#goalOverlay').hidden = true;
    renderShelf();
    window.dispatchEvent(new CustomEvent('goal-changed'));
  };
  $('#goalClose').onclick = () => { $('#goalOverlay').hidden = true; };
  window.addEventListener('open-goal', e => openGoal(e.detail));
}

/* ── Import book ── */
export function initLibrary() {
  renderShelf();
  initGoal();
  $('#importBtn').onclick = () => $('#bookFile').click();
  const emptyAdd = $('#emptyAdd');
  if (emptyAdd) emptyAdd.onclick = () => $('#bookFile').click();
  $('#bookFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    const id = Date.now() + '';
    await putBook({ id, blob: f });
    books.unshift({
      id, title: f.name.replace(/\.pdf$/i, ''), addedAt: Date.now(),
      numPages: 0, lastPage: 1, cover: '', goal: null, stats: {}, highlights: [], notes: [],
      completedPages: []
    });
    saveMeta(); renderShelf();
    e.target.value = '';
    window.dispatchEvent(new CustomEvent('open-book', { detail: id }));
    setTimeout(() => openGoal(id), 400);
  });
}
