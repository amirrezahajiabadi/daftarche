/* ═══ Tour — the guided walk through the notebook ═══
   A first-time reader is walked from «الف» to the last station: the card is a
   small page of this notebook (css/base.css, .sheet-paper — the same recipe the
   calendars and the update note read) with an arrow connecting it to the thing
   it is talking about, and a spotlight hole cut around that thing so the rest
   of the page steps back. The tour navigates the pages itself, one station at
   a time, through the very same `navigate` event a tab tap uses.

   Three doors in:
     · the first visit, after the name card (js/app.js chains it);
     · «راهنمای دفترچه» in Settings, for whoever wants the walk again;
     · nowhere else, and never twice uninvited — finishing or skipping writes
       the current tour marker, and leaving mid-walk (Escape) writes nothing.

   The engine borrows the shared modal contract the way every other dialog
   does: the root is an `.overlay` flipped with `hidden`, so js/modal.js keeps
   focus inside and freezes the page behind. Between stations the overlay is
   closed again for a moment — the scroll lock has to be off for the page to
   carry the target into view — then reopened on the new station. */

import { faNum } from './utils.js';
import { loadTourDone, saveTourDone } from './store.js';
import { notify } from './bus.js';

/* ═══ The stations ═══
   `sel` is what the spotlight cuts its hole around; `wrap` lifts the hole to
   the section that owns the target when the element alone is too small to read
   as «this part here». The welcome station has no target: its card stands
   alone and asks the question the whole walk hangs on. Exported for the tests
   (tests/tour.test.mjs) — the walk is data before it is behaviour. */
export const STEPS = [
  {
    page: 'today', sel: null,
    title: 'خوش اومدی به دفتَرچه!',
    text: 'این‌جا دفترچهٔ کارهاته: کارایی که باید انجام بشن، تمرکز، و کتابایی که داری می‌خونی. یه تور کوتاه بریم که با همه‌ ی بخش هاش آشنا شی؟',
  },
  {
    page: 'today', sel: '#todayAddForm',
    title: 'همین‌جا بنویس',
    text: 'هر کاری به ذهنت می‌رسه رو توی همین باکس بنویس و اضافه کن. کار می‌ره تو لیست امروزت .',
  },
  {
    page: 'today', sel: '#todayFrog',
    title: 'این همدمته!',
    text: 'هر وقت ندونی الان چی کار کنی، بهش بگو. از روی لیست خودت پیشنهاد می‌ده که کدوم کار به صرفه‌تره — و چرا.',
  },
  {
    page: 'today', sel: '#todayProgBar', wrap: '.today-sec',
    title: 'پیشرفت امروز',
    text: 'هر کاری که تیک می‌زنی، این نوار پر می‌شه. یه نگاه بندازی می‌فهمی امروز چقدر راه اومدی.',
  },
  {
    page: 'today', sel: '#moods', wrap: '.mood-sec',
    title: 'امروز چه حالی داری؟',
    text: 'حال روزت رو ثبت کن. آخر ماه که برسی، دفترچه نشونت می‌ده این روزا رو با چه حالی گذروندی.',
  },
  {
    page: 'today', sel: '#bottomNav',
    title: 'همه‌جا یه تب فاصله داره',
    text: 'پنج تا خانهٔ اصلی: امروز، کارها، تمرکز، کتابخانه و هفته. حتی می‌تونی انگشتت رو بکشی تا صفحه‌ها زیرش سُر بخورن.',
  },
  {
    page: 'tasks', sel: '#addForm',
    title: 'دفترچهٔ کامل کارها',
    text: 'اینجا جای کارهای جدیه: اولویت، دسته، مهلت و مدت زمان رو می‌تونی تعیین کنی. جابه‌جاشون هم با همون دستگیره‌ی کنار هر کار.',
  },
  {
    page: 'tasks', sel: '#searchInput', wrap: '.search',
    title: 'گم شد؟',
    text: 'بین کارهات جستجو کن، یا تاس رو بنداز تا خودش یکی انتخاب کنه — واسه وقتی نمی‌دونی از کجا شروع کنی.',
  },
  {
    page: 'week', sel: '#wkStrip',
    title: 'هفته از نزدیک',
    text: 'هفت روز کنار هم. روی هر روزی بزنی، هم کارهای برنامه‌ریزی‌شده‌ش میاد، هم چیزی که واقعاً اون روز اتفاق افتاده.',
  },
  {
    page: 'focus', sel: '.focus-page-card',
    title: 'یه کار، یه تایمر',
    text: 'یکی از کارهات رو انتخاب کن و تایمر رو بزن. اگه دوست داشتی، صدای بارون، دریا یا جنگل هم میتونه پشتت باشه.',
  },
  {
    page: 'library', sel: '#shelfView',
    title: 'کتابهات همین‌جان',
    text: 'PDFهات رو اضافه کن تا قفسه‌ات پر شه. توی کتابخونه می‌تونی هایلایت کنی، یادداشت بذاری و پیشرفت خوندنت رو ببینی.',
  },
  {
    page: 'profile', sel: '.profile-card',
    title: 'این خودتی!',
    text: 'عکست و اسمت، کاراکتر همراهت، و آمار و نشان‌ها. هر چی این‌جاست مال خودته.',
  },
  {
    page: 'stats', sel: '#statsRange',
    title: 'عددها قشنگ حرف می‌زنن',
    text: 'از هفت روز تا یک سال رو انتخاب کن و آمار خودتو ببین , میتونی کارت آماری خودت رو به صورت عکس با تم های مختلف دریافت کنی و برای دوستات بفرستی.',
  },
  {
    page: 'achv', sel: '#achvTabs',
    title: 'کلکسیونت',
    text: 'هر کاری که انجام می‌دی یه پله به نشانهات نزدیک‌تر می‌شی. از برنز تا الماس، جا داره تا بری!',
  },
  {
    page: 'settings', sel: '#profTour',
    title: 'حالا مال خودته!',
    text: 'هر وقت هم دلت خواست این تور رو دوباره ببینی، از همین‌جا توی تنظیمات در دسترسه. حالا برو سراغ کار زندگیت 😄',
  },
];

/* The station letters, the way the notebook would number them. */
export const LETTERS = ['الف', 'ب', 'پ', 'ت', 'ث', 'ج', 'چ', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'ژ', 'س'];

/* ═══ The geometry — pure, no DOM ═══
   Given the target's rect, the viewport, the measured card and the band the
   glass dock keeps at the bottom, decide which side of the target the card
   sits on, where the card and the arrow go, and where the spotlight's hole is
   cut. Physical coordinates throughout, because everything downstream
   (getBoundingClientRect, fixed positioning) is physical; the stylesheet never
   writes a physical side itself. */
export function computePlacement(rect, vw, vh, boxW, boxH, opts = {}) {
  const gap = opts.gap ?? 14;
  const margin = opts.margin ?? 12;
  const pad = 10;                                // the hole's air around the target
  const topLimit = (opts.topInset ?? 0) + margin;
  const bottomLimit = vh - (opts.bottomInset ?? 0) - margin;

  /* The hole: the target inflated by `pad`, clamped into the viewport so a
     target that reaches past an edge never drags the hole off-screen. */
  const spot = {
    left: Math.max(margin, rect.left - pad),
    top: Math.max(margin, rect.top - pad),
  };
  spot.width = Math.max(24, Math.min(rect.right + pad, vw - margin) - spot.left);
  spot.height = Math.max(24, Math.min(rect.bottom + pad, bottomLimit) - spot.top);

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const clampX = x => Math.min(Math.max(x, margin), Math.max(margin, vw - margin - boxW));
  const clampY = y => Math.min(Math.max(y, margin), Math.max(margin, bottomLimit - boxH));

  const spaceBelow = bottomLimit - (rect.bottom + pad);
  const spaceAbove = rect.top - pad - margin;

  /* Phones have two separate reading areas: the card and the page preview.
     Use a clear gap beside the target's top/bottom edge when it fits. For a
     tall target, dock the card at the clearer viewport edge and return the
     scroll needed to bring the target into the remaining area. The spotlight
     is clipped to that area, so it can never pass beneath the card. */
  if (opts.mobile) {
    const overlap = top => Math.max(0, Math.min(top + boxH, rect.bottom + pad)
      - Math.max(top, rect.top - pad));
    const above = rect.top - pad - topLimit;
    let chosen;
    if (spaceBelow >= boxH + gap && rect.top >= topLimit + pad) {
      chosen = { side: 'bottom', top: rect.bottom + pad + gap };
    } else if (above >= boxH + gap && rect.bottom <= bottomLimit - pad) {
      chosen = { side: 'top', top: rect.top - pad - gap - boxH };
    } else {
      chosen = [
        { side: 'top', top: topLimit, gap: above },
        { side: 'bottom', top: Math.max(topLimit, bottomLimit - boxH), gap: spaceBelow },
      ].map(c => ({ ...c, overlap: overlap(c.top) }))
        .sort((a, b) => a.overlap - b.overlap || b.gap - a.gap)[0];
    }
    const box = { left: clampX(cx - boxW / 2), top: chosen.top };
    const preview = {
      top: chosen.side === 'top' ? box.top + boxH + gap : topLimit,
      bottom: chosen.side === 'bottom' ? box.top - gap : bottomLimit,
    };
    const available = preview.bottom - preview.top - 2 * pad;
    let scrollBy = 0;
    if (rect.height > available || rect.top < preview.top + pad) {
      scrollBy = rect.top - preview.top - pad;
    } else if (rect.bottom > preview.bottom - pad) {
      scrollBy = rect.bottom - preview.bottom + pad;
    }
    spot.top = Math.min(Math.max(rect.top - pad, preview.top), preview.bottom);
    spot.height = Math.max(0, Math.min(rect.bottom + pad, preview.bottom) - spot.top);
    const arrow = {
      left: Math.min(Math.max(cx - 7, box.left + 16), box.left + boxW - 30),
      top: chosen.side === 'top' ? box.top + boxH - 7 : box.top - 7,
    };
    return { side: chosen.side, box, arrow, spot, preview, scrollBy };
  }

  let side, box, arrow;
  if (spaceBelow >= boxH + gap) {
    side = 'bottom';
    box = { left: clampX(cx - boxW / 2), top: rect.bottom + pad + gap };
    arrow = {
      left: Math.min(Math.max(cx - 7, box.left + 16), box.left + boxW - 30),
      top: box.top - 7,
    };
  } else if (spaceAbove >= boxH + gap) {
    side = 'top';
    box = { left: clampX(cx - boxW / 2), top: Math.max(margin, rect.top - pad - gap - boxH) };
    arrow = {
      left: Math.min(Math.max(cx - 7, box.left + 16), box.left + boxW - 30),
      top: box.top + boxH - 7,
    };
  } else {
    /* No room above or below (a tall target on a short screen): hang the card
       beside the target, on whichever side has more of it. */
    side = vw - rect.right >= rect.left ? 'right' : 'left';
    box = {
      left: clampX(side === 'right' ? rect.right + pad + gap : rect.left - pad - gap - boxW),
      top: clampY(cy - boxH / 2),
    };
    arrow = {
      left: side === 'right' ? box.left - 7 : box.left + boxW - 7,
      top: Math.min(Math.max(cy - 7, box.top + 16), box.top + boxH - 30),
    };
  }
  return { side, box, arrow, spot };
}

/* ═══ The engine ═══ */
let root = null, spotEl = null, arrowEl = null, card = null;
let kickerEl = null, titleEl = null, textEl = null;
let dotsEl = null, countEl = null, prevBtn = null, nextBtn = null, skipBtn = null;
let cardObserver = null;
let idx = 0;
let active = false;
let offerTimer = 0;

/* Width identifies portrait phones; coarse input plus a short viewport also
   catches a phone rotated to landscape, without changing short desktop windows. */
const MOBILE_QUERY = '(max-width: 600px), (pointer: coarse) and (max-width: 950px) and (max-height: 600px)';
const mobileViewport = () => window.matchMedia(MOBILE_QUERY).matches;

function prepareMobile() {
  const mobile = mobileViewport();
  document.body.classList.toggle('tour-mobile-stage', mobile);
  if (mobile) {
    const height = window.visualViewport?.height || window.innerHeight;
    root.style.setProperty('--tour-viewport-height', height + 'px');
    /* Temporary scroll space lets even the first/last page section move away
       from the card. It disappears when the tour closes or switches to desktop. */
    document.body.style.setProperty('--tour-page-space', Math.min(360, Math.max(280, height * .4)) + 'px');
  } else {
    root.style.removeProperty('--tour-viewport-height');
    document.body.style.removeProperty('--tour-page-space');
  }
  return mobile;
}

const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const currentPage = () =>
  document.querySelector('.page.active')?.id.replace(/^page-/, '') || 'today';

const resolveTarget = step => {
  const el = document.querySelector(step.sel);
  if (!el) return null;
  return step.wrap ? el.closest(step.wrap) || el : el;
};

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/* Built once, on the first open — like the release-notes dialog, everything is
   plain elements and textContent; the copy is static and nothing from the page
   is ever interpolated. */
function ensureRoot() {
  if (root) return;

  root = el('div', 'overlay tour-overlay');
  root.id = 'tourOverlay';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'راهنمای دفترچه');
  root.hidden = true;

  spotEl = el('div', 'tour-spot');
  spotEl.setAttribute('aria-hidden', 'true');

  arrowEl = el('div', 'tour-arrow');
  arrowEl.setAttribute('aria-hidden', 'true');

  card = el('aside', 'tour-card sheet-paper');
  kickerEl = el('span', 'tour-kicker');
  titleEl = el('h2', 'tour-title');
  textEl = el('p', 'tour-text');
  textEl.setAttribute('aria-live', 'polite');
  const copy = el('div', 'tour-copy');
  copy.append(titleEl, textEl);

  const dotsRow = el('div', 'tour-dots-row');
  dotsEl = el('div', 'tour-dots');
  dotsEl.setAttribute('aria-hidden', 'true');
  countEl = el('span', 'tour-count');
  dotsRow.append(dotsEl, countEl);

  const actions = el('div', 'tour-actions');
  prevBtn = el('button', 'tour-btn is-prev', 'قبلی');
  prevBtn.type = 'button';
  nextBtn = el('button', 'tour-btn is-next', 'بریم!');
  nextBtn.type = 'button';
  actions.append(prevBtn, nextBtn);

  skipBtn = el('button', 'tour-skip');
  skipBtn.append(
    el('span', 'tour-skip-label', 'دفترچه رو میشناسم بذار بریم سراغ کار زندگیمون'),
    el('span', 'tour-skip-mobile', 'فعلاً رد کن'),
  );
  skipBtn.type = 'button';

  card.append(kickerEl, copy, dotsRow, actions, skipBtn);
  root.append(spotEl, arrowEl, card);
  document.body.append(root);
  const before = el('div', 'tour-page-space');
  const after = el('div', 'tour-page-space');
  before.setAttribute('aria-hidden', 'true');
  after.setAttribute('aria-hidden', 'true');
  document.body.prepend(before);
  document.body.append(after);

  if (typeof ResizeObserver !== 'undefined') {
    cardObserver = new ResizeObserver(() => {
      if (active && mobileViewport()) scheduleReposition();
    });
  }

  prevBtn.addEventListener('click', () => show(idx - 1));
  nextBtn.addEventListener('click', () => (idx === STEPS.length - 1 ? finish(true, true) : show(idx + 1)));
  skipBtn.addEventListener('click', () => finish(true, false));
}

function render() {
  const s = STEPS[idx];
  card.querySelector('.tour-copy').scrollTop = 0;
  kickerEl.textContent = `ایستگاه ${LETTERS[idx]}`;
  titleEl.textContent = s.title;
  textEl.textContent = s.text;

  countEl.textContent = `${faNum(idx + 1)} از ${faNum(STEPS.length)}`;
  dotsEl.replaceChildren(...STEPS.map((_, i) => {
    const d = el('i', 'tour-dot' + (i === idx ? ' on' : ''));
    d.textContent = '';
    return d;
  }));

  prevBtn.hidden = idx === 0;
  nextBtn.textContent = idx === 0 ? 'بریم!' : idx === STEPS.length - 1 ? 'تمومش کن' : 'بعدی';
}

function position() {
  if (!active || !root || root.hidden) return;
  const mobile = prepareMobile();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bw = card.offsetWidth;
  const bh = card.offsetHeight;
  const step = STEPS[idx];

  let placement = null;
  const target = step.sel && resolveTarget(step);
  const nav = document.getElementById('bottomNav');
  let bottomInset = nav && !nav.hidden ? nav.offsetHeight + 26 : 0;
  let topInset = 0;
  if (mobile) {
    const visual = window.visualViewport;
    const style = getComputedStyle(root);
    topInset = (visual?.offsetTop || 0) + (parseFloat(style.getPropertyValue('--tour-safe-top')) || 0);
    let bottom = (visual?.offsetTop || 0) + (visual?.height || vh)
      - (parseFloat(style.getPropertyValue('--tour-safe-bottom')) || 0);
    /* The navigation is itself one station: don't clip its spotlight out
       of the viewport by reserving the navigation's band for that station. */
    if (nav && target !== nav && nav.getClientRects().length) {
      bottom = Math.min(bottom, nav.getBoundingClientRect().top - 12);
    }
    bottomInset = vh - bottom;
  }
  if (target) {
    const options = { bottomInset, topInset, mobile };
    placement = computePlacement(target.getBoundingClientRect(), vw, vh, bw, bh, options);
    if (mobile && getComputedStyle(target).position !== 'fixed') {
      for (let attempt = 0; attempt < 3 && Math.abs(placement.scrollBy) > 1; attempt++) {
        const previousTop = target.getBoundingClientRect().top;
        window.scrollBy({ top: placement.scrollBy, behavior: 'instant' });
        const rect = target.getBoundingClientRect();
        placement = computePlacement(rect, vw, vh, bw, bh, options);
        if (Math.abs(rect.top - previousTop) < 1) break;
      }
    }
  }
  /* No target (the welcome question) or a target that went missing: the card
     stands alone, a little above the middle, with no hole and no arrow. */
  if (!placement) {
    placement = {
      side: 'center',
      box: {
        left: (vw - bw) / 2,
        top: mobile ? Math.max(topInset + 12, topInset + (vh - bottomInset - topInset - bh) / 2)
          : (vh - bh) / 2 - vh * 0.06,
      },
      arrow: null, spot: null,
    };
  }

  /* The geometry above is physical, because getBoundingClientRect is; the
     stylesheet only ever speaks logical sides, so the write converts: in this
     RTL document inset-inline-start is the distance from the right edge. The
     card keeps its CSS-driven width (never an inline one) so a resize can
     re-measure it; the hole and the arrow carry their own sizes. */
  const put = (node, left, top, w, h) => {
    node.style.insetInlineStart = Math.round(vw - left - w) + 'px';
    node.style.insetBlockStart = Math.round(top) + 'px';
    if (w != null && node !== card) node.style.width = w + 'px';
    if (h != null && node !== card) node.style.height = h + 'px';
  };

  put(card, placement.box.left, placement.box.top, card.offsetWidth, null);

  if (placement.spot && placement.spot.height > 0) {
    spotEl.style.display = 'block';
    put(spotEl, placement.spot.left, placement.spot.top, placement.spot.width, placement.spot.height);
  } else {
    spotEl.style.display = 'none';
  }

  if (placement.arrow) {
    arrowEl.style.display = 'block';
    put(arrowEl, placement.arrow.left, placement.arrow.top, arrowEl.offsetWidth, null);
  } else {
    arrowEl.style.display = 'none';
  }
}

/* One station. The overlay always closes first — the scroll lock has to be off
   for the page to scroll the target into view — and reopens once the page has
   settled under the new station. */
async function show(i) {
  idx = Math.max(0, Math.min(STEPS.length - 1, i));
  const step = STEPS[idx];

  if (root) root.hidden = true;
  ensureRoot();
  prepareMobile();
  if (currentPage() !== step.page) {
    window.dispatchEvent(new CustomEvent('navigate', { detail: step.page }));
  }
  const target = step.sel && resolveTarget(step);
  if (target) target.scrollIntoView({ block: 'center', behavior: 'instant' });
  await raf2();
  if (!active) return;

  render();
  root.hidden = false;
  position();
}

function finish(markDone, award = false) {
  active = false;
  if (root) root.hidden = true;
  if (repositionFrame) {
    cancelAnimationFrame(repositionFrame);
    clearTimeout(repositionFrame);
    repositionFrame = 0;
  }
  window.removeEventListener('resize', scheduleReposition);
  document.removeEventListener('scroll', scheduleReposition, true);
  document.removeEventListener('keydown', onKey);
  window.visualViewport?.removeEventListener('resize', scheduleReposition);
  window.visualViewport?.removeEventListener('scroll', scheduleReposition);
  document.body.classList.remove('tour-mobile-stage');
  document.body.style.removeProperty('--tour-page-space');
  cardObserver?.disconnect();
  if (markDone) {
    saveTourDone();
    if (award) notify();
  }
}

function onKey(e) {
  if (e.key === 'Escape') finish(false);
  else if (e.key === 'ArrowLeft' && idx < STEPS.length - 1) show(idx + 1);   // RTL: forward is leftward
  else if (e.key === 'ArrowRight' && idx > 0) show(idx - 1);
}

/* While the walk is open, a rotated phone or a scrolled page must not leave the
   hole and the card pointing at where the target used to be. Repositioning is
   coalesced into one frame — a resize fires dozens of times a second. In a
   hidden tab requestAnimationFrame never runs, so there the coalescing falls
   back to a timer: the walk still lands where it belongs when the tab wakes. */
let repositionFrame = 0;
function scheduleReposition() {
  if (!active || repositionFrame) return;
  const run = () => { repositionFrame = 0; position(); };
  repositionFrame = document.hidden ? setTimeout(run, 32) : requestAnimationFrame(run);
}

/* ═══ The two doors ═══

   The first visit: ask only if the walk was never finished or declined.
   Settings: always from station one, whoever asks. */
export function offerTour() {
  if (loadTourDone() || active || offerTimer) return;
  const tryStart = () => {
    offerTimer = 0;
    /* Release notes may be queued at the same boot. Wait until that shared
       dialog is closed so the two welcome moments never cover each other. */
    const notes = document.getElementById('changelogOverlay');
    if (notes && !notes.hidden) {
      offerTimer = setTimeout(tryStart, 300);
      return;
    }
    if (!loadTourDone()) startTour();
  };
  offerTimer = setTimeout(tryStart, 800);
}

export function startTour() {
  if (active) return;
  active = true;
  ensureRoot();
  cardObserver?.observe(card);
  document.fonts?.ready.then(() => { if (active && mobileViewport()) scheduleReposition(); });
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', scheduleReposition);
  window.visualViewport?.addEventListener('resize', scheduleReposition);
  window.visualViewport?.addEventListener('scroll', scheduleReposition);
  /* Capture: the page itself scrolls on window — a bubble listener on document
     never hears it. */
  document.addEventListener('scroll', scheduleReposition, true);
  show(0);
}
