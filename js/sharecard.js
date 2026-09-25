/* ═══ Share card — one square of the reader's own numbers ═══
   A 1080×1080 card, drawn by hand on a canvas: the paper the app is written on,
   two strips of tape, the reader's own face, the window that was being looked at,
   what the window holds, the categories it leaned on, its shape as a small bar
   chart, and one line of the app's voice at the bottom.

   Four rules shape what is allowed on it:

     · numbers, not content. The card carries counts and a chart — never a task
       title. It is meant to leave the device, and the only things of the
       reader's own on it are their name and their own photo.
     · the reader's face first. A profile photo if they set one, their chosen
       companion if they did not — the same rule the profile page follows, so the
       card introduces the same person the app does.
     · the reader's own template. Every colour is read from custom properties —
       the card's own --card-* layer, which «برنامه» points at the interface's
       own tokens — so a shared card looks like the app it came from, a dark
       card from a dark reader, until the reader picks one of the other
       palettes. The shape under it is a layout they pick the same way.
     · one honest delivery path. If the browser can hand a PNG to the system
       share sheet it does; if it cannot, the image is downloaded. Both are the
       same PNG, and both buttons are always on the preview — a long-press on a
       phone is a third way, not the only one.

   The card is built on one vertical axis down the middle. The brand and the
   window chip balance each other on the header band; the face, the name, the
   window's name and its two ends all sit on the centre line; the numbers are
   spaced as evenly as a row of columns can be, with the separators mirrored
   about the middle; each category row mirrors itself (name, bar, count). Below
   that the   card flows on a cursor, so a window with no categories behind it
   hands the room to the chart instead of carrying a hole.

   Three layouts share that axis and differ only in what they spend the room on,
   and the cursor is what makes that safe: a layout never measures itself against
   a block it did not draw. */

import { state } from './state.js';
import { $, faNum, faDigits, dayKey } from './utils.js';
import { computeStats, currentRangeKey } from './stats.js';
import { currentChar, getPhoto } from './profile.js';
import { dateToJalali, JALALI_MONTHS } from './jalali.js';
import { loadCardStyle, saveCardStyle } from './store.js';
import { THEMES as APP_THEMES, DEFAULT_THEME } from './constants.js';
import { pickerRow } from './chipgroup.js';

const SIZE = 1080;
const PAD = 72;              // card inset from the paper's edge
const IN = 46;               // content inset from the card's edge
const R = 56;                // card corner radius
const CX = SIZE / 2;         // the axis every band is centred on
const LEFT = PAD + IN;       // content edges, shared by every layout
const RIGHT = SIZE - PAD - IN;
const CW = RIGHT - LEFT;
const FOOT_TOP = 880;        // the divider that closes the card's body

/* ── Templates ──
   A card is a colour and a shape, and both are the reader's to choose.

   The colour is a named palette, «برنامه» being the one every card used to have:
   it is not a palette of its own but a pointer at the interface's own tokens, so
   a card made at night still comes out dark. The other three are fixed, and they
   are written once, in css/base.css, next to the interface's own themes — the
   two are cut from the same values, so a card can never drift from the app it
   came from. A chip that wears a palette (data-palette in the picker) shows it
   in its dot, and one set of names covers the canvas, the panel and the picker:
   what the reader picks is what gets printed.

   The shape is a layout, and each one spends the card's room differently:
   «کلاسیک» is the full card — a slipped panel of numbers and two category rows;
   «فشرده» drops the slip, keeps one category row, and hands the room to the
   chart; «شاخص» says its headline once, loud, and lets the chart run wide. */

/* The card's colours are the app's palettes plus one thing that is not a
   palette: «برنامه», which asks the card to follow the interface instead. Adding
   a theme to js/constants.js therefore adds a card colour with it, and the two
   can never hold different palettes under the same name.

   The default palette is left out: «برنامه» already is the default's colours
   whenever the app is wearing them, so a second chip with the same colours would
   only look like a choice. */
const CARD_PALETTES = APP_THEMES.filter(t => t.palette && t.key !== DEFAULT_THEME);

const THEMES = [
  { key: 'app', label: 'برنامه', palette: '' },
  ...CARD_PALETTES.map(t => ({ key: t.key, label: t.label, palette: t.palette })),
];

const paletteKey = theme => (THEMES.find(t => t.key === theme) || {}).palette || '';

const LAYOUTS = [
  { key: 'classic', label: 'کلاسیک' },
  { key: 'dense', label: 'فشرده' },
  { key: 'hero', label: 'شاخص' },
];

const DEFAULT_STYLE = { theme: 'app', layout: 'classic' };

/* Read once per open. A stored value that is not one of the keys above — an old
   build's, or a hand-edited one — falls back to the default pair rather than
   asking the card to draw something it has no layout for. */
function readStyle() {
  const saved = loadCardStyle() || {};
  return {
    theme: THEMES.some(t => t.key === saved.theme) ? saved.theme : DEFAULT_STYLE.theme,
    layout: LAYOUTS.some(l => l.key === saved.layout) ? saved.layout : DEFAULT_STYLE.layout,
  };
}

let styleState = { ...DEFAULT_STYLE };

const FONT_UI = "'Estedad', system-ui, sans-serif";
const FONT_MAD = "'Estedad Mad', 'Estedad', system-ui, sans-serif";

/* ── Painting helpers ── */

function rounded(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function tape(ctx, cx, cy, w, h, angle, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

/* Text that must never run past its column: shortened with an ellipsis rather
   than squeezed, which would flatten the letterforms. */
function fitText(ctx, str, maxW) {
  if (ctx.measureText(str).width <= maxW) return str;
  let s = str;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

/* The interface's own tokens, so the card cannot drift from the app. */
const tok = (name, fallback) => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch { return fallback; }
};

const appPalette = () => ({
  bg: tok('--color-bg', '#f6efe3'),
  surface: tok('--color-surface', '#fffcf5'),
  text: tok('--color-text-primary', '#2e2921'),
  muted: tok('--color-text-muted', '#a79c8a'),
  accent: tok('--color-accent', '#f4703a'),
  accentSoft: tok('--accent-soft', 'rgba(244,112,58,.15)'),
  border: tok('--color-border-strong', 'rgba(80,60,30,.22)'),
  grid: tok('--color-border', 'rgba(80,60,30,.12)'),
  tape: tok('--tape', 'rgba(255,196,120,.5)'),
});

/* One palette, whatever template is chosen: the --card-* layer when there is
   one, the interface's tokens when there is not. It is read off the panel, which
   markPicker stamps with the chosen template's palette — so the colours come from
   the same attribute that tells the dialog which template it is showing, and a
   chip can never be mistaken for a different row's. */
function palette() {
  const panel = $('.share-panel');
  const cs = panel ? getComputedStyle(panel) : null;
  const read = (name, fallback) => (cs ? cs.getPropertyValue(name).trim() : '') || fallback;
  const app = appPalette();
  return {
    bg: read('--card-bg', app.bg),
    surface: read('--card-surface', app.surface),
    text: read('--card-text', app.text),
    muted: read('--card-muted', app.muted),
    accent: read('--card-accent', app.accent),
    accentSoft: read('--card-accent-soft', app.accentSoft),
    border: read('--card-border', app.border),
    grid: read('--card-grid', app.grid),
    tape: read('--card-tape', app.tape),
  };
}

/* ── What the card says ── */

/* Three numbers, chosen in the order a reader would want to read them: what got
   done, how unbroken the run was, and how many days were actually used. Focus
   minutes only step in when the run has nothing to show yet — a card is a
   glance, and three is as many as a glance holds. */
function cardNumbers(model) {
  const h = model.headline;
  const out = [];
  if (h.done || h.created) out.push({ v: faNum(h.done), l: 'کار انجام‌شده' });
  if (h.streak > 0) out.push({ v: faNum(h.streak), l: 'روز پیاپی' });
  if (h.activeDays > 0) out.push({ v: faNum(h.activeDays), l: 'روز فعال' });
  if (out.length < 3 && h.focusMinutes > 0) out.push({ v: faNum(h.focusMinutes), l: 'دقیقه تمرکز' });
  return out.slice(0, 3);
}

/* «شاخص» says one figure out loud and keeps the rest as chips. Both come from the
   same list the other layouts print as columns, so the layouts can never disagree
   about what the window holds — and the loud one is the number the window itself
   would have led with. */
const heroNumber = model => cardNumbers(model)[0] || { v: faNum(0), l: 'این بازه خالی موند' };
const heroChips = model => cardNumbers(model).slice(1).map(it => `${it.v} ${it.l}`);

/* The most-used category and the least-used one: the two ends of the same list.
   A window with a single category gets one row, not a row and a copy of it. */
function categoryRows(model) {
  const cats = model.cats || [];
  if (!cats.length) return [];
  return cats.length === 1 ? [cats[0]] : [cats[0], cats[cats.length - 1]];
}

function deltaSentence(model) {
  const h = model.headline;
  if (!h.done && !h.donePrev) return '';
  if (h.delta === 0) return 'هم‌اندازهٔ بازهٔ قبل';
  return `${faNum(Math.abs(h.delta))} کار ${h.delta > 0 ? 'بیشتر' : 'کمتر'} از بازهٔ قبل`;
}

/* The closing line answers what the window actually holds, the way the rest of
   the app speaks. */
function closingLine(model) {
  const done = model.headline.done;
  if (!model.hasAny) return 'شروعش سخترین بخشه — یه کار کوچیک کافیه.';
  if (done >= 10) return 'هر تیک، یه قدم رو به جلو بود.';
  if (done > 0) return 'همین چند قدم کوچیک، مسیر رو جلو می‌بره.';
  return 'این بازه بیشتر از تمرکز و مطالعه بود تا تیک زدن.';
}

/* A day on the card: «۴ مهر». The year is written the way a reader writes it —
   every digit, no grouping separator — because ۱۴۰۵ is a year, not a quantity. */
const jalaliDay = ts => {
  const j = dateToJalali(new Date(ts));
  return `${faDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]}`;
};

/* ── The face ──
   The reader's photo when there is one, their companion when there is not. The
   companion is drawn as its bust, not the animated sprite: an SVG loaded as an
   image cannot resolve the external sprite file behind the character, and the
   bust is the same companion at card size. */
async function faceImage() {
  const photo = getPhoto();
  if (photo) {
    const img = new Image();
    img.src = photo;
    try {
      await img.decode();
      return { img, url: '', photo: true };
    } catch { /* an unreadable photo falls back to the companion below */ }
  }
  const char = currentChar();
  if (!char || !char.svg) return null;
  /* The xmlns is not optional here. An SVG opened through an <img> is parsed as a
     standalone XML document, where the SVG namespace is not implicit the way it
     is for markup sitting inside an HTML page — without it the image simply
     fails to decode (`EncodingError`) and the card would go out headless. The
     explicit size is added for the same reason: nothing may depend on the
     browser's default 300×150 box. */
  const svg = char.svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" ');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return { img, url, photo: false };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function drawFace(ctx, face, cx, cy, r, c) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = c.accentSoft;
  ctx.fill();
  if (face) {
    ctx.clip();
    ctx.drawImage(face.img, cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
  /* A ring, accent for a photo so the crop reads as deliberate. */
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = face && face.photo ? c.accent : c.border;
  ctx.stroke();
}

async function fontsReady() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.all([
      document.fonts.load(`700 122px ${FONT_MAD}`),
      document.fonts.load(`700 46px ${FONT_MAD}`),
      document.fonts.load(`700 44px ${FONT_MAD}`),
      document.fonts.load(`700 42px ${FONT_MAD}`),
      document.fonts.load(`700 30px ${FONT_MAD}`),
      document.fonts.load(`700 25px ${FONT_UI}`),
      document.fonts.load(`600 26px ${FONT_UI}`),
      document.fonts.load(`600 22px ${FONT_UI}`),
      document.fonts.load(`400 22px ${FONT_UI}`),
      document.fonts.load(`400 20px ${FONT_UI}`),
      document.fonts.load(`400 18px ${FONT_UI}`),
    ]);
  } catch { /* a font that will not load still paints, in the system fallback */ }
}

/* ── The card ── */

async function paintCard(model, style = styleState) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const c = palette();
  const layout = style.layout;
  const face = await faceImage();

  try {
    ctx.direction = 'rtl';
    ctx.textBaseline = 'alphabetic';

    /* Paper, then the card, then the tape that holds it down. The two strips
       mirror each other about the centre line. */
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.20)';
    ctx.shadowBlur = 46;
    ctx.shadowOffsetY = 20;
    rounded(ctx, PAD, PAD, SIZE - 2 * PAD, SIZE - 2 * PAD, R);
    ctx.fillStyle = c.surface;
    ctx.fill();
    ctx.restore();

    /* A hairline of accent inside the top of the card: the one flourish, and it
       is clipped to the card so it follows the corner rather than crossing it. */
    ctx.save();
    rounded(ctx, PAD, PAD, SIZE - 2 * PAD, SIZE - 2 * PAD, R);
    ctx.clip();
    ctx.fillStyle = c.accent;
    ctx.fillRect(PAD, PAD, SIZE - 2 * PAD, 8);
    ctx.restore();

    tape(ctx, CX - 170, PAD, 150, 38, -0.06, c.tape);
    tape(ctx, CX + 170, PAD, 150, 38, 0.06, c.tape);

    const left = LEFT;
    const right = RIGHT;
    const cw = CW;

    /* ── Header band: the window as a chip on the start edge, the brand on the
       other — one word and one chip, balanced about the middle. ── */
    const bandTop = PAD + 30;
    const chipH = 44;

    const chipLabel = model.range.label;
    ctx.font = `700 26px ${FONT_UI}`;
    const chipW = ctx.measureText(chipLabel).width + 46;
    rounded(ctx, left, bandTop, chipW, chipH, chipH / 2);
    ctx.fillStyle = c.accentSoft;
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = c.accent;
    ctx.fillText(chipLabel, left + chipW / 2, bandTop + 31);

    ctx.textAlign = 'right';
    ctx.font = `700 34px ${FONT_MAD}`;
    ctx.fillStyle = c.accent;
    ctx.fillText('دَفتَرچه', right, bandTop + 31);

    /* ── Who, and which window — everything on the centre line ── */
    const avatarR = 48;
    const avatarCy = bandTop + chipH + 30 + avatarR;
    drawFace(ctx, face, CX, avatarCy, avatarR, c);

    let y = avatarCy + avatarR;
    if (state.userName) {
      y += 30;
      ctx.textAlign = 'center';
      ctx.font = `700 25px ${FONT_UI}`;
      ctx.fillStyle = c.text;
      ctx.fillText(fitText(ctx, state.userName, cw - 80), CX, y);
    }
    y += 44;
    ctx.textAlign = 'center';
    ctx.font = `700 42px ${FONT_MAD}`;
    ctx.fillStyle = c.text;
    ctx.fillText(model.range.sub, CX, y);

    y += 32;
    const to = dateToJalali(new Date(model.window.to));
    ctx.font = `400 20px ${FONT_UI}`;
    ctx.fillStyle = c.muted;
    ctx.fillText(
      `از ${jalaliDay(model.window.from)} تا ${jalaliDay(model.window.to)} ${faDigits(to.jy)}`,
      CX, y,
    );

    /* ── The numbers ──
       «کلاسیک» writes them on their own slip of dashed paper; «فشرده» sets them
       straight on the card and keeps the room the slip was costing. */
    const items = cardNumbers(model);
    const boxed = layout !== 'dense';
    let cursor = y + (layout === 'hero' ? 26 : 18);

    if (layout === 'hero') {
      /* One figure, said out loud, with the window's own label beneath it, and
         the rest of the numbers as a row of pills. The row is centred as a whole,
         so an even count splits evenly about the axis. */
      const hero = heroNumber(model);
      ctx.textAlign = 'center';
      ctx.font = `700 122px ${FONT_MAD}`;
      ctx.fillStyle = c.accent;
      ctx.fillText(hero.v, CX, cursor + 100);
      ctx.font = `400 22px ${FONT_UI}`;
      ctx.fillStyle = c.muted;
      ctx.fillText(hero.l, CX, cursor + 140);
      cursor += 162;

      const chips = heroChips(model);
      if (chips.length) {
        const pillH = 44;
        const gapPill = 12;
        ctx.font = `600 22px ${FONT_UI}`;
        const widths = chips.map(ch => ctx.measureText(ch).width + 44);
        const total = widths.reduce((a, b) => a + b, 0) + gapPill * (chips.length - 1);
        let px = CX + total / 2;
        chips.forEach((ch, i) => {
          px -= widths[i];
          rounded(ctx, px, cursor, widths[i], pillH, pillH / 2);
          ctx.fillStyle = c.bg;
          ctx.fill();
          ctx.save();
          ctx.setLineDash([10, 8]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = c.border;
          rounded(ctx, px + 1, cursor + 1, widths[i] - 2, pillH - 2, pillH / 2);
          ctx.stroke();
          ctx.restore();
          ctx.textAlign = 'center';
          ctx.fillStyle = c.accent;
          ctx.fillText(ch, px + widths[i] / 2, cursor + 31);
          px -= gapPill;
        });
        cursor += pillH + 12;
      }
    } else if (items.length) {
      const panelH = boxed ? 112 : 96;
      if (boxed) {
        rounded(ctx, left, cursor, cw, panelH, 32);
        ctx.fillStyle = c.bg;
        ctx.fill();
        ctx.save();
        ctx.setLineDash([13, 10]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = c.border;
        rounded(ctx, left + 1, cursor + 1, cw - 2, panelH - 2, 32);
        ctx.stroke();
        ctx.restore();
      }

      /* Columns spaced evenly about the axis, with mirrored separators. */
      const n = items.length;
      const colW = cw / n;
      items.forEach((it, i) => {
        const cx = CX + colW * ((n - 1) / 2 - i);
        ctx.textAlign = 'center';
        ctx.font = `700 ${boxed ? 46 : 44}px ${FONT_MAD}`;
        ctx.fillStyle = c.text;
        ctx.fillText(it.v, cx, cursor + (boxed ? 66 : 52));
        ctx.font = `400 ${boxed ? 19 : 18}px ${FONT_UI}`;
        ctx.fillStyle = c.muted;
        ctx.fillText(fitText(ctx, it.l, colW - 24), cx, cursor + (boxed ? 92 : 78));
        if (i > 0) {
          const sx = CX + colW * ((n - 1) / 2 - i + 0.5);
          if (boxed) {
            ctx.save();
            ctx.setLineDash([8, 8]);
            ctx.lineWidth = 2;
            ctx.strokeStyle = c.border;
            ctx.beginPath();
            ctx.moveTo(sx, cursor + 32);
            ctx.lineTo(sx, cursor + panelH - 32);
            ctx.stroke();
            ctx.restore();
          } else {
            /* A bare dot where the slip would have drawn a rule. */
            ctx.beginPath();
            ctx.arc(sx, cursor + 46, 4, 0, Math.PI * 2);
            ctx.fillStyle = c.border;
            ctx.fill();
          }
        }
      });
      cursor += panelH;
    }

    /* ── The comparison, one centred line ── */
    const delta = deltaSentence(model);
    if (delta) {
      ctx.textAlign = 'center';
      ctx.font = `600 26px ${FONT_UI}`;
      ctx.fillStyle = c.accent;
      ctx.fillText(delta, CX, cursor + 40);
      cursor += 66;
    } else {
      cursor += 10;
    }

    /* ── Where the effort actually went ──
       The top category and the bottom one, as two mirrored rows of the same
       list: name at one end, count at the other, the bar between. «درس بیشتر،
       پروژه کمتر» is a sentence the reader can act on; a full breakdown is a
       table the card has no room for. */
    /* «فشرده» keeps the top category and hands the second row's room to the
       chart; «شاخص» has already spent that room on its headline, so it skips the
       block altogether. */
    const allRows = categoryRows(model);
    const rows = layout === 'dense' ? allRows.slice(0, 1) : allRows;
    if (layout !== 'hero' && rows.length) {
      cursor += 22;
      ctx.textAlign = 'right';
      ctx.font = `600 25px ${FONT_UI}`;
      ctx.fillStyle = c.muted;
      ctx.fillText('دسته‌ها', right, cursor);
      ctx.textAlign = 'left';
      ctx.font = `400 20px ${FONT_UI}`;
      ctx.fillText(rows.length > 1 ? 'بیشترین و کمترین' : 'بیشترین', left, cursor);

      cursor += 16;
      const trackEnd = right - 140;
      const trackStart = left + 84;
      const trackW = trackEnd - trackStart;
      const topCount = Math.max(rows[0].count, 1);

      rows.forEach((cat, i) => {
        const ry = cursor + i * 44;
        ctx.textAlign = 'right';
        ctx.font = `600 22px ${FONT_UI}`;
        ctx.fillStyle = c.text;
        ctx.fillText(fitText(ctx, cat.label, 132), right, ry + 14);

        rounded(ctx, trackEnd - trackW, ry, trackW, 13, 6.5);
        ctx.fillStyle = c.grid;
        ctx.fill();
        const w = Math.max(10, (cat.count / topCount) * trackW);
        rounded(ctx, trackEnd - w, ry, w, 13, 6.5);
        ctx.fillStyle = cat.color;
        ctx.fill();

        ctx.textAlign = 'left';
        ctx.font = `700 21px ${FONT_UI}`;
        ctx.fillStyle = c.muted;
        ctx.fillText(`${faNum(cat.count)} کار`, left, ry + 14);
      });
      cursor += rows.length * 44 + 10;
    } else {
      cursor += 14;
    }

    /* ── The shape of the window ──
       Oldest on the right: the card reads the way the app's charts do. The chart
       takes the room left above the footer — a short strip when the card above it
       is full, a taller one when the window had fewer things to say. */
    const buckets = model.buckets;
    const n = Math.max(buckets.length, 1);
    const gap = n > 20 ? 4 : n > 8 ? 10 : 18;
    const bw = Math.max(4, (cw - gap * (n - 1)) / n);
    const max = Math.max(...buckets.map(b => b.done), 1);

    ctx.textAlign = 'right';
    ctx.font = `600 24px ${FONT_UI}`;
    ctx.fillStyle = c.muted;
    ctx.fillText('کارهای انجام‌شده', right, cursor + 22);
    ctx.textAlign = 'left';
    ctx.font = `700 23px ${FONT_UI}`;
    ctx.fillStyle = c.accent;
    ctx.fillText(`${faNum(model.headline.done)} کار`, left, cursor + 22);

    const chartTop = cursor + 38;
    /* A layout that spends less above the chart gets a taller one — up to the
       room that is actually left above the footer. */
    const chartCap = layout === 'classic' ? 150 : 220;
    const chartH = Math.max(58, Math.min(chartCap, FOOT_TOP - 26 - chartTop));
    const chartBottom = chartTop + chartH;

    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, chartBottom - chartH / 2);
    ctx.lineTo(right, chartBottom - chartH / 2);
    ctx.stroke();
    ctx.fillStyle = c.border;
    ctx.fillRect(left, chartBottom, cw, 2);

    buckets.forEach((b, i) => {
      const x = left + cw - bw - i * (bw + gap);
      const h = b.done ? 20 + (b.done / max) * (chartH - 20) : 6;
      rounded(ctx, x, chartBottom - h, bw, h, Math.min(10, bw / 2, h / 2));
      ctx.globalAlpha = b.done ? (b.today ? 1 : 0.5) : 1;
      ctx.fillStyle = b.done ? c.accent : c.grid;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    /* ── Closing line, over a divider ── */
    ctx.fillStyle = c.grid;
    ctx.fillRect(left, FOOT_TOP, cw, 2);
    ctx.textAlign = 'center';
    ctx.font = `700 30px ${FONT_MAD}`;
    ctx.fillStyle = c.accent;
    ctx.fillText(closingLine(model), CX, FOOT_TOP + 42);
    ctx.font = `400 22px ${FONT_UI}`;
    ctx.fillStyle = c.muted;
    ctx.fillText('ساخته‌شده با دَفتَرچه', CX, FOOT_TOP + 84);
  } finally {
    if (face && face.url) URL.revokeObjectURL(face.url);
  }

  return canvas;
}

/* ── Preview and delivery ── */

let previewUrl = '';
let cardBlob = null;

const fileName = () => `daftarche-${dayKey(new Date())}.png`;
const fileFor = blob => new File([blob], fileName(), { type: 'image/png' });

function releasePreview() {
  const img = $('#shareImg');
  if (img) { img.removeAttribute('src'); img.hidden = true; }
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; }
}

function canShareFiles(blob) {
  if (!navigator.canShare) return false;
  try { return navigator.canShare({ files: [fileFor(blob)] }); }
  catch { return false; }
}

function downloadCard() {
  if (!cardBlob) return;
  const url = URL.createObjectURL(cardBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* Long enough for the download to start before the object URL goes away. */
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function shareCard() {
  if (!cardBlob) return;
  try {
    await navigator.share({ files: [fileFor(cardBlob)], title: 'آمار من در دَفتَرچه' });
  } catch (e) {
    /* A cancelled share is not a failure; anything else falls back to the file
       the reader can still keep. */
    if (!e || e.name !== 'AbortError') downloadCard();
  }
}

/* ── The picker ──
   The two rows are the shared picker (js/chipgroup.js), filled with the same
   lists the painter reads — so a template cannot exist in the dialog and be
   missing from the card. What belongs to the card is what a choice means: the
   panel wears the chosen palette (which is also where the canvas reads its
   colours from) and every pick repaints the preview in place. */

let themeRow = { mark() {} };
let layoutRow = { mark() {} };

function markPicker() {
  themeRow.mark(styleState.theme);
  layoutRow.mark(styleState.layout);
  const panel = $('.share-panel');
  if (!panel) return;
  const pal = paletteKey(styleState.theme);
  /* «برنامه» has no palette of its own, so the attribute is taken off rather
     than set to a name nothing defines; palette() then falls back to the
     interface's own tokens, which is exactly what the template asks for. */
  if (pal) panel.dataset.palette = pal;
  else delete panel.dataset.palette;
  panel.dataset.cardLayout = styleState.layout;
}

function pick(group, key) {
  const list = group === 'theme' ? THEMES : LAYOUTS;
  const field = group === 'theme' ? 'theme' : 'layout';
  if (!key || !list.some(t => t.key === key) || styleState[field] === key) return;
  styleState = { ...styleState, [field]: key };
  saveCardStyle(styleState);
  /* Marked before the paint: the palette is read off the selected chip, so the
     new chip has to be the marked one by the time the canvas asks for it. */
  markPicker();
  renderCard();
}

/* ── The preview ──
   One paint at a time: a reader can tap three chips faster than a canvas can be
   drawn, so every call takes a ticket and only the newest one may reach the
   preview. A slower paint that lands late — or after the dialog was closed — is
   dropped. */
let renderToken = 0;

async function renderCard() {
  const img = $('#shareImg');
  const spinner = $('#shareSpinner');
  const note = $('#shareNote');
  const go = $('#shareGo');
  const panel = $('.share-panel');
  const token = ++renderToken;

  panel?.classList.add('is-busy');
  /* The spinner belongs to a first paint. Once a card is on screen the preview
     dims instead — a ring turning over a dimmed card would be two loading
     signals for one wait. */
  if (spinner && !img?.src) spinner.hidden = false;   cardBlob = null;

  try {
    await fontsReady();
    const canvas = await paintCard(computeStats(currentRangeKey()));
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('card not painted');
    if (token !== renderToken) return;   // a newer choice is already being painted
    const url = URL.createObjectURL(blob);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = url;
    cardBlob = blob;
    if (img) { img.src = url; img.hidden = false; }
  } catch (e) {
    if (token === renderToken && note) note.textContent = 'این کارت ساخته نشد؛ یه بار دیگه امتحان کن.';
  } finally {
    if (token === renderToken) {
      if (spinner) spinner.hidden = true;
      panel?.classList.remove('is-busy');
    }
  }

  if (!cardBlob || token !== renderToken) return;
  /* The delivery offered is the one the browser actually supports, not a guess
     from the platform string. */
  const canShare = canShareFiles(cardBlob);
  if (go) go.hidden = !canShare;
  if (note) {
    note.textContent = canShare
      ? ''
      : 'اگه اشتراک‌گذاری در دسترس نبود، عکس رو ذخیره کن — یا روی گوشی نگهش دار.';
  }
}

export async function openShareCard() {
  const sheet = $('#shareSheet');
  if (!sheet) return;
  const note = $('#shareNote');
  const go = $('#shareGo');

  /* The stored template is read on every open, and the chips are marked before
     the first paint: the palette is read off the selected chip. */
  styleState = readStyle();
  markPicker();
  releasePreview();
  cardBlob = null;
  if (note) note.textContent = '';
  if (go) go.hidden = true;
  sheet.hidden = false;
  await renderCard();
}

export function initShareCard() {
  const sheet = $('#shareSheet');
  if (!sheet) return;
  /* The groups are the card's own, not the settings picker's, so a selector can
     never reach across the two rows that both choose a theme. */
  themeRow = pickerRow($('#shareThemeChips'), THEMES, { group: 'card-theme', onPick: k => pick('theme', k) });
  layoutRow = pickerRow($('#shareLayoutChips'), LAYOUTS, { group: 'card-layout', onPick: k => pick('layout', k) });
  styleState = readStyle();
  markPicker();
  const close = () => {
    sheet.hidden = true;
    releasePreview();
    cardBlob = null;
    /* A paint that lands after the dialog closed must not touch the preview. */
    renderToken++;
  };
  $('#shareStatsBtn')?.addEventListener('click', openShareCard);
  $('#shareClose')?.addEventListener('click', close);
  /* Clicking the scrim — and only the scrim — closes, the way every other
     overlay in the app behaves. */
  sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
  /* The overlay owns its own Escape, the way the character picker does: the
     global handler in app.js only knows the overlays it was born with. */
  sheet.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  $('#shareGo')?.addEventListener('click', shareCard);
  $('#shareDownload')?.addEventListener('click', downloadCard);
}
