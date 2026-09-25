/* ═══ Profile: Photo, Character, Stats, Badges, Settings ═══
   The page holds two separate identities (see below) and rebuilds nothing that
   has not changed: every render used to replace the character sprite, the four
   stat chips and the six badges with identical markup, which is visible as a
   blink on a theme flip or a rename. */
import { $, faNum, dayKey } from './utils.js';
import { state } from './state.js';
import { markThemePicker } from './theme.js';
import { getBooks, clearLibraryData } from './library.js';
import { clearUserAudioData } from './audio.js';
import { QORQORI_AVATAR, qorqoriMarkup } from './qorqori.js';
import { RIZOLO_AVATAR, rizoloMarkup } from './rizolo.js';
import { KHABALO_AVATAR, khabaloMarkup } from './khabalo.js';
import { FEKRBAZ_AVATAR, fekrbazMarkup } from './fekrbaz.js';
import { JINGOOL_AVATAR, jingoolMarkup } from './jingool.js';
import { APP_VERSION } from './changelog.js';

const AV_KEY = 'daftarche-avatar';
const PHOTO_KEY = 'daftarche-photo';
const SEEN_KEY = 'daftarche-firstseen';

/* ═══ Two identities, deliberately kept apart ═══
   · «کاراکتر» — the companion the user picks, and the app's own voice: it is
     the one that greets on the Today hero, waits in Focus and reacts to a
     finished list. Choosing one never touches the photo.
   · «عکس پروفایل» — an optional picture of the person themselves. It never
     replaces the companion; it is the face the interface greets them with (the
     header button and the profile circle), and it stays on this device only.
   Both live in localStorage under their own key, so clearing one leaves the
   other exactly where it was. */

/* ═══ Daftarche's Five Characters (Defined Here — No External Dependency) ═══
   Only these five exist in the character system. Any stored value that is not
   one of them (old human avatars, legacy photo uploads, unknown ids)
   resolves to Qorqori. */
const AVATARS = [
  {
    id: 'qorqori', name: 'قورقوری',
    svg: QORQORI_AVATAR
  },
  {
    id: 'rizolo', name: 'ریزولو',
    svg: RIZOLO_AVATAR
  },
  {
    id: 'khabalo', name: 'خوابالو',
    svg: KHABALO_AVATAR
  },
  {
    id: 'fekrbaz', name: 'فکرباز',
    svg: FEKRBAZ_AVATAR
  },
  {
    id: 'jingool', name: 'جینگول',
    svg: JINGOOL_AVATAR
  },
];

/* ── Character (read once, then kept in memory) ──
   Storage used to be parsed on every call — and write back a corrected value
   when it did not recognise one — and it is read once per header button on
   every profile render. It is a choice that changes only when the user makes
   it, so it is loaded once and the answer is reused. */
let charCache = null;

export function getAvatar() {
  if (charCache) return charCache;
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(AV_KEY)); } catch { /* malformed value */ }
  if (stored && typeof stored === 'object' && stored.type === 'char' && AVATARS.some(x => x.id === stored.id)) {
    charCache = stored;
  } else {
    // Stale/unknown stored avatar (removed human avatars, old photos, bad data) → Qorqori.
    charCache = { type: 'char', id: 'qorqori' };
    try { localStorage.setItem(AV_KEY, JSON.stringify(charCache)); } catch { /* storage unavailable */ }
  }
  return charCache;
}

function setAvatar(a) {
  charCache = a;
  try { localStorage.setItem(AV_KEY, JSON.stringify(a)); } catch { /* storage unavailable */ }
  renderProfile();
}

const charOf = a => AVATARS.find(x => x.id === a.id) || AVATARS[0];

/* The chosen companion, as a self-contained bust. Surfaces that cannot resolve
   the sprite file — the share card paints it onto a canvas — need the SVG
   itself rather than a <use> reference into an external file. */
export const currentChar = () => charOf(getAvatar());

/* ── Profile photo (downscaled once, on the way in) ──
   A phone photo is megabytes; localStorage holds a few. So the file is decoded,
   centre-cropped to a square and re-encoded once at upload time, and only the
   small square is ever stored or painted. The data URL is kept in memory too,
   so rendering the profile never re-reads (or re-decodes) it. */
const PHOTO_EDGE = 256;      // stored square edge — plenty for 104px at 2x
const PHOTO_QUALITY = 0.82;  // JPEG: universally encodable, and this is a photo
const PHOTO_MAX_BYTES = 20e6;

let photoCache;

export function getPhoto() {
  if (photoCache === undefined) {
    try { photoCache = localStorage.getItem(PHOTO_KEY) || ''; } catch { photoCache = ''; }
  }
  return photoCache;
}

/* Returns false when the picture could not be persisted (storage full or
   unavailable) — it is still shown for this session, and the page says so
   rather than pretending it was saved. */
function setPhoto(url) {
  photoCache = url || '';
  let saved = true;
  try {
    if (photoCache) localStorage.setItem(PHOTO_KEY, photoCache);
    else localStorage.removeItem(PHOTO_KEY);
  } catch { saved = false; }
  renderProfile();
  return saved;
}

/* EXIF orientation is honoured where the browser can do it directly: a photo
   taken sideways must not arrive on its side. createImageBitmap is the fast and
   orientation-aware path; the <img> path is the fallback. */
async function decodeImage(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { /* fall through to the <img> path */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

/* File → small square data URL. Throws when the file cannot be decoded; the
   caller turns that into a plain sentence for the user. */
async function photoFromFile(file) {
  const bmp = await decodeImage(file);
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
  if (!w || !h) throw new Error('no pixels');
  const crop = Math.min(w, h);
  const size = Math.min(PHOTO_EDGE, crop);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Centre square crop, then cover — a portrait photo keeps its middle.
  ctx.drawImage(bmp, (w - crop) / 2, (h - crop) / 2, crop, crop, 0, 0, size, size);
  if (bmp.close) bmp.close();
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
}

/* The invitation the empty circle shows. The circle itself is the action, so
   it carries no pen badge in this state. */
const PHOTO_PLACEHOLDER = '<svg class="ph-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 016.5 6h1.1l1-1.6h6.8l1 1.6h1.1A2.5 2.5 0 0120 8.5v8A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5z"/><circle cx="12" cy="12.6" r="3.2"/></svg><span class="ph-txt">عکس پروفایل</span>';

function calcStreak() {
  const set = new Set(state.history);
  let s = 0;
  const d = new Date();
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (set.has(dayKey(d))) { s++; d.setDate(d.getDate() - 1); }
  return s;
}

/* ═══ Identity: painted only when it changes ═══
   The companion sprite and the photo are the two heaviest things on this page,
   and neither changes between renders. Writing them out again on every render
   also made the avatar blink whenever something unrelated updated the page
   (a theme flip, a rename). One signature covers both: the chosen character id
   and whether a photo is set. */
const CHAR_INFO = {
  qorqori: { mark: qorqoriMarkup('default'), name: 'قورقوری', sub: 'همدم دَفتَرچه' },
  rizolo: { mark: rizoloMarkup('default'), name: 'ریزولو', sub: 'دوستِ شروع‌های کوچک' },
  khabalo: { mark: khabaloMarkup('default'), name: 'خوابالو', sub: 'دوستِ روزهای آروم' },
  fekrbaz: { mark: fekrbazMarkup('default'), name: 'فکرباز', sub: 'دوستِ لحظه‌های تمرکز' },
  jingool: { mark: jingoolMarkup('default'), name: 'جینگول', sub: 'دوستِ لحظه‌های خوب' },
};

let lastIdentity = null;

function renderIdentity() {
  const photo = getPhoto();
  const av = charOf(getAvatar());
  const sig = (photo ? 'photo' : 'char') + ':' + av.id;
  if (sig === lastIdentity) return;
  lastIdentity = sig;

  /* A picture is painted from a real <img> element rather than interpolated
     into markup: it is the only user content that reaches this DOM, and an
     element never has to be escaped. */
  const paintFace = el => {
    if (!photo) { el.innerHTML = av.svg; return; }
    const img = document.createElement('img');
    img.src = photo;
    img.alt = '';
    el.replaceChildren(img);
  };

  /* Header: the person's own face when they have one, the companion otherwise.
     The companion is not lost by this — it greets from every page it lives on
     (the Today hero, Focus, the insights). */
  document.querySelectorAll('.header-avatar').forEach(paintFace);

  const big = $('#avatarBig');
  if (big) {
    if (photo) paintFace(big); else big.innerHTML = PHOTO_PLACEHOLDER;
    big.classList.toggle('has-photo', !!photo);
    big.classList.toggle('empty', !photo);
    big.setAttribute('aria-label', photo ? 'تغییر عکس پروفایل' : 'افزودن عکس پروفایل');
  }
  const rm = $('#photoRemove');
  if (rm) rm.hidden = !photo;

  /* The character card answers to the character alone. */
  const info = CHAR_INFO[av.id] || CHAR_INFO.qorqori;
  const ct = $('#charThumb');
  if (ct) ct.innerHTML = info.mark;
  const idName = $('#charName'); if (idName) idName.textContent = info.name;
  const idSub = $('#charSub'); if (idSub) idSub.textContent = info.sub;
}

export function renderProfile() {
  renderIdentity();
  /* A choice made in the picker is reflected on the tiles it was made on. The
     grid is built once, so it never redraws itself — without this line the new
     character would reach the card but not the tile it was chosen on. */
  syncGridSelection();
  const name = $('#profileName'); if (name) name.textContent = state.userName || 'بدون اسم';

  if (!localStorage.getItem(SEEN_KEY)) localStorage.setItem(SEEN_KEY, dayKey(new Date()));
  const sub = $('#profileSub');
  if (sub) {
    const d = new Date(localStorage.getItem(SEEN_KEY) + 'T00:00:00');
    sub.textContent = 'عضو دفترچه از ' + d.toLocaleDateString('fa-IR', { month: 'long', year: 'numeric' });
  }

  /* The numbers the badges are earned from. The profile itself no longer prints
     them as four chips: «آمار من» opens the page that tells the whole story. */
  const done = state.tasks.filter(t => t.done).length;
  const streak = calcStreak();
  const books = getBooks();
  let minutes = 0, notesCount = 0;
  books.forEach(b => {
    // Count both old highlights and new per-page notes
    notesCount += (b.highlights || []).length + (b.notes || []).length;
    Object.values(b.stats || {}).forEach(s => minutes += s.minutes || 0);
  });
  /* Badges */
  const B = [
    { label: 'اولین تیک', desc: 'یه کار رو تموم کن', ok: done >= 1, icon: '<path d="M20 6L9 17l-5-5"/>' },
    { label: 'ده‌تایی', desc: '۱۰ کار انجام‌شده', ok: done >= 10, icon: '<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>' },
    { label: 'سه روز پیاپی', desc: '۳ روز پشت‌سرهم', ok: streak >= 3, icon: '<path d="M12 2c1.2 3-.3 4.9-1.7 6.6C8.9 10.3 8 11.9 8 13.8a4.5 4.5 0 009 0c0-1.9-.9-3.5-2.3-5.2C13.3 6.9 11.8 5 12 2z"/>' },
    { label: 'کتاب‌خوان', desc: 'یه کتاب اضافه کن', ok: books.length >= 1, icon: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>' },
    { label: 'یادگار', desc: 'اولین یادداشت', ok: notesCount >= 1, icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>' },
    { label: 'اهل تمرکز', desc: '۱۰ دقیقه مطالعه', ok: minutes >= 10, icon: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>' },
  ];
  /* Six SVGs and twelve strings per render, for a board that changes only when
     one is earned. The signature is the answer to "has anything been unlocked
     since last time", so an unchanged board is left alone (and its one-time
     unlock animation is not replayed on every visit). */
  const bw = $('#badges');
  const badgeSig = B.map(b => (b.ok ? '1' : '0')).join('');
  if (bw && bw.dataset.sig !== badgeSig) {
    bw.dataset.sig = badgeSig;
    bw.innerHTML = B.map(b =>
      `<div class="badge ${b.ok ? 'unlocked' : 'locked'}"><svg viewBox="0 0 24 24">${b.icon}</svg><b>${b.label}</b><span>${b.ok ? 'باز شد!' : b.desc}</span></div>`
    ).join('');
  }

  /* Settings */
  markThemePicker();
  const pm = $('#profPomo'); if (pm) pm.textContent = faNum(state.pomoMin) + ' دقیقه';
  /* The release number alone — the row it sits in is already labelled «نسخه»
     (index.html), so the cell must not say the word twice. Persian digits,
     "2.0.0" → "۲.۰". The number comes from js/version.js; without that file
     the cell is left empty rather than showing a wrong version. */
  const pv = $('#profVersion');
  if (pv && APP_VERSION) pv.textContent = APP_VERSION.split('.').slice(0, 2).join('.').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

/* ═══ Character grid ═══
   Built once, then only the highlight moves. The picker used to be rebuilt on
   every open — five character sprites re-parsed and five listeners re-created
   each time — and because the whole grid was replaced, the newly chosen tile
   could not keep its halo. Now the tiles are made once, in one fragment, and
   one delegated listener answers for all of them.

   Semantics follow a radio group: exactly one item is checked, the checked one
   is the only stop in the tab order, and the arrow keys move the choice.

   The choice is staged, not applied. Tapping a tile (or arrowing onto it) only
   moves the highlight; the «انتخاب» button under the grid commits it. That is
   what makes the button mean something: before it existed, brushing a tile
   with a fingertip on the way past already changed the companion, and there was
   no way to look at the list without committing to whatever was touched. */

/* The staged pick while the dialog is open. null means "nothing staged — the
   saved character is the answer", which is also the state every close returns
   to: an unconfirmed choice is dropped, not saved. */
let stagedId = null;

const shownId = () => stagedId || getAvatar().id;

function stageChar(id) {
  if (!id || !AVATARS.some(a => a.id === id)) return;
  stagedId = id;
  syncGridSelection();
  syncApply();
}

/* The button is live exactly while there is something to confirm — a change
   waiting. On open there is none, and a no-op save would only pretend. */
function syncApply() {
  const btn = $('#avatarApply');
  if (btn) btn.disabled = stagedId === null || stagedId === getAvatar().id;
}

function buildGrid() {
  const g = $('#avatarGrid'); if (!g) return;

  if (!g.dataset.built) {
    const frag = document.createDocumentFragment();
    AVATARS.forEach(av => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'avatar-opt';
      b.dataset.id = av.id;
      b.setAttribute('role', 'radio');
      /* The name is part of the choice, so the button announces it instead of
         relying on the visible label alone. */
      b.setAttribute('aria-label', `کاراکتر ${av.name}`);
      b.innerHTML = av.svg + `<span>${av.name}</span>`;
      frag.appendChild(b);
    });
    g.replaceChildren(frag);
    g.dataset.built = '1';

    g.addEventListener('click', e => {
      const b = e.target.closest('.avatar-opt');
      if (b) stageChar(b.dataset.id);
    });

    /* Choosing is moving: the arrow that reaches a tile also stages it, the
       way a radio group behaves. The horizontal pair follows the writing
       direction, so "next" is the same side of the list in RTL and LTR. */
    g.addEventListener('keydown', e => {
      const rtl = getComputedStyle(g).direction === 'rtl';
      let step = 0;
      if (e.key === 'ArrowDown') step = 1;
      else if (e.key === 'ArrowUp') step = -1;
      else if (e.key === 'ArrowRight') step = rtl ? -1 : 1;
      else if (e.key === 'ArrowLeft') step = rtl ? 1 : -1;
      else return;
      e.preventDefault();
      const tiles = [...g.querySelectorAll('.avatar-opt')];
      const i = tiles.findIndex(t => t.getAttribute('aria-checked') === 'true');
      const next = tiles[((i < 0 ? 0 : i) + step + tiles.length) % tiles.length];
      next.focus();
      stageChar(next.dataset.id);
    });
  }

  syncGridSelection();
}

function syncGridSelection() {
  const g = $('#avatarGrid'); if (!g) return;
  const cur = shownId();
  g.querySelectorAll('.avatar-opt').forEach(b => {
    const on = b.dataset.id === cur;
    b.classList.toggle('sel', on);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
    // The picker's entry point for the shared focus trap (see js/modal.js)
    if (on) b.setAttribute('data-autofocus', '');
    else b.removeAttribute('data-autofocus');
  });
}

function openCharPicker() {
  buildGrid();
  /* Every open starts from what is actually saved: a choice abandoned last
     time is not resurrected. */
  stagedId = null;
  syncGridSelection();
  syncApply();
  const ao = $('#avatarOverlay');
  if (ao) ao.hidden = false;
  /* Focus and the Tab loop belong to the shared containment (js/modal.js). The
     tile marked data-autofocus in syncGridSelection is where it puts focus, so
     a keyboard user starts on the character they already have and the arrow
     keys carry on from there. */
}

/* Closing hands focus back to the card that opened the picker, so the keyboard
   journey is a round trip instead of a dead end behind a closed dialog. */
function closeCharPicker(commit = false) {
  const ao = $('#avatarOverlay');
  if (!ao || ao.hidden) return;
  /* Read the staged value before it is cleared — the save repaints the card,
     the grid and the header face in one go. */
  const pick = stagedId;
  stagedId = null;
  ao.hidden = true;
  if (commit && pick && pick !== getAvatar().id) setAvatar({ type: 'char', id: pick });
  else syncGridSelection();
  syncApply();
  $('#charIdentity')?.focus();
}

export function initProfile() {
  document.querySelectorAll('.header-avatar').forEach(ha => {
    ha.onclick = () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'profile' }));
  });

  $('#openStatsBtn')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'stats' })));

  /* ═══ Profile photo ═══
     The circle opens the file picker; the input itself stays hidden and out of
     the tab order, so the control is met once and as a button. */
  const big = $('#avatarBig');
  const photoInput = $('#photoInput');
  const hint = $('#photoHint');
  let hintTimer = null;

  const say = msg => {
    if (!hint) return;
    hint.textContent = msg;
    hint.hidden = !msg;
    clearTimeout(hintTimer);
    if (msg) hintTimer = setTimeout(() => { hint.hidden = true; }, 4000);
  };

  if (big && photoInput) big.onclick = () => photoInput.click();
  photoInput?.addEventListener('change', async () => {
    const file = photoInput.files && photoInput.files[0];
    // Reset so picking the same file twice still fires a change
    photoInput.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { say('این فایل عکسی نیست.'); return; }
    if (file.size > PHOTO_MAX_BYTES) { say('این عکس خیلی حجیمه؛ یه عکس کوچیک‌تر انتخاب کن.'); return; }
    try {
      const saved = setPhoto(await photoFromFile(file));
      say(saved ? '' : 'عکس ذخیره نشد — حافظهٔ مرورگر پر است.');
    } catch {
      say('این عکس خونده نشد؛ یه عکس دیگه امتحان کن.');
    }
  });
  $('#photoRemove')?.addEventListener('click', () => { setPhoto(''); say(''); });

  /* ═══ Character picker ═══
     Opened from the identity card — a different door than the photo's, and it
     never touches the photo. */
  $('#charIdentity')?.addEventListener('click', openCharPicker);
  const ao = $('#avatarOverlay');
  const close = $('#avatarClose');
  /* Both buttons run through the one closer: «انتخاب» commits the staged pick,
     «بستن» — like Escape and the scrim — throws it away. */
  if (close) close.onclick = () => closeCharPicker();
  const apply = $('#avatarApply');
  if (apply) apply.onclick = () => closeCharPicker(true);
  ao?.addEventListener('click', e => { if (e.target === e.currentTarget) closeCharPicker(); });
  /* Escape closes the dialog globally (app.js); catching it here as well is what
     returns focus to the identity card once the list is gone. */
  ao?.addEventListener('keydown', e => { if (e.key === 'Escape') closeCharPicker(); });
  $('#profileEditName')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('edit-name')));

  const cl = $('#profClear');
  if (cl) cl.onclick = async () => {
    if (!confirm('همهٔ داده‌ها پاک بشه؟ این کار قابل برگشت نیست.')) return;
    /* localStorage holds tasks, settings and the book metadata; the PDF files
       and the uploaded music live in their own databases and are removed
       explicitly. Both results are awaited before the page leaves, so a wipe
       that could not finish is reported instead of being reloaded away as a
       success. */
    const [booksCleared, audioCleared] = await Promise.all([
      clearLibraryData(),
      clearUserAudioData(),
    ]);
    localStorage.clear();
    if (!booksCleared || !audioCleared) {
      alert('فایل‌های کتاب یا موسیقی پاک نشدن؛ اگه تب دیگه‌ای از دفترچه بازه ببندش و دوباره امتحان کن.');
    }
    location.reload();
  };
}