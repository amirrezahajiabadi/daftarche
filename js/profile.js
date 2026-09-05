/* ═══ پروفایل: آواتار، آمار، نشان‌ها، تنظیمات ═══ */
import { $, faNum, dayKey } from './utils.js';
import { state } from './state.js';
import { saveTheme } from './store.js';
import { getBooks } from './library.js';

const AV_KEY = 'daftarche-avatar';
const SEEN_KEY = 'daftarche-firstseen';

/* ═══ کارکترهای اختصاصی دَفتَرچه (داخل همین فایل — بدون وابستگی خارجی) ═══ */
const AVATARS = [
  {
    id: 'ava', name: 'آوا',
    svg: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#fde8d7"/><path d="M13 64c2-13 9-19 19-19s17 6 19 19z" fill="#f4703a"/><path d="M18 30c-2 9 0 16 3 20h4c-2-6-2-13-1-18z" fill="#4a3226"/><path d="M46 30c2 9 0 16-3 20h-4c2-6 2-13 1-18z" fill="#4a3226"/><circle cx="32" cy="30" r="13" fill="#ffd9b8"/><path d="M19 29c1-9 6-14 13-14s12 5 13 14c-2-3-4-4-6-4H25c-2 0-4 1-6 4z" fill="#4a3226"/><rect x="20" y="19" width="24" height="4.5" rx="2.2" fill="#f4703a"/><circle cx="27" cy="31" r="1.7" fill="#2e2921"/><circle cx="37" cy="31" r="1.7" fill="#2e2921"/><path d="M28 36.5c1.5 1.6 6.5 1.6 8 0" stroke="#c96f4a" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="23.5" cy="34" r="2.2" fill="#f6a5c0" opacity=".45"/><circle cx="40.5" cy="34" r="2.2" fill="#f6a5c0" opacity=".45"/></svg>`
  },
  {
    id: 'maryam', name: 'مریم',
    svg: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#e8f3e4"/><path d="M13 64c2-13 9-19 19-19s17 6 19 19z" fill="#2f8f83"/><path d="M32 12c-9 0-15 7-15 16 0 10 6 17 15 17s15-7 15-17c0-9-6-16-15-16z" fill="#7fb069"/><path d="M20 40c3 5 7 7 12 7s9-2 12-7l3 9H17z" fill="#6a9c58"/><circle cx="32" cy="30" r="10.5" fill="#f6cfa4"/><path d="M23 26c1-5 4-8 9-8s8 3 9 8c-2-2-5-3-9-3s-7 1-9 3z" fill="#6a9c58"/><circle cx="28" cy="31" r="1.6" fill="#2e2921"/><circle cx="36" cy="31" r="1.6" fill="#2e2921"/><path d="M29 36c1.3 1.4 4.7 1.4 6 0" stroke="#b98a5e" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="25.5" cy="33.5" r="2" fill="#f6a5c0" opacity=".4"/><circle cx="38.5" cy="33.5" r="2" fill="#f6a5c0" opacity=".4"/></svg>`
  },
  {
    id: 'negar', name: 'نگار',
    svg: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#fdeef4"/><path d="M13 64c2-13 9-19 19-19s17 6 19 19z" fill="#ef6f8e"/><circle cx="32" cy="13" r="6" fill="#2e2921"/><circle cx="32" cy="30" r="13" fill="#f2c094"/><path d="M19 30c0-9 6-15 13-15s13 6 13 15c-1-4-3-6-5-6H24c-2 0-4 2-5 6z" fill="#2e2921"/><path d="M19 29c-1 6 0 11 2 14l2-1c-1-4-1-9 0-13z" fill="#2e2921"/><path d="M45 29c1 6 0 11-2 14l-2-1c1-4 1-9 0-13z" fill="#2e2921"/><circle cx="20" cy="37" r="2" fill="#f4703a"/><circle cx="44" cy="37" r="2" fill="#f4703a"/><circle cx="27" cy="31" r="1.7" fill="#2e2921"/><circle cx="37" cy="31" r="1.7" fill="#2e2921"/><path d="M28 36.5c1.5 1.6 6.5 1.6 8 0" stroke="#c96f4a" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="24" cy="34" r="2.2" fill="#ef6f8e" opacity=".4"/><circle cx="40" cy="34" r="2.2" fill="#ef6f8e" opacity=".4"/></svg>`
  },
  {
    id: 'arman', name: 'آرمان',
    svg: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#e8ecf7"/><path d="M13 64c2-13 9-19 19-19s17 6 19 19z" fill="#4e93d8"/><circle cx="32" cy="30" r="13" fill="#ffd9b8"/><path d="M19 28c1-8 6-13 13-13s12 5 13 13c-2-3-5-4-7-4H26c-2 0-5 1-7 4z" fill="#6b4a2f"/><path d="M19 27c-1 4-1 8 0 11l2-1v-9z" fill="#6b4a2f"/><path d="M45 27c1 4 1 8 0 11l-2-1v-9z" fill="#6b4a2f"/><circle cx="27" cy="31" r="4" fill="none" stroke="#2e2921" stroke-width="1.6"/><circle cx="37" cy="31" r="4" fill="none" stroke="#2e2921" stroke-width="1.6"/><path d="M31 31h2" stroke="#2e2921" stroke-width="1.6"/><circle cx="27" cy="31" r="1.4" fill="#2e2921"/><circle cx="37" cy="31" r="1.4" fill="#2e2921"/><path d="M28.5 37.5c1.2 1.2 5.8 1.2 7 0" stroke="#c96f4a" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`
  },
  {
    id: 'kaveh', name: 'کاوه',
    svg: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#fff3d9"/><path d="M13 64c2-13 9-19 19-19s17 6 19 19z" fill="#7fb069"/><circle cx="32" cy="31" r="13" fill="#e8b48a"/><path d="M19 27c0-7 6-12 13-12s13 5 13 12z" fill="#e4584f"/><rect x="17" y="25" width="30" height="4" rx="2" fill="#c93a3a"/><path d="M20 30c-1 4 0 8 1 10l2-1c-1-3-1-6 0-9z" fill="#3b2a1e"/><path d="M44 30c1 4 0 8-1 10l-2-1c1-3 1-6 0-9z" fill="#3b2a1e"/><circle cx="27" cy="32" r="1.7" fill="#2e2921"/><circle cx="37" cy="32" r="1.7" fill="#2e2921"/><path d="M28 37.5c1.5 1.5 6.5 1.5 8 0" stroke="#a5713f" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`
  },
  {
    id: 'bardia', name: 'بردیا',
    svg: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#f0e8fb"/><path d="M13 64c2-13 9-19 19-19s17 6 19 19z" fill="#9a6ff0"/><circle cx="32" cy="30" r="13" fill="#d9a06b"/><circle cx="24" cy="20" r="4" fill="#3b2a1e"/><circle cx="32" cy="17" r="4.5" fill="#3b2a1e"/><circle cx="40" cy="20" r="4" fill="#3b2a1e"/><path d="M20 26c2-4 6-6 12-6s10 2 12 6c-2-1-5-2-12-2s-10 1-12 2z" fill="#3b2a1e"/><path d="M22 34c0 6 4 10 10 10s10-4 10-10c-1 3-2 4-3 4H25c-1 0-2-1-3-4z" fill="#3b2a1e"/><path d="M27 36c1.5 1.5 8.5 1.5 10 0" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".85"/><circle cx="27" cy="30" r="1.7" fill="#2e2921"/><circle cx="37" cy="30" r="1.7" fill="#2e2921"/></svg>`
  },
];

export function getAvatar() {
  try { return JSON.parse(localStorage.getItem(AV_KEY)); } catch { return null; }
}
function setAvatar(a) {
  localStorage.setItem(AV_KEY, JSON.stringify(a));
  renderProfile();
}
function avatarMarkup() {
  const a = getAvatar();
  if (a?.type === 'photo' && a.data) return `<img src="${a.data}" alt="پروفایل">`;
  const av = AVATARS.find(x => x.id === a?.id) || AVATARS[0];
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
  const ha = $('#headerAvatar'); if (ha) ha.innerHTML = avatarMarkup();
  const big = $('#avatarBig'); if (big) big.innerHTML = avatarMarkup();
  const name = $('#profileName'); if (name) name.textContent = state.userName || 'بدون اسم';

  if (!localStorage.getItem(SEEN_KEY)) localStorage.setItem(SEEN_KEY, dayKey(new Date()));
  const sub = $('#profileSub');
  if (sub) {
    const d = new Date(localStorage.getItem(SEEN_KEY) + 'T00:00:00');
    sub.textContent = 'عضو دفترچه از ' + d.toLocaleDateString('fa-IR', { month: 'long', year: 'numeric' });
  }

  /* آمار */
  const done = state.tasks.filter(t => t.done).length;
  const streak = calcStreak();
  const books = getBooks();
  let minutes = 0, highlights = 0;
  books.forEach(b => {
    highlights += (b.highlights || []).length;
    Object.values(b.stats || {}).forEach(s => minutes += s.minutes || 0);
  });
  const st = $('#profileStats');
  if (st) st.innerHTML = `
    <div class="stat-chip"><b>${faNum(streak)}</b><span>روز پیاپی</span></div>
    <div class="stat-chip"><b>${faNum(done)}</b><span>کار انجام‌شده</span></div>
    <div class="stat-chip"><b>${faNum(minutes)}</b><span>دقیقه مطالعه</span></div>
    <div class="stat-chip"><b>${faNum(highlights)}</b><span>هایلایت</span></div>`;

  /* نشان‌ها */
  const B = [
    { label: 'اولین تیک', desc: 'یه کار رو تموم کن', ok: done >= 1, icon: '<path d="M20 6L9 17l-5-5"/>' },
    { label: 'ده‌تایی', desc: '۱۰ کار انجام‌شده', ok: done >= 10, icon: '<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>' },
    { label: 'سه روز پیاپی', desc: '۳ روز پشت‌سرهم', ok: streak >= 3, icon: '<path d="M12 2c1.2 3-.3 4.9-1.7 6.6C8.9 10.3 8 11.9 8 13.8a4.5 4.5 0 009 0c0-1.9-.9-3.5-2.3-5.2C13.3 6.9 11.8 5 12 2z"/>' },
    { label: 'کتاب‌خوان', desc: 'یه کتاب اضافه کن', ok: books.length >= 1, icon: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>' },
    { label: 'یادگار', desc: 'اولین هایلایت', ok: highlights >= 1, icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>' },
    { label: 'اهل تمرکز', desc: '۱۰ دقیقه مطالعه', ok: minutes >= 10, icon: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>' },
  ];
  const bw = $('#badges');
  if (bw) bw.innerHTML = B.map(b =>
    `<div class="badge ${b.ok ? 'unlocked' : 'locked'}"><svg viewBox="0 0 24 24">${b.icon}</svg><b>${b.label}</b><span>${b.ok ? 'باز شد!' : b.desc}</span></div>`
  ).join('');

  /* تنظیمات */
  const th = $('#profTheme'); if (th) th.textContent = document.documentElement.dataset.theme === 'dark' ? 'تاریک' : 'روشن';
  const pm = $('#profPomo'); if (pm) pm.textContent = faNum(state.pomoMin) + ' دقیقه';
}

function buildGrid() {
  const g = $('#avatarGrid'); if (!g) return;
  g.innerHTML = '';
  const cur = getAvatar();
  AVATARS.forEach(av => {
    const b = document.createElement('button');
    b.className = 'avatar-opt' + ((cur?.type !== 'photo' && cur?.id === av.id) ? ' sel' : '');
    b.innerHTML = av.svg + `<span>${av.name}</span>`;
    b.onclick = () => setAvatar({ type: 'char', id: av.id });
    g.appendChild(b);
  });
}

function onPhoto(f) {
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onload = () => {
    const s = 160, c = document.createElement('canvas');
    c.width = s; c.height = s;
    const ctx = c.getContext('2d');
    const m = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
    setAvatar({ type: 'photo', data: c.toDataURL('image/jpeg', .8) });
    URL.revokeObjectURL(url);
    const ao = $('#avatarOverlay'); if (ao) ao.hidden = true;
  };
  img.src = url;
}

export function initProfile() {
  const ha = $('#headerAvatar');
  if (ha) ha.onclick = () => document.querySelector('[data-page="profile"]')?.click();

  const big = $('#avatarBig');
  if (big) big.onclick = () => { buildGrid(); const ao = $('#avatarOverlay'); if (ao) ao.hidden = false; };
  const close = $('#avatarClose');
  if (close) close.onclick = () => { $('#avatarOverlay').hidden = true; };
  $('#avatarOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });
  $('#avatarFile')?.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    onPhoto(f);
    e.target.value = '';
  });

  $('#profileEditName')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('edit-name')));

  const tb = $('#profThemeBtn');
  if (tb) tb.onclick = () => {
    const n = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = n;
    saveTheme(n);
    renderProfile();
  };
  const cl = $('#profClear');
  if (cl) cl.onclick = () => {
    if (confirm('همهٔ داده‌ها پاک بشه؟ این کار قابل برگشت نیست.')) {
      localStorage.clear();
      location.reload();
    }
  };
}