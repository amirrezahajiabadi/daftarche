/* ═══ What's New — changelog engine ═══
   The changelog entries live here, decoupled from the rest of the app. Adding
   a release means appending one object to CHANGELOG and moving the release
   number in js/version.js — nothing else needs to change. The engine compares
   that number with the last one the user acknowledged (localStorage) and shows
   the dialog once.

   This dialog speaks to one reader only: the one who was here for the release
   before this one. It has no button of its own anywhere in the interface — it
   is opened by the boot check below and by nothing else — so the copy is
   written as a short note home, in the app's own voice, and not as release
   notes.

   The release number is read from js/version.js, the same single file the
   service worker loads, so the dialog and the offline build cannot drift. If
   it is unavailable the running release is unknown and the dialog stays shut. */

export const APP_VERSION = self.DAFTARCHE_RELEASE || '';

export const CHANGELOG = [
  {
    version: '2.0.0',
    date: 'شهریور ۱۴۰۵',
    title: 'دفترچه یه سر و شکل تازه گرفت',
    highlights: [
      { icon: '🎨', text: 'رنگ و روش عوض شد؛ همون دفترچه، خوشگل‌تر' },
      { icon: '👆', text: 'دکمه‌ها درست شدن که روی گوشی راحت لمس شن' },
      { icon: '📓', text: 'توی تمرکز، انتخاب کار مثل یه دفترچه باز و بسته می‌شه' },
      { icon: '🌗', text: 'شب‌ها حالت تاریک چشم رو اذیت نمی‌کنه' },
    ],
  },
  {
    version: '2.1.0',
    date: 'مهر ۱۴۰۵',
    title: 'آمار دفترچه یه صفحهٔ کامل شد',
    highlights: [
      { icon: '📊', text: 'آمارت رو از هفت روز تا یه سال کامل میتونی ببینی' },
      { icon: '🔎', text: 'بینش‌ها هم رفتن توی همون صفحه، با یه پیشنهاد برای دفعهٔ بعد' },
      { icon: '🖼️', text: 'از آمارت یه کارت مربعی خوشگل بساز و بفرست برای رفقا' },
      { icon: '🧹', text: 'پروفایل خلوت‌تر شد؛ همهٔ آمار از یه دَر باز می‌شه' },
      { icon: '🕰️', text: 'پیام بهروزرسانی و یادآورها دیگه وسط کارت نمی‌افتن' },
    ],
  },
  {
    version: '2.1.1',
    date: 'مهر ۱۴۰۵',
    title: 'آمار روان‌تر و کارت مرتب‌تر',
    highlights: [
      { icon: '🕰️', text: 'سابقهٔ تمرکز هم رفت لای آمار و با همون بازه‌ای می‌آد که انتخاب می‌کنی' },
      { icon: '✨', text: 'بخش‌های آمار نرم‌تر پر می‌شن و بین بازه‌ها روان جابه‌جا می‌شی' },
      { icon: '🖼️', text: 'کارت آماری که می‌فرستی، مرتب‌تر و خواناتر شد' },
      { icon: '🧭', text: 'هر بخش سر جای خودش نشسته و صفحه سریع‌تر جواب می‌ده' },
    ],
  },
  {
    version: '2.1.2',
    date: 'مهر ۱۴۰۵',
    title: 'راه بازگشت، همه‌جا',
    highlights: [
      { icon: '↩️', text: 'توی صفحهٔ آمار و پروفایل، یه راه برگشت به صفحهٔ قبل هست' },
      { icon: '📱', text: 'دکمهٔ برگشت گوشی هم دیگه یهو از اپ بیرونت نمی‌بره' },
      { icon: '🧭', text: 'اگه وسط یه پنجره باشی، برگشت اول همون رو می‌بنده' },
    ],
  },
  {
    version: '2.1.3',
    date: 'مهر ۱۴۰۵',
    title: 'کارت آمار، خوش‌دست‌تر',
    highlights: [
      { icon: '🪟', text: 'پنجرهٔ کارت جمع‌وجور شد، وسط صفحه می‌آد و پشتش مات می‌شه' },
      { icon: '📐', text: 'چیدمان کارت متقارن شد؛ هر بخش روی محور وسطش می‌نیشینه' },
      { icon: '🖼️', text: 'روی کارت اول عکس پروفایلت میاد و اگه نداشته باشی، همدمت' },
      { icon: '🏷️', text: 'کارت حالا زنجیره، روزهای فعال و بیشترین و کمترین دسته رو هم نشون می‌ده' },
      { icon: '📅', text: 'تاریخ بازه کامل و بدون جداکننده نوشته می‌شه' },
    ],
  },
  {
    version: '2.2.0',
    date: 'مهر ۱۴۰۵',
    title: 'کارت آمار، سلیقه‌ای شد',
    highlights: [
      { icon: '🎨', text: 'رنگ کارت رو خودت انتخاب می‌کنی: از تم خود دفترچه تا کاغذ، شب و جنگل' },
      { icon: '📐', text: 'شکل کارت هم دست خودته: کلاسیک، فشرده، یا شاخص با اون عدد بزرگ' },
      { icon: '👀', text: 'هر انتخابی که می‌کنی، همون لحظه روی پیش‌نمایش کارت می‌بینی' },
      { icon: '💾', text: 'قالب انتخابی یادت می‌مونه؛ دفعه بعد لازم نیست دوباره بچینی' },
    ],
  },
  {
    version: '2.3.0',
    date: 'مهر ۱۴۰۵',
    title: 'دفترچه، چهار رنگ پوشید',
    highlights: [
      { icon: '🎨', text: 'رنگ دفترچه رو خودت انتخاب می‌کنی: روشن، کاغذ، شب و جنگل' },
      { icon: '🔘', text: 'از تنظیمات پروفایل، با یک ردیف دکمه که خودش رنگش رو نشون می‌ده' },
      { icon: '🌙', text: 'دکمهٔ بالای صفحه هم مثل قبل سریع بین روشن و شب جابه‌جا می‌کنه' },
      { icon: '🖼️', text: 'کارت آماری که می‌سازی هم از همین رنگ‌ها رنگ می‌گیره؛ «برنامه» یعنی همون تم فعلی' },
      { icon: '🌗', text: 'مرورگر هم می‌فهمه کدوم تم روشنه، پس نواری که خودش می‌کشه هم‌رنگش می‌شه' },
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
      <h2 id="changelogTitle">دفترچه به‌روز شد</h2>
      <p class="changelog-sub">یه کم تازه‌تر شدیم — اینا عوض شدن</p>
      <div class="changelog-body"></div>
      <button class="go" id="changelogOk">فهمیدم</button>
    </div>`;
  document.body.appendChild(overlay);
}

function close() {
  if (!overlay) return;
  /* Hiding it is all this module has to do: the Tab loop, the frozen page and
     the return of focus are the shared containment's job (js/modal.js), which
     follows the same `hidden` flip. */
  overlay.hidden = true;
  if (cleanup) { cleanup(); cleanup = null; }
  // Acknowledged: this release is only ever announced once.
  if (APP_VERSION) markSeen(APP_VERSION);
}

/* Opened by the boot check alone — see the note at the top of this file. */
function openChangelog(entries) {
  if (!overlay) build();
  if (!overlay.hidden) return;
  /* The entries are written in at open time: which ones belong to this reader is
     only known by the boot check that opens the dialog. */
  const body = overlay.querySelector('.changelog-body');
  if (body) body.innerHTML = entries.map(entryHtml).join('');
  overlay.hidden = false;

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
}

/* ── boot check ────────────────────────────────────────────────────────── */

/* Auto-open once per release, a beat after this check runs, so the first paint
   stays calm (no CLS, no layout thrash while the shell settles).

   The moment of the check belongs to the caller: app.js runs it at boot for a
   reader who already has a name, and right after the first-visit name card for
   everyone else — so the notes never open on top of the card that asks for a
   name. Nothing here needs to know which of the two it is.

   Who gets the dialog is decided by one marker. «چی تغییر کرد؟» compares two
   releases, so it can only mean something to someone who was here for the
   earlier one:

     no marker   → this device has never run a release. It is a first visit,
                   there is nothing to compare against, and the current version
                   is stamped so that the *next* release is announced to this
                   reader. The dialog stays shut.
     same as now → already read, nothing to say.
     older       → a real update: announce it. */
function markSeen(version) {
  try { localStorage.setItem(SEEN_KEY, version); } catch (e) { /* storage unavailable */ }
}

export function initChangelogCheck() {
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); } catch (e) { /* storage unavailable: treat as a first visit */ }

  if (!APP_VERSION) return;
  /* Never seen a release here: stamp this one and stay quiet. Stamping matters —
     without it the next release would look like a first visit and be skipped,
     so the one reader who has nothing to compare would keep getting the dialog
     and the reader who came back would never get it. */
  if (!seen) { markSeen(APP_VERSION); return; }
  if (seen === APP_VERSION) return;

  /* These notes speak to the reader who was here for the release before this
     one, so only the entries newer than the one their device acknowledged are
     shown — someone who skipped a release gets every entry they missed rather
     than the whole history. */
  const seenIndex = CHANGELOG.findIndex(e => e.version === seen);
  const fresh = seenIndex === -1 ? CHANGELOG : CHANGELOG.slice(seenIndex + 1);
  if (!fresh.length) return;

  setTimeout(() => openChangelog(fresh), 600);
}
