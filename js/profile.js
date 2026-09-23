/* ═══ Profile: Avatar, Stats, Badges, Settings ═══ */
import { $, faNum, dayKey } from './utils.js';
import { state } from './state.js';
import { saveTheme } from './store.js';
import { getBooks, clearLibraryData } from './library.js';
import { clearUserAudioData } from './audio.js';
import { QORQORI_AVATAR, qorqoriMarkup } from './qorqori.js';
import { RIZOLO_AVATAR, rizoloMarkup } from './rizolo.js';
import { KHABALO_AVATAR, khabaloMarkup } from './khabalo.js';
import { FEKRBAZ_AVATAR, fekrbazMarkup } from './fekrbaz.js';
import { JINGOOL_AVATAR, jingoolMarkup } from './jingool.js';
import { APP_VERSION, openChangelog } from './changelog.js';

const AV_KEY = 'daftarche-avatar';
const SEEN_KEY = 'daftarche-firstseen';

/* ═══ Daftarche's Five Characters (Defined Here — No External Dependency) ═══
   Only these five exist in the avatar system. Any stored value that is not
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

export function getAvatar() {
  try {
    const a = JSON.parse(localStorage.getItem(AV_KEY));
    if (a && typeof a === 'object' && a.type === 'char' && AVATARS.some(x => x.id === a.id)) return a;
  } catch { /* malformed value */ }
  // Stale/unknown stored avatar (removed human avatars, old photos, bad data) → Qorqori.
  const q = { type: 'char', id: 'qorqori' };
  try { localStorage.setItem(AV_KEY, JSON.stringify(q)); } catch { /* storage unavailable */ }
  return q;
}
function setAvatar(a) {
  localStorage.setItem(AV_KEY, JSON.stringify(a));
  renderProfile();
}
function avatarMarkup() {
  const a = getAvatar();
  const av = AVATARS.find(x => x.id === a.id) || AVATARS[0];
  return av.svg;
}

function calcStreak() {
  const set = new Set(state.history);
  let s = 0;
  const d = new Date();
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (set.has(dayKey(d))) { s++; d.setDate(d.getDate() - 1); }
  return s;
}

export function renderProfile() {
  document.querySelectorAll('.header-avatar').forEach(el => { el.innerHTML = avatarMarkup(); });
  const big = $('#avatarBig'); if (big) big.innerHTML = avatarMarkup();
  const name = $('#profileName'); if (name) name.textContent = state.userName || 'بدون اسم';

  /* Character identity: the active Daftarche companion */
  const ct = $('#charThumb');
  if (ct) {
    const cid = getAvatar().id;
    const CHAR_INFO = {
      qorqori: { mark: qorqoriMarkup('default'), name: 'قورقوری', sub: 'همدم دَفتَرچه' },
      rizolo: { mark: rizoloMarkup('default'), name: 'ریزولو', sub: 'دوستِ شروع‌های کوچک' },
      khabalo: { mark: khabaloMarkup('default'), name: 'خوابالو', sub: 'دوستِ روزهای آروم' },
      fekrbaz: { mark: fekrbazMarkup('default'), name: 'فکرباز', sub: 'دوستِ لحظه‌های تمرکز' },
      jingool: { mark: jingoolMarkup('default'), name: 'جینگول', sub: 'دوستِ لحظه‌های خوب' },
    };
    const info = CHAR_INFO[cid] || CHAR_INFO.qorqori;
    ct.innerHTML = info.mark;
    const idName = $('#charName'); if (idName) idName.textContent = info.name;
    const idSub = $('#charSub'); if (idSub) idSub.textContent = info.sub;
  }

  if (!localStorage.getItem(SEEN_KEY)) localStorage.setItem(SEEN_KEY, dayKey(new Date()));
  const sub = $('#profileSub');
  if (sub) {
    const d = new Date(localStorage.getItem(SEEN_KEY) + 'T00:00:00');
    sub.textContent = 'عضو دفترچه از ' + d.toLocaleDateString('fa-IR', { month: 'long', year: 'numeric' });
  }

  /* Stats */
  const done = state.tasks.filter(t => t.done).length;
  const streak = calcStreak();
  const books = getBooks();
  let minutes = 0, notesCount = 0;
  books.forEach(b => {
    // Count both old highlights and new per-page notes
    notesCount += (b.highlights || []).length + (b.notes || []).length;
    Object.values(b.stats || {}).forEach(s => minutes += s.minutes || 0);
  });
  const st = $('#profileStats');
  if (st) st.innerHTML = `
    <div class="stat-chip"><b>${faNum(streak)}</b><span>روز پیاپی</span></div>
    <div class="stat-chip"><b>${faNum(done)}</b><span>کار انجام‌شده</span></div>
    <div class="stat-chip"><b>${faNum(minutes)}</b><span>دقیقه مطالعه</span></div>
    <div class="stat-chip"><b>${faNum(notesCount)}</b><span>یادداشت</span></div>`;

  /* Badges */
  const B = [
    { label: 'اولین تیک', desc: 'یه کار رو تموم کن', ok: done >= 1, icon: '<path d="M20 6L9 17l-5-5"/>' },
    { label: 'ده‌تایی', desc: '۱۰ کار انجام‌شده', ok: done >= 10, icon: '<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>' },
    { label: 'سه روز پیاپی', desc: '۳ روز پشت‌سرهم', ok: streak >= 3, icon: '<path d="M12 2c1.2 3-.3 4.9-1.7 6.6C8.9 10.3 8 11.9 8 13.8a4.5 4.5 0 009 0c0-1.9-.9-3.5-2.3-5.2C13.3 6.9 11.8 5 12 2z"/>' },
    { label: 'کتاب‌خوان', desc: 'یه کتاب اضافه کن', ok: books.length >= 1, icon: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>' },
    { label: 'یادگار', desc: 'اولین یادداشت', ok: notesCount >= 1, icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>' },
    { label: 'اهل تمرکز', desc: '۱۰ دقیقه مطالعه', ok: minutes >= 10, icon: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>' },
  ];
  const bw = $('#badges');
  if (bw) bw.innerHTML = B.map(b =>
    `<div class="badge ${b.ok ? 'unlocked' : 'locked'}"><svg viewBox="0 0 24 24">${b.icon}</svg><b>${b.label}</b><span>${b.ok ? 'باز شد!' : b.desc}</span></div>`
  ).join('');

  /* Settings */
  const th = $('#profTheme'); if (th) th.textContent = document.documentElement.dataset.theme === 'dark' ? 'تاریک' : 'روشن';
  const pm = $('#profPomo'); if (pm) pm.textContent = faNum(state.pomoMin) + ' دقیقه';
  /* Release note label, Persian digits, "2.0.0" → "۲.۰". The release number
     comes from js/version.js; if that file is unavailable the label is left
     as it is rather than showing a wrong version. */
  const pv = $('#profVersion');
  if (pv && APP_VERSION) pv.textContent = 'نسخهٔ ' + APP_VERSION.split('.').slice(0, 2).join('.').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

function buildGrid() {
  const g = $('#avatarGrid'); if (!g) return;
  g.innerHTML = '';
  const cur = getAvatar();
  AVATARS.forEach(av => {
    const b = document.createElement('button');
    b.className = 'avatar-opt' + (cur.id === av.id ? ' sel' : '');
    b.innerHTML = av.svg + `<span>${av.name}</span>`;
    b.onclick = () => setAvatar({ type: 'char', id: av.id });
    g.appendChild(b);
  });
}

export function initProfile() {
  document.querySelectorAll('.header-avatar').forEach(ha => {
    ha.onclick = () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'profile' }));
  });

  $('#openStatsBtn')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'stats' })));

  const big = $('#avatarBig');
  if (big) big.onclick = () => { buildGrid(); const ao = $('#avatarOverlay'); if (ao) ao.hidden = false; };
  const close = $('#avatarClose');
  if (close) close.onclick = () => { $('#avatarOverlay').hidden = true; };
  $('#avatarOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });
  $('#profileEditName')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('edit-name')));

  $('#profChangelog')?.addEventListener('click', () => openChangelog());

  const tb = $('#profThemeBtn');
  if (tb) tb.onclick = () => {
    const n = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = n;
    saveTheme(n);
    renderProfile();
  };
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