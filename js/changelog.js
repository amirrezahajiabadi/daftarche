/* ═══ What's New — changelog engine ═══
   The changelog entries live here, decoupled from the rest of the app. Adding
   a release means appending one object to CHANGELOG and moving the release
   number in js/version.js — nothing else needs to change. The engine compares
   that number with the last one the user acknowledged (localStorage) and shows
   the dialog once.

   The release number is read from js/version.js, the same single file the
   service worker loads, so the dialog and the offline build cannot drift. If
   it is unavailable the running release is unknown and the dialog stays shut. */

export const APP_VERSION = self.DAFTARCHE_RELEASE || '';

export const CHANGELOG = [
  {
    version: '2.0.0',
    date: 'شهریور ۱۴۰۵',
    title: 'تغییرات نسخه جدید',
    highlights: [
      { icon: '🎨', text: 'دفترچه حالا چهرهٔ تازه‌ای داره' },
      { icon: '👆', text: 'دکمه‌ها روی گوشی راحت‌تر لمس می‌شن' },
      { icon: '📓', text: 'انتخاب کار توی تمرکز حالا مثل یه دفترچه باز و بسته می‌شه' },
      { icon: '🌗', text: 'حالت تاریک شب‌ها چشم‌نوازتر شد' },
    ],
  },
];

const SEEN_KEY = 'daftarche-seen-version';

/* ── rendering ─────────────────────────────────────────────────────────── */

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function entryHtml(entry) {
  const items = entry.highlights.map(h =>
    `<li class="changelog-item"><span class="changelog-icon" aria-hidden="true">${esc(h.icon)}</span><span>${esc(h.text)}</span></li>`
  ).join('');
  return `
    <div class="changelog-entry">
      <div class="changelog-ver"><b>نسخهٔ ${esc(faVer(entry.version))}</b><span>${esc(entry.date)}</span></div>
      <h3 class="changelog-title">${esc(entry.title)}</h3>
      <ul class="changelog-list">${items}</ul>
    </div>`;
}

/* "2.0.0" → "۲.۰" — Persian digits, minor-and-patch folded so the label
   reads like a release name, not a build number */
function faVer(v) {
  const parts = v.split('.');
  return (parts[0] + '.' + (parts[1] || '0')).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

/* ── dialog lifecycle ──────────────────────────────────────────────────── */

let overlay = null;
let cleanup = null;
let lastFocus = null;

function build() {
  overlay = document.createElement('div');
  overlay.className = 'overlay changelog-overlay';
  overlay.id = 'changelogOverlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="name-card changelog-card" role="dialog" aria-modal="true" aria-labelledby="changelogTitle">
      <span class="badge" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>
      </span>
      <h2 id="changelogTitle">چی تغییر کرد؟</h2>
      <p class="changelog-sub">این چیزا تازه به دَفتَرچه اضافه شدن</p>
      <div class="changelog-body">${CHANGELOG.map(entryHtml).join('')}</div>
      <button class="go" id="changelogOk">فهمیدم</button>
    </div>`;
  document.body.appendChild(overlay);
}

/* Trap Tab inside the dialog while it is open */
function trapTab(e) {
  if (e.key !== 'Tab' || !overlay || overlay.hidden) return;
  const focusables = overlay.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
  else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
}

function close() {
  if (!overlay) return;
  overlay.hidden = true;
  if (cleanup) { cleanup(); cleanup = null; }
  document.body.classList.remove('no-scroll');
  if (lastFocus) { lastFocus.focus(); lastFocus = null; }
  if (APP_VERSION) {
    try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch (e) { /* storage unavailable: dialog just reappears next visit */ }
  }
}

export function openChangelog() {
  if (!overlay) build();
  if (!overlay.hidden) return;
  overlay.hidden = false;
  document.body.classList.add('no-scroll');
  lastFocus = document.activeElement;

  const ok = overlay.querySelector('#changelogOk');
  const onBackdrop = e => { if (e.target === overlay) close(); };
  const onKey = e => { if (e.key === 'Escape' && !overlay.hidden) close(); };
  overlay.addEventListener('click', onBackdrop);
  document.addEventListener('keydown', onKey);
  ok.addEventListener('click', close);
  cleanup = () => {
    overlay.removeEventListener('click', onBackdrop);
    document.removeEventListener('keydown', onKey);
    ok.removeEventListener('click', close);
  };
  /* keep the focus loop working while open */
  document.addEventListener('keydown', trapTab);
  const origCleanup = cleanup;
  cleanup = () => { origCleanup(); document.removeEventListener('keydown', trapTab); };

  setTimeout(() => ok.focus(), 80);
}

/* ── boot check ────────────────────────────────────────────────────────── */

/* Auto-open once per release, a beat after boot so the first paint stays
   calm (no CLS, no layout thrash while the shell settles). */
export function initChangelogCheck() {
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); } catch (e) { /* fall through: show */ }
  if (!APP_VERSION || seen === APP_VERSION) return;
  setTimeout(() => openChangelog(), 600);
}
