/* ═══ Library: Shelf, Last Read, Goal, Storage ═══ */
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

/* ── IndexedDB for the PDF file ── */
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise((res, rej) => {
    const r = indexedDB.open('daftarche-books', 1);
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

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TRASH = `<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M10 11v6M14 11v6"/></svg>`;
const BOOK_ICON = `<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`;

/* ── Book totals (new notes + old highlights) ── */
function bookTotals(b) {
  let minutes = 0;
  Object.values(b.stats || {}).forEach(s => { minutes += s.minutes || 0; });
  return { minutes, notes: (b.highlights || []).length + (b.notes || []).length };
}

/* ── Shelf + last read ── */
export function renderShelf() {
  const grid = $('#shelfGrid');
  grid.innerHTML = '';
  $('#shelfEmpty').hidden = books.length > 0;
  const cnt = $('#shelfCount');
  if (cnt) cnt.textContent = books.length ? `${faNum(books.length)} کتاب` : 'خالی';

  /* Last-read card */
  const slot = $('#lastReadSlot');
  slot.innerHTML = '';
  const last = [...books].filter(b => b.numPages && (b.lastPage || 1) > 1).sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0))[0];
  if (last) {
    const pct = Math.round(((last.lastPage || 1) / last.numPages) * 100);
    const t = bookTotals(last);
    const card = document.createElement('div');
    card.className = 'lastread';
    card.innerHTML = `
      ${last.cover ? `<img src="${last.cover}" alt="">` : ''}
      <div class="lr-info">
        <div class="lr-top"><span class="lr-title">${esc(last.title)}</span><span class="lr-pct">${faNum(pct)}٪</span></div>
        <div class="lr-track"><i style="width:${pct}%"></i></div>
        <span class="lr-sub">صفحهٔ ${faNum(last.lastPage || 1)} از ${faNum(last.numPages)} · ${faNum(t.minutes)} دقیقه · ${faNum(t.notes)} یادداشت</span>
      </div>
      <button class="lr-btn">ادامه مطالعه</button>`;
    card.addEventListener('click', () => window.dispatchEvent(new CustomEvent('open-book', { detail: last.id })));
    slot.appendChild(card);
  }

  /* Shelf cards */
  books.forEach((b, i) => {
    const pct = b.numPages ? Math.round(((b.lastPage || 1) / b.numPages) * 100) : 0;
    const t = bookTotals(b);
    const card = document.createElement('div');
    card.className = 'book-card';
    card.style.animationDelay = (i * 60) + 'ms';
    card.innerHTML = `
      <div class="book-cover">
        ${b.cover ? `<img src="${b.cover}" alt="">` : BOOK_ICON}
        <span class="book-prog" style="width:${pct}%"></span>
        ${pct > 0 ? `<span class="book-pct-badge">${faNum(pct)}٪</span>` : ''}
      </div>
      <div class="book-title">${esc(b.title)}</div>
      <div class="book-meta">
        <span>${b.numPages ? `${faNum(b.lastPage || 1)} از ${faNum(b.numPages)} ص` : 'خوانده نشده'}</span>
        ${t.minutes ? `<span>· ${faNum(t.minutes)} دقیقه</span>` : ''}
        ${t.notes ? `<span>· ${faNum(t.notes)} یادداشت</span>` : ''}
      </div>
      <div class="book-actions">
        <button class="b-go" data-act="open">${(b.lastPage || 1) > 1 ? 'ادامه' : 'شروع'}</button>
        <button class="b-ghost" data-act="goal">هدف</button>
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
    grid.appendChild(card);
  });
}

/* ── Daily goal ── */
let goalBookId = null;
export function openGoal(id) {
  goalBookId = id;
  const b = getBook(id);
  $('#goalPages').value = b.goal?.pagesPerDay || '';
  $('#goalOverlay').hidden = false;
}
function initGoal() {
  $('#goalSave').onclick = () => {
    const v = parseInt($('#goalPages').value);
    updateBook(goalBookId, { goal: v ? { pagesPerDay: v } : null });
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
  $('#bookFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    const id = Date.now() + '';
    await putBook({ id, blob: f });
    books.unshift({
      id, title: f.name.replace(/\.pdf$/i, ''), addedAt: Date.now(),
      numPages: 0, lastPage: 1, cover: '', goal: null, stats: {}, highlights: [], notes: []
    });
    saveMeta(); renderShelf();
    e.target.value = '';
    window.dispatchEvent(new CustomEvent('open-book', { detail: id }));
  });
}