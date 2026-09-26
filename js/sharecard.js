/* ═══ Share card — the reader's own window, as one picture ═══
   A card drawn by hand on a canvas: the paper the app is written on, the
   reader's own face, the window they were looking at, the one number that
   window leads with, a few numbers beside it, the companion standing under it,
   and one line of the app's voice at the bottom. It is meant to leave the
   device — to a story, to a chat, to the camera roll — so it is built to be
   read at a glance and to look finished at any size.

   Four rules shape what is allowed on it:

     · numbers, not content. The card carries counts and a chart — never a task
       title. The only things of the reader's own on it are their name and their
       own photo.
     · the reader's face first. A profile photo if they set one, their chosen
       companion if they did not — the same rule the profile page follows, so the
       card introduces the same person the app does.
     · the reader's own template. Every colour is read from custom properties —
       the card's own --card-* layer, which «برنامه» points at the interface's
       own tokens — so a shared card looks like the app it came from until the
       reader picks one of the other palettes. The palette decides the paper; the
       accent and the metrics are separate choices on top of it.
     · one honest delivery path. If the browser can hand a PNG to the system
       share sheet it does; if it cannot, the image is downloaded. Both are the
       same PNG, and both buttons are always on the preview.

   ── How a layout is built ──

   Every layout is three bands: the identity at the top (who, and which window),
   the closing line at the bottom (the app talking back), and everything else in
   between. The middle is a *stack* of blocks — the companion, the hero number,
   the row of numbers, the categories, the chart — and the blocks are laid out by
   one function that hands out the room they were given: each keeps the height it
   asked for, the slack is shared into the gaps, and what is left over is split
   above and below the group. A card with less to say therefore breathes instead
   of carrying a hole, and a card with more never runs off the paper.

   The three layouts differ only in which blocks they put in that stack and in
   how tall the paper is:

     · «کلاسیک» — square. The companion, the hero number, and a slip of numbers.
     · «شاخص» — square, and nothing else: the number said once, loud, with the
       companion above it. Maximum impact, maximum whitespace.
     · «فشرده» — 9:16, the shape a story wants: the same blocks plus the
       categories and the chart, which is the block that stretches to fill.

   ── How it stays legible ──

   Canvas cannot read a custom property and cannot ask whether a colour is light
   or dark, so the palette is parsed once per paint and every label is nudged —
   toward white or toward black, whichever end the paper is not on — until it
   clears a contrast floor against what it sits on. Nothing here knows a palette
   by name, which is why «شب» and «کاغذ» come out of the same painter. */

import { state } from './state.js';
import { $, faNum, faDigits, dayKey } from './utils.js';
import { computeStats, currentRangeKey } from './stats.js';
import { currentChar, getPhoto } from './profile.js';
import { dateToJalali, JALALI_MONTHS } from './jalali.js';
import { loadCardStyle, saveCardStyle } from './store.js';
import { THEMES as APP_THEMES, themesOfMode } from './constants.js';
import { currentMode } from './theme.js';
import { pickerRow, toggleRow } from './chipgroup.js';
import { QORQORI_URL } from './qorqori.js';

const SIZE = 1080;            // the square card, and the width of every card
const STORY_H = 1920;         // the 9:16 stories card
const PAD = 72;               // the paper margin around the card
const IN = 46;                // content inset from the card's edge
const R = 56;                 // the card's corner radius
const HAIRLINE = 8;           // the accent line under the card's top edge

const FONT_UI = "'Estedad', system-ui, sans-serif";
const FONT_MAD = "'Estedad Mad', 'Estedad', system-ui, sans-serif";

/* ── Geometry ──
   One shape per layout, decided here and nowhere else: a block never measures
   the paper itself, it is handed the box it lives in. */
function dimsFor(layout) {
  const W = SIZE;
  const H = layout === 'dense' ? STORY_H : SIZE;
  const cardTop = PAD;
  const cardBottom = H - PAD;
  const left = PAD + IN;
  const right = W - PAD - IN;
  return {
    W, H, pad: PAD, left, right,
    cw: right - left,
    cx: W / 2,
    cardTop, cardBottom,
    portrait: H > SIZE,
  };
}

/* ── The templates ──
   A card is a palette, an accent and a stack of layouts; all three are the
   reader's to choose and all three are stored in one object.

   The palette is a named one, «برنامه» being the template every card used to
   have: it is not a palette of its own but a pointer at the interface's own
   tokens, so a card made at night still comes out dark. The other three are
   written once, in css/base.css, next to the interface's own themes — the two
   are cut from the same values, so a card can never drift from the app it came
   from. A chip that wears a palette (data-palette in the picker) shows it in its
   dot, and one set of names covers the canvas, the panel and the picker. */

/* «برنامه» — follow whatever theme is on screen — plus the palettes of the half
   the app is currently in. Six themes do not mean six chips: a card is made
   while looking at the app, so the colours offered are the ones the app is
   wearing. The chips of the other half are built too and hidden by CSS (they
   carry data-mode), which is what lets the row follow the app's theme without
   being rebuilt. */
const THEMES = [
  { key: 'app', label: 'برنامه', palette: '' },
  ...APP_THEMES.map(t => ({ key: t.key, label: t.label, palette: t.palette, mode: t.mode })),
];

/* The keys a card may wear right now. A template saved while the app was in the
   other half is not among them, so it is not offered — and readStyle falls back
   to «برنامه» rather than marking a chip nobody can see. */
const cardThemeKeys = () => ['app', ...themesOfMode(currentMode()).map(t => t.key)];

const paletteKey = theme => (THEMES.find(t => t.key === theme) || {}).palette || '';

/* An accent is a pair: the same hue drawn for a light card and for a dark one.
   Which of the two gets used is not a setting — it is decided by the card's own
   paper at paint time, so «شب» never wears a shade that was mixed for «کاغذ». */
const ACCENTS = [
  { key: 'auto', label: 'خودکار', tint: null },
  { key: 'sun', label: 'آفتاب', tint: { light: '#c2551a', dark: '#ffa870' } },
  { key: 'leaf', label: 'برگ', tint: { light: '#37704a', dark: '#93c980' } },
  { key: 'sky', label: 'آسمون', tint: { light: '#2a63a8', dark: '#82b4ee' } },
  { key: 'rose', label: 'گلاب', tint: { light: '#ab3d6c', dark: '#f09bbb' } },
];

const LAYOUTS = [
  { key: 'classic', label: 'کلاسیک' },
  { key: 'hero', label: 'شاخص' },
  { key: 'dense', label: 'فشرده' },
];

/* The numbers the reader may put beside the hero. The hero itself is chosen from
   the window — the biggest thing it can say — and the rest are picked here. */
const METRICS = [
  { key: 'done', icon: 'check', label: 'کار انجام‌شده', value: m => m.headline.done },
  { key: 'streak', icon: 'flame', label: 'روز پیاپی', value: m => m.headline.streak },
  { key: 'active', icon: 'grid', label: 'روز فعال', value: m => m.headline.activeDays },
  { key: 'focus', icon: 'clock', label: 'دقیقه تمرکز', value: m => m.headline.focusMinutes },
  { key: 'read', icon: 'book', label: 'دقیقه مطالعه', value: m => m.reading.minutes },
  { key: 'rate', icon: 'target', label: 'نرخ تکمیل', value: m => m.headline.rate || 0, suffix: '٪' },
  { key: 'cats', icon: 'bars', label: 'دستهٔ فعال', value: m => m.cats.length },
];

const MAX_METRICS = 3;

const DEFAULT_STYLE = {
  theme: 'app',
  layout: 'classic',
  accent: 'auto',
  metrics: ['done', 'streak', 'active'],
};

const metricByKey = key => METRICS.find(m => m.key === key);

/* Read once per open. A stored value that is not in the lists above — an old
   build's, or a hand-edited one — falls back to the default for that field
   alone, so one stale key cannot cost the reader the rest of their choices. */
function readStyle() {
  const saved = loadCardStyle() || {};
  const metrics = Array.isArray(saved.metrics)
    ? saved.metrics.filter(k => metricByKey(k)).slice(0, MAX_METRICS)
    : null;
  return {
    theme: cardThemeKeys().includes(saved.theme) ? saved.theme : DEFAULT_STYLE.theme,
    layout: LAYOUTS.some(l => l.key === saved.layout) ? saved.layout : DEFAULT_STYLE.layout,
    accent: ACCENTS.some(a => a.key === saved.accent) ? saved.accent : DEFAULT_STYLE.accent,
    metrics: metrics && metrics.length ? metrics : [...DEFAULT_STYLE.metrics],
  };
}

let styleState = { ...DEFAULT_STYLE, metrics: [...DEFAULT_STYLE.metrics] };

/* ═══ Colour ═══
   Everything below works on [r, g, b, a] and is deliberately small: the card
   needs three questions answered — how light is this, can that be read on it,
   and what does it look like halfway to the thing behind it. */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function parseColor(str) {
  if (!str) return null;
  const s = String(str).trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(ch => ch + ch).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255, h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (rgb) {
    const p = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && p.slice(0, 3).every(v => !Number.isNaN(v))) {
      return [p[0], p[1], p[2], p.length > 3 && !Number.isNaN(p[3]) ? p[3] : 1];
    }
  }
  return null;
}

const cssColor = ([r, g, b, a = 1]) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;

function luminance([r, g, b]) {
  const f = v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(fg, bg) {
  const a = luminance(fg) + 0.05;
  const b = luminance(bg) + 0.05;
  return a > b ? a / b : b / a;
}

const mixColor = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
  (a[3] ?? 1) + ((b[3] ?? 1) - (a[3] ?? 1)) * t,
];

/* A translucent colour, laid over what is behind it. A soft accent fill is the
   one colour on the card that is not simply printed: what a reader sees is the
   accent mixed with the paper under it, and that is the colour a label has to be
   measured against. */
function flatten(fgStr, bgStr) {
  const fg = parseColor(fgStr) || [0, 0, 0, 1];
  const bg = parseColor(bgStr) || [255, 255, 255, 1];
  return cssColor(mixColor(bg, fg, clamp(fg[3] ?? 1, 0, 1)));
}

const alpha = (c, a) => [c[0], c[1], c[2], a];

/* A colour that can be read on the one under it. The label is blended a tenth at
   a time toward black or toward white — whichever end the paper is not on — and
   the first step that clears the floor is the one that gets printed. A template
   whose own muted grey is too quiet for its own paper is therefore still
   readable, without anyone having to pick a second grey for it. */
function readable(fg, bg, floor, fallback) {
  const base = parseColor(fg) || parseColor(fallback) || [40, 40, 40, 1];
  const back = parseColor(bg) || [255, 255, 255, 1];
  if (contrastRatio(base, back) >= floor) return cssColor(base);
  const lightPaper = (back[0] + back[1] + back[2]) / 3 > 150;
  const end = lightPaper ? [12, 10, 8, 1] : [255, 252, 246, 1];
  for (let i = 1; i <= 10; i++) {
    const step = mixColor(base, end, i / 10);
    if (contrastRatio(step, back) >= floor) return cssColor(step);
  }
  return cssColor(end);
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
});

/* One palette, whatever template is chosen: the --card-* layer when there is
   one, the interface's tokens when there is not. It is read off the panel, which
   markPicker stamps with the chosen template's palette — so the colours come from
   the same attribute that tells the dialog which template it is showing, and a
   chip can never be mistaken for a different row's.

   What comes out is not the raw palette but the palette *as the card will use
   it*: the ink tones already nudged past their contrast floors, and the tone to
   print on top of the accent. */
function palette() {
  const panel = $('.share-panel');
  const cs = panel ? getComputedStyle(panel) : null;
  const read = (name, fallback) => (cs ? cs.getPropertyValue(name).trim() : '') || fallback;
  const app = appPalette();
  const raw = {
    bg: read('--card-bg', app.bg),
    surface: read('--card-surface', app.surface),
    text: read('--card-text', app.text),
    muted: read('--card-muted', app.muted),
    accent: read('--card-accent', app.accent),
    accentSoft: read('--card-accent-soft', app.accentSoft),
    border: read('--card-border', app.border),
    grid: read('--card-grid', app.grid),
  };
  const paper = parseColor(raw.surface) || [255, 255, 255, 1];
  const softFill = flatten(raw.accentSoft, raw.surface);
  return {
    ...raw,
    text: readable(raw.text, raw.surface, 7, '#2e2921'),
    soft: readable(raw.muted, raw.surface, 3.4, '#a79c8a'),
    /* A label on a soft accent fill is the one place a palette's own accent can
       come up short: that fill is lighter than the paper it sits on, and the
       accent was chosen to glow against the paper, not against its own tint. It
       is nudged the same way every other label is — keeping the hue, losing a
       little light — rather than replaced with a colour nobody chose. */
    softFill,
    onSoft: readable(raw.accent, softFill, 4.2, raw.text),
    dark: luminance(paper) < 0.32,
  };
}

/* The chosen accent, worn on this paper: the light half of the pair on a light
   card, the dark half on a dark one, and the palette's own accent under
   «خودکار». */
function accentFor(c, key) {
  const a = ACCENTS.find(x => x.key === key);
  if (!a || !a.tint) return c;
  const accent = c.dark ? a.tint.dark : a.tint.light;
  const accentSoft = cssColor(alpha(parseColor(accent) || [0, 0, 0, 1], c.dark ? 0.22 : 0.13));
  const softFill = flatten(accentSoft, c.surface);
  return {
    ...c,
    accent,
    accentSoft,
    softFill,
    onSoft: readable(accent, softFill, 4.2, c.text),
  };
}

/* ═══ Painting helpers ═══ */

function rounded(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

const fillRound = (ctx, x, y, w, h, r, color) => {
  rounded(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
};

const strokeRound = (ctx, x, y, w, h, r, color, lw = 2) => {
  rounded(ctx, x, y, w, h, r);
  ctx.lineWidth = lw;
  ctx.strokeStyle = color;
  ctx.stroke();
};

/* Text that must never run past its column: shortened with an ellipsis rather
   than squeezed, which would flatten the letterforms. */
function fitText(ctx, str, maxW) {
  if (ctx.measureText(str).width <= maxW) return str;
  let s = str;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

/* A sentence, broken into the lines the card can hold — at most two, and what
   does not fit is shortened rather than dropped, the way every other clipped
   line on the card is. */
function wrapText(ctx, str, maxW, maxLines = 2) {
  const words = String(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxW) { lines.push(line); line = w; }
    else line = next;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = fitText(ctx, lines.slice(maxLines - 1).join(' '), maxW);
  return kept;
}

/* ── The little icons ──
   Drawn with paths rather than fetched as images or typed as emoji: a canvas
   cannot resolve a sprite, emoji come out of whichever font the device happens
   to have, and there is no network on the card's second half. Every glyph lives
   in a 24×24 box, so one scale factor sizes them all. */
const ICON_GLYPHS = {
  check(ctx) {
    ctx.beginPath();
    ctx.moveTo(-7.5, 0.5);
    ctx.lineTo(-2.5, 5.5);
    ctx.lineTo(7.5, -6);
    ctx.stroke();
  },
  flame(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(6.4, -1.5, 5.4, 2.6);
    ctx.arc(0, 2.6, 5.4, 0, Math.PI);
    ctx.quadraticCurveTo(-6.4, -1.5, 0, -9);
    ctx.stroke();
  },
  grid(ctx) {
    [[-7, -7], [1.4, -7], [-7, 1.4], [1.4, 1.4]].forEach(([x, y]) => {
      rounded(ctx, x, y, 5.6, 5.6, 2);
      ctx.fill();
    });
  },
  clock(ctx) {
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -4.6);
    ctx.moveTo(0, 0);
    ctx.lineTo(3.6, 0);
    ctx.stroke();
  },
  book(ctx) {
    ctx.beginPath();
    ctx.moveTo(-8, -5.6);
    ctx.quadraticCurveTo(-4, -7.6, 0, -5.2);
    ctx.quadraticCurveTo(4, -7.6, 8, -5.6);
    ctx.lineTo(8, 5.4);
    ctx.quadraticCurveTo(4, 3.4, 0, 5.8);
    ctx.quadraticCurveTo(-4, 3.4, -8, 5.4);
    ctx.closePath();
    ctx.stroke();
  },
  target(ctx) {
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
  },
  bars(ctx) {
    [[-7, 4.5], [-1.5, 9], [4, 6.5]].forEach(([x, h]) => {
      rounded(ctx, x, 7 - h, 4.5, h, 2);
      ctx.fill();
    });
  },
};

function drawIcon(ctx, name, cx, cy, size, color) {
  const glyph = ICON_GLYPHS[name];
  if (!glyph) return;
  const scale = size / 24;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  glyph(ctx);
  ctx.restore();
}

/* ═══ The face and the companion ═══ */

/* The reader's photo when there is one, their companion when there is not. The
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
     standalone XML document, where the SVG namespace is not implicit the way it is
     for markup sitting inside an HTML page — without it the image simply fails to
     decode (`EncodingError`) and the card would go out headless. The explicit size
     is added for the same reason: nothing may depend on the browser's default
     300×150 box. */
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

/* ── The companion, in the mood the window earned ──
   The sprite is a set of symbols that reference each other, and an SVG opened as
   an image resolves nothing outside itself — so the chosen pose is inlined into
   a standalone document: every symbol it uses is spliced into it, and what comes
   out carries no external reference at all. The palette variables keep their
   fallbacks, which is exactly how the character is drawn in the app. */

let spritePromise = null;

function spriteText() {
  if (!spritePromise) {
    spritePromise = fetch(QORQORI_URL)
      .then(r => (r.ok ? r.text() : ''))
      .catch(() => '');
  }
  return spritePromise;
}

async function mascotImage(expr) {
  const text = await spriteText();
  if (!text || typeof DOMParser === 'undefined') return null;
  let doc;
  try { doc = new DOMParser().parseFromString(text, 'image/svg+xml'); } catch { return null; }
  const symbols = new Map([...doc.querySelectorAll('symbol')].map(s => [s.id, s]));
  const pose = symbols.get(`qorqori-${expr}`) || symbols.get('qorqori-default');
  if (!pose) return null;

  /* Each shared part is drawn once per pose — the body under the arms, not the
     body twice — and the walk is depth-first, because a symbol may use another. */
  const used = new Set();
  const inline = node => {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return '';
    if (node.tagName.toLowerCase() === 'use') {
      const id = (node.getAttribute('href') || node.getAttribute('xlink:href') || '').replace('#', '');
      const target = symbols.get(id);
      if (!target || used.has(id)) return '';
      used.add(id);
      return [...target.childNodes].map(inline).join('');
    }
    const attrs = [...node.attributes].map(a => ` ${a.name}="${a.value}"`).join('');
    return `<${node.tagName}${attrs}>${[...node.childNodes].map(inline).join('')}</${node.tagName}>`;
  };

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400">'
    + [...pose.childNodes].map(inline).join('') + '</svg>';
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return { img, url };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/* How the companion takes the window: nothing yet and it is asleep, a run worth
   being pleased about and it is up. The pose is a mirror of the numbers, never a
   decoration that has to be explained. */
function mascotMood(model) {
  const h = model.headline;
  if (!model.hasAny) return 'sleepy';
  if (h.bestStreak >= 7 || h.done >= 25 || (h.rate !== null && h.rate >= 85 && h.done >= 6)) return 'celebrating';
  if ((h.delta > 0 && h.done >= 5) || h.bestStreak >= 4) return 'proud';
  if (h.done >= 3 || h.activeDays >= 3 || h.focusMinutes > 0 || model.reading.minutes > 0) return 'happy';
  return 'determined';
}

/* ═══ What the card says ═══ */

/* The hero is the biggest thing the window can say, in the order a reader would
   want to read it: what got done, how long they sat with it, what they read,
   and how many days they turned up. It is chosen, not set, so a reader with no
   ticks yet still gets a card about the part they did do. */
function heroPick(model) {
  const h = model.headline;
  const order = [
    ['done', h.done],
    ['focus', h.focusMinutes],
    ['read', model.reading.minutes],
    ['active', h.activeDays],
  ];
  const win = order.find(([, v]) => v > 0);
  if (!win) return { key: '', v: faNum(0), l: 'بازه‌ای که هنوز شروع نشده' };
  const m = metricByKey(win[0]);
  return { key: win[0], v: faNum(m.value(model)) + (m.suffix || ''), l: m.label };
}

/* The row under the hero: the numbers the reader asked for, minus the one the
   hero already took, minus the ones with nothing behind them — a column of
   zeroes is not a statistic, it is a hole with a number in it. */
function secondaryStats(model, style) {
  const hero = heroPick(model);
  const items = style.metrics
    .filter(k => k !== hero.key)
    .map(metricByKey)
    .filter(Boolean)
    .map(m => ({ icon: m.icon, l: m.label, v: faNum(m.value(model)) + (m.suffix || ''), n: m.value(model) }))
    .filter(it => it.n > 0);
  return items.slice(0, MAX_METRICS);
}

/* The two ends of the category list: what the window leaned on and what it
   almost forgot. «درس بیشتر، پروژه کمتر» is a sentence the reader can act on; a
   full breakdown is a table the card has no room for. */
function categoryRows(model) {
  const cats = model.cats || [];
  if (!cats.length) return [];
  if (cats.length === 1) return [{ cat: cats[0], label: 'بیشترین' }];
  return [{ cat: cats[0], label: 'بیشترین' }, { cat: cats[cats.length - 1], label: 'کمترین' }];
}

function deltaSentence(model) {
  const h = model.headline;
  if (!h.done && !h.donePrev) return '';
  if (h.delta === 0) return 'هم‌اندازهٔ بازهٔ قبل';
  return `${faNum(Math.abs(h.delta))} کار ${h.delta > 0 ? 'بیشتر' : 'کمتر'} از بازهٔ قبل`;
}

/* The closing line answers what the window actually holds, the way the rest of
   the app speaks: it is the one place the card talks, so it is written from the
   numbers rather than pasted under them. */
function closingSentence(model) {
  const h = model.headline;
  if (!model.hasAny) return 'شروعش سخت‌ترین بخشه — یه کار کوچیک کافیه.';
  if (h.bestStreak >= 7) return `${faNum(h.bestStreak)} روز پیاپی — این ریتم رو نگه دار.`;
  if (h.focusMinutes >= 90 && h.focusMinutes >= h.done * 25) return 'این بازه بیشتر تمرکز بود تا فقط تیک زدن.';
  if (h.delta >= 5) return `از بازهٔ قبل ${faNum(h.delta)} کار جلوتری — همین‌جور ادامه بده.`;
  if (h.rate !== null && h.rate >= 80 && h.done >= 5) return 'تقریباً هر کاری که شروع کردی، تا آخر رفت.';
  if (model.reading.minutes >= 60) return `این بازه ${faNum(model.reading.minutes)} دقیقه کتاب خوندی.`;
  if (h.activeDays >= 10) return `${faNum(h.activeDays)} روز از این بازه یه قدم برداشتی.`;
  if (h.done > 0) return 'همین چند قدم کوچیک، مسیر رو جلو می‌بره.';
  return 'این بازه بیشتر تمرکز و مطالعه بود تا تیک زدن.';
}

/* A day on the card: «۴ مهر». The year is written the way a reader writes it —
   every digit, no grouping separator — because ۱۴۰۵ is a year, not a quantity. */
const jalaliDay = ts => {
  const j = dateToJalali(new Date(ts));
  return `${faDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]}`;
};

/* ═══ Laying the middle out ═══
   Blocks keep the height they asked for, the slack is shared into the gaps (no
   more than maxGap each, so two blocks never drift to opposite ends of the
   paper), and whatever is still left over is split above and below the group.
   That is the whole layout engine: it is what lets a card with no name, no
   categories or no chart still look composed rather than assembled. */
function layoutStack(blocks, top, bottom, { gap = 24, maxGap = 72 } = {}) {
  if (!blocks.length) return [];
  const room = Math.max(0, bottom - top);
  const total = blocks.reduce((s, b) => s + b.h, 0);
  const gaps = blocks.length - 1;
  const slack = Math.max(0, room - total);
  const g = gaps ? clamp(slack / gaps, gap, maxGap) : 0;
  const used = total + g * gaps;
  /* A stack taller than its room is squeezed rather than allowed to spill: the
     proportions survive, only the scale changes. */
  const scale = used > room ? room / used : 1;
  let y = top + Math.max(0, (room - used) / 2);
  return blocks.map(b => {
    const box = { h: b.h * scale, y, draw: b.draw };
    y += b.h * scale + g;
    return box;
  });
}

/* ═══ The bands ═══ */

/* Who the card is about, and which stretch of time it is about: the reader's
   face and name at the start edge, the window as a small pill under the name,
   and the app's name — quietly — in the far corner. */
function drawIdentity(ctx, d, c, face, model) {
  const r = d.portrait ? 56 : 46;
  const cy = d.cardTop + (d.portrait ? 84 : 70) + r;
  const ax = d.right - r;
  drawFace(ctx, face, ax, cy, r, c);

  /* The name's column runs from the avatar to the brand's corner. */
  const nameW = d.cw - (r * 2 + 26) - 170;
  let ny = cy + 8;
  if (state.userName) {
    ctx.textAlign = 'right';
    ctx.font = `700 ${d.portrait ? 40 : 34}px ${FONT_UI}`;
    ctx.fillStyle = c.text;
    ctx.fillText(fitText(ctx, state.userName, nameW), ax - r - 24, ny);
    ny += d.portrait ? 46 : 40;
  }

  const label = model.range.sub;
  ctx.font = `600 ${d.portrait ? 25 : 23}px ${FONT_UI}`;
  const pw = ctx.measureText(label).width + 46;
  const ph = d.portrait ? 48 : 44;
  const px = ax - r - 24 - pw;
  fillRound(ctx, px, ny, pw, ph, ph / 2, c.softFill);
  ctx.textAlign = 'center';
  ctx.fillStyle = c.onSoft;
  ctx.fillText(label, px + pw / 2, ny + ph / 2 + 8);

  /* And the days that pill stands for, beside it: «۹۰ روز گذشته» says how long
     the window was, this says which days it covers — the one thing a reader of
     a shared card cannot work out on their own. It shares the pill's line rather
     than opening a row of its own, so the identity band costs the hero nothing. */
  ctx.textAlign = 'right';
  ctx.font = `400 ${d.portrait ? 22 : 20}px ${FONT_UI}`;
  ctx.fillStyle = c.soft;
  ctx.fillText(
    fitText(ctx, `از ${jalaliDay(model.window.from)} تا ${jalaliDay(model.window.to)}`, d.cw * 0.42),
    px - 18, ny + ph / 2 + 8,
  );

  /* The wordmark: the corner is the one place the app signs the picture, and it
     signs it small. */
  ctx.textAlign = 'left';
  ctx.font = `700 ${d.portrait ? 32 : 28}px ${FONT_MAD}`;
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = c.accent;
  ctx.fillText('دَفتَرچه', d.left, cy + 12);
  ctx.globalAlpha = 1;

  return { top: d.cardTop + 40, bottom: Math.max(cy + r, ny + ph) + 16 };
}

/* The emotional end of the card: a hairline, the sentence that answers the
   window, and the signature line under it. Anchored to the bottom of the paper
   rather than stacked on the cursor, so a tall card keeps its footer where a
   reader's eye expects a footer. */
function drawClosing(ctx, d, c, model) {
  const brandY = d.cardBottom - (d.portrait ? 74 : 56);
  const size = d.portrait ? 40 : 34;
  ctx.textAlign = 'center';
  ctx.font = `700 ${size}px ${FONT_UI}`;
  const lines = wrapText(ctx, closingSentence(model), d.cw - 40, 2);

  const lastLine = brandY - (d.portrait ? 74 : 62);
  const firstLine = lastLine - (lines.length - 1) * size * 1.5;
  const divY = firstLine - size * 1.9;

  ctx.fillStyle = c.grid;
  ctx.fillRect(d.left, divY, d.cw, 2);

  ctx.fillStyle = c.text;
  lines.forEach((ln, i) => ctx.fillText(ln, d.cx, firstLine + i * size * 1.5));

  ctx.font = `400 ${d.portrait ? 24 : 22}px ${FONT_UI}`;
  ctx.fillStyle = c.soft;
  ctx.fillText('ساخته‌شده با دَفتَرچه', d.cx, brandY);

  return { top: divY - 30 };
}

const drawDeltaChip = (ctx, d, c, text, y, cx = d.cx) => {
  ctx.textAlign = 'center';
  ctx.font = `600 ${d.portrait ? 26 : 24}px ${FONT_UI}`;
  const w = ctx.measureText(text).width + 52;
  const h = d.portrait ? 52 : 48;
  fillRound(ctx, cx - w / 2, y, w, h, h / 2, c.softFill);
  ctx.fillStyle = c.onSoft;
  ctx.fillText(text, cx, y + h / 2 + 9);
};

/* ═══ The card ═══ */

async function fontsReady() {
  if (!document.fonts || !document.fonts.load) return;
  const mad = [340, 260, 220, 190, 160, 120, 96, 60, 48, 40];
  const ui = [40, 34, 30, 26, 24, 23, 22, 20, 19, 18];
  try {
    await Promise.all([
      ...mad.map(s => document.fonts.load(`700 ${s}px ${FONT_MAD}`)),
      ...ui.flatMap(s => [
        document.fonts.load(`700 ${s}px ${FONT_UI}`),
        document.fonts.load(`600 ${s}px ${FONT_UI}`),
        document.fonts.load(`400 ${s}px ${FONT_UI}`),
      ]),
    ]);
  } catch { /* a font that will not load still paints, in the system fallback */ }
}

/* ── The blocks ──
   Each one is a height and a way to draw itself at a given y. They are built
   from the model and the room they were given, which is why a layout can ask for
   a block in one line and trust it to fit. */

function blockMascot(ctx, d, c, mascot, h) {
  return {
    h,
    draw(y) {
      if (!mascot) return;
      const w = h;
      ctx.save();
      /* A soft shadow on the ground under it: the companion stands on the card
         rather than floating over it. */
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = c.text;
      ctx.beginPath();
      ctx.ellipse(d.cx, y + h - h * 0.035, w * 0.32, h * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.drawImage(mascot.img, d.cx - w / 2, y, w, h);
    },
  };
}

/* The number the card leads with. Its size is derived from the room that is
   actually left above the label and the comparison chip, and then trimmed until
   the digits themselves fit the width — a four-digit window («۱۲۳۴ کار») is not
   allowed to run off the paper, it is allowed to be smaller. */
function fitFontSize(ctx, str, maxW, start, min, font) {
  let size = Math.max(min, Math.round(start));
  for (;;) {
    ctx.font = `700 ${size}px ${font}`;
    if (size <= min || ctx.measureText(str).width <= maxW) return size;
    size -= 4;
  }
}

function blockHero(ctx, d, c, model, hero, h, { showDelta = false } = {}) {
  const delta = showDelta ? deltaSentence(model) : '';
  const chipH = delta ? (d.portrait ? 52 : 48) : 0;
  return {
    h,
    draw(y) {
      const labelBase = y + h - chipH - (chipH ? 16 : 0);
      const numberBase = labelBase - (d.portrait ? 58 : 48);
      const size = fitFontSize(ctx, hero.v, d.cw - 60, (numberBase - y) / 0.78, 84, FONT_MAD);
      ctx.textAlign = 'center';
      ctx.font = `700 ${size}px ${FONT_MAD}`;
      ctx.fillStyle = c.accent;
      ctx.fillText(hero.v, d.cx, numberBase);
      ctx.font = `400 ${d.portrait ? 32 : 29}px ${FONT_UI}`;
      ctx.fillStyle = c.soft;
      ctx.fillText(fitText(ctx, hero.l, d.cw - 80), d.cx, labelBase);
      if (delta) drawDeltaChip(ctx, d, c, delta, y + h - chipH);
    },
  };
}

function blockStats(ctx, d, c, items) {
  const h = d.portrait ? 158 : 132;
  return {
    h,
    draw(y) {
      fillRound(ctx, d.left, y, d.cw, h, 38, c.bg);
      strokeRound(ctx, d.left + 1, y + 1, d.cw - 2, h - 2, 37, c.border, 2);
      const n = items.length;
      const colW = d.cw / n;
      const icon = d.portrait ? 52 : 46;
      items.forEach((it, i) => {
        const cx = d.cx + colW * ((n - 1) / 2 - i);
        fillRound(ctx, cx - icon / 2, y + (d.portrait ? 24 : 20), icon, icon, icon * 0.34, c.softFill);
        drawIcon(ctx, it.icon, cx, y + (d.portrait ? 24 : 20) + icon / 2, icon * 0.52, c.onSoft);
        ctx.textAlign = 'center';
        ctx.font = `700 ${d.portrait ? 54 : 46}px ${FONT_MAD}`;
        ctx.fillStyle = c.text;
        ctx.fillText(it.v, cx, y + h - (d.portrait ? 48 : 40));
        ctx.font = `400 ${d.portrait ? 22 : 20}px ${FONT_UI}`;
        ctx.fillStyle = c.soft;
        ctx.fillText(fitText(ctx, it.l, colW - 26), cx, y + h - (d.portrait ? 16 : 13));
        /* The separators mirror each other about the axis: a column boundary,
           drawn solid because a dashed rule reads as something not filled in. */
        if (i > 0) {
          const sx = d.cx + colW * ((n - 1) / 2 - i + 0.5);
          ctx.fillStyle = c.grid;
          ctx.fillRect(sx - 1, y + 28, 2, h - 60);
        }
      });
    },
  };
}

function blockCats(ctx, d, c, rows, topCount) {
  const h = 58 + rows.length * 62;
  return {
    h,
    draw(y) {
      ctx.textAlign = 'right';
      ctx.font = `600 ${d.portrait ? 26 : 25}px ${FONT_UI}`;
      ctx.fillStyle = c.soft;
      ctx.fillText('دسته‌ها', d.right, y + 26);
      ctx.textAlign = 'left';
      ctx.font = `400 21px ${FONT_UI}`;
      ctx.fillText('سهم این بازه', d.left, y + 26);

      const trackEnd = d.right - 130;
      const trackStart = d.left + 190;
      const trackW = Math.max(80, trackEnd - trackStart);
      rows.forEach((row, i) => {
        const ry = y + 52 + i * 62;
        const hue = readable(row.cat.color, c.surface, 2, c.accent);
        ctx.textAlign = 'right';
        ctx.font = `600 25px ${FONT_UI}`;
        ctx.fillStyle = c.text;
        ctx.fillText(fitText(ctx, row.cat.label, 120), d.right, ry + 22);
        ctx.font = `400 19px ${FONT_UI}`;
        ctx.fillStyle = c.soft;
        ctx.fillText(row.label, d.right, ry + 50);
        fillRound(ctx, trackEnd - trackW, ry + 8, trackW, 18, 9, c.grid);
        const w = Math.max(18, (row.cat.count / topCount) * trackW);
        fillRound(ctx, trackEnd - w, ry + 8, w, 18, 9, hue);
        ctx.textAlign = 'left';
        ctx.font = `700 23px ${FONT_UI}`;
        ctx.fillStyle = c.soft;
        ctx.fillText(`${faNum(row.cat.count)} کار`, d.left, ry + 24);
      });
    },
  };
}

/* The shape of the window: the one block that grows, so a tall card is filled by
   the window itself rather than by empty space. Oldest on the right, the way the
   app's own chart reads, today in full accent and every other bar quieter. */
function blockChart(ctx, d, c, model, h) {
  const buckets = model.buckets;
  return {
    h,
    draw(y) {
      const n = Math.max(buckets.length, 1);
      const max = Math.max(...buckets.map(b => b.done), 1);
      ctx.textAlign = 'right';
      ctx.font = `600 25px ${FONT_UI}`;
      ctx.fillStyle = c.soft;
      ctx.fillText('روند بازه', d.right, y + 26);
      ctx.textAlign = 'left';
      ctx.font = `400 20px ${FONT_UI}`;
      if (max > 1) ctx.fillText(`بیشترین: ${faNum(max)} کار`, d.left, y + 26);

      const base = y + h - 4;
      const gap = n > 20 ? 6 : n > 8 ? 14 : 24;
      const bw = Math.max(6, (d.cw - gap * (n - 1)) / n);
      const top = y + 56;
      const barH = Math.max(24, base - top);
      const stub = cssColor(mixColor(parseColor(c.grid) || [0, 0, 0, 0.12], parseColor(c.surface) || [255, 255, 255, 1], 0.35));
      buckets.forEach((b, i) => {
        const x = d.right - bw - i * (bw + gap);
        if (!b.done) {
          fillRound(ctx, x, base - 7, bw, 7, 3.5, stub);
          return;
        }
        const bh = 16 + (b.done / max) * (barH - 16);
        ctx.save();
        ctx.globalAlpha = b.today ? 1 : 0.4;
        fillRound(ctx, x, base - bh, bw, bh, Math.min(9, bw / 2), c.accent);
        ctx.restore();
      });
      ctx.fillStyle = c.grid;
      ctx.fillRect(d.left, base + 2, d.cw, 3);
    },
  };
}

/* The hero band of «کلاسیک»: the companion and the number as one pair, standing
   together on the card's axis. The number's size comes from the room above the
   label — height, not width, is what makes a figure read as the hero — and the
   pair is then centred as a whole, so the companion sits at the number's
   shoulder instead of drifting to the far edge of the paper. */
function blockHeroBand(ctx, d, c, model, hero, mascot, h) {
  const delta = deltaSentence(model);
  const chipH = delta ? 48 : 0;
  const mh = mascot ? Math.min(h * 0.66, 240) : 0;
  const room = d.cw - mh - 40;          // the width the digits may use
  return {
    h,
    draw(y) {
      const labelBase = y + h - chipH - 14;
      const numberBase = labelBase - 50;
      const size = fitFontSize(ctx, hero.v, room, (numberBase - y) / 0.78, 90, FONT_MAD);
      ctx.font = `700 ${size}px ${FONT_MAD}`;
      const numW = ctx.measureText(hero.v).width;
      const groupW = numW + (mascot ? mh + 40 : 0);
      const groupRight = d.cx + groupW / 2;      /* the pair, centred on the axis */
      const numCx = groupRight - (mascot ? mh + 40 : 0) - numW / 2;

      if (mascot) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = c.text;
        ctx.beginPath();
        ctx.ellipse(groupRight - mh / 2, y + (h + mh) / 2 - 4, mh * 0.3, mh * 0.032, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.drawImage(mascot.img, groupRight - mh, y + (h - mh) / 2, mh, mh);
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = c.accent;
      ctx.fillText(hero.v, numCx, numberBase);
      ctx.font = `400 29px ${FONT_UI}`;
      ctx.fillStyle = c.soft;
      ctx.fillText(fitText(ctx, hero.l, d.cw * 0.7), d.cx, labelBase);
      if (delta) drawDeltaChip(ctx, d, c, delta, y + h - chipH);
    },
  };
}

/* The blocks a layout puts between the identity and the closing line. The room
   is what the two bands left behind, and every height below is a fraction of it
   — so the same code composes a square card and a story. */
function planBlocks(ctx, layout, d, c, model, mascot, room) {
  const hero = heroPick(model);
  const stats = secondaryStats(model, styleState);
  const rows = layout === 'dense' ? categoryRows(model) : [];

  /* «شاخص» spends everything on one figure: no numbers beside it, no categories,
     no chart — the room the other layouts divide is what makes this one loud. */
  if (layout === 'hero') {
    const mascotH = clamp(room * 0.3, 190, 280);
    const heroH = clamp(room * 0.56, 240, 460);
    return [
      blockMascot(ctx, d, c, mascot, mascotH),
      blockHero(ctx, d, c, model, hero, heroH),
    ];
  }

  /* «فشرده» is the story: the same blocks as «کلاسیک» plus the categories, with
     the chart last and allowed to grow — it is what turns the extra height of a
     9:16 paper into the shape of the window instead of a gap. */
  if (layout === 'dense') {
    const mascotH = clamp(room * 0.22, 230, 360);
    const heroH = clamp(room * 0.24, 210, 330);
    const statsH = stats.length ? (d.portrait ? 158 : 132) : 0;
    const catsH = rows.length ? 58 + rows.length * 62 : 0;
    const count = (statsH ? 1 : 0) + (catsH ? 1 : 0) + 2;
    const chartH = clamp(room - (mascotH + heroH + statsH + catsH) - 30 * (count - 1), 150, 520);
    const blocks = [
      blockMascot(ctx, d, c, mascot, mascotH),
      blockHero(ctx, d, c, model, hero, heroH, { showDelta: true }),
    ];
    if (stats.length) blocks.push(blockStats(ctx, d, c, stats));
    if (rows.length) blocks.push(blockCats(ctx, d, c, rows, Math.max(rows[0].cat.count, 1)));
    blocks.push(blockChart(ctx, d, c, model, chartH));
    return blocks;
  }

  /* «کلاسیک»: the companion and the number share a band — facing each other
     across it — and the slip of numbers sits under them. The number is given the
     most room of anything on the card, which is the whole point of a hero. */
  const heroH = clamp(room * 0.68, 260, 460);
  const blocks = [blockHeroBand(ctx, d, c, model, hero, mascot, heroH)];
  if (stats.length) blocks.push(blockStats(ctx, d, c, stats));
  return blocks;
}

async function paintCard(model, style = styleState) {
  const d = dimsFor(style.layout);
  const canvas = document.createElement('canvas');
  canvas.width = d.W;
  canvas.height = d.H;
  const ctx = canvas.getContext('2d');
  const c = accentFor(palette(), style.accent);
  const [face, mascot] = await Promise.all([faceImage(), mascotImage(mascotMood(model))]);

  try {
    ctx.direction = 'rtl';
    ctx.textBaseline = 'alphabetic';

    /* Paper, then the card, then the accent hairline that holds its top edge. */
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, d.W, d.H);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.20)';
    ctx.shadowBlur = 46;
    ctx.shadowOffsetY = 20;
    rounded(ctx, d.pad, d.pad, d.W - 2 * d.pad, d.H - 2 * d.pad, R);
    ctx.fillStyle = c.surface;
    ctx.fill();
    ctx.restore();

    ctx.save();
    rounded(ctx, d.pad, d.pad, d.W - 2 * d.pad, d.H - 2 * d.pad, R);
    ctx.clip();
    ctx.fillStyle = c.accent;
    ctx.fillRect(d.pad, d.pad, d.W - 2 * d.pad, HAIRLINE);
    ctx.restore();

    const band = drawIdentity(ctx, d, c, face, model);
    const foot = drawClosing(ctx, d, c, model);

    const blocks = planBlocks(ctx, style.layout, d, c, model, mascot, Math.max(0, foot.top - band.bottom));
    layoutStack(blocks, band.bottom, foot.top, {
      gap: d.portrait ? 30 : 24,
      maxGap: style.layout === 'hero' ? 110 : d.portrait ? 84 : 72,
    }).forEach(b => b.draw(b.y));
  } finally {
    if (face && face.url) URL.revokeObjectURL(face.url);
    if (mascot && mascot.url) URL.revokeObjectURL(mascot.url);
  }

  return canvas;
}

/* ═══ Preview and delivery ═══ */

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
   The rows are the shared picker (js/chipgroup.js), filled with the same lists
   the painter reads — so a template cannot exist in the dialog and be missing
   from the card. What belongs to the card is what a choice *means*: the panel
   wears the chosen palette (which is also where the canvas reads its colours
   from), the accent chip wears the hue it would print with, and every choice
   repaints the preview in place. */

let themeRow = { mark() {}, setMode() {} };
let layoutRow = { mark() {} };
let accentRow = { mark() {} };
let metricRow = { mark() {} };

/* The accent chips show the hue itself. «خودکار» shows the colour the card is
   wearing right now, so it has to be re-painted whenever the palette changes —
   which is why it is refreshed from markPicker rather than built once. */
const accentChipPaint = (key, hex) => {
  const dot = $(`#shareAccentChips [data-key="${key}"] .pick-dot`);
  if (dot) {
    dot.style.background = hex;
    dot.style.boxShadow = `inset 0 0 0 3px ${hex}`;
  }
};

function markPicker() {
  /* The palette row shows the half the app is in, so it is told which half that
     is before it is marked — otherwise the chosen chip could be a hidden one. */
  themeRow.setMode(currentMode());
  themeRow.mark(styleState.theme);
  layoutRow.mark(styleState.layout);
  accentRow.mark(styleState.accent);
  metricRow.mark(styleState.metrics);

  /* How full the numbers row is, said in the row's own label: the third pick
     fills it, and a fourth swaps with the oldest rather than being refused —
     so the count is the cheapest way to tell the reader where they stand
     without a disabled chip or an error message. Each chip carries its place
     (۱، ۲، ۳) at the same time, which is what the card will print. */
  const count = $('#shareMetricsCount');
  if (count) count.textContent = `${faDigits(styleState.metrics.length)} از ${faDigits(MAX_METRICS)}`;

  const panel = $('.share-panel');
  if (!panel) return;
  const pal = paletteKey(styleState.theme);
  /* «برنامه» has no palette of its own, so the attribute is taken off rather
     than set to a name nothing defines; palette() then falls back to the
     interface's own tokens, which is exactly what the template asks for. */
  if (pal) panel.dataset.palette = pal;
  else delete panel.dataset.palette;
  panel.dataset.cardLayout = styleState.layout;

  /* Read after the attribute is written, so the dot shows the palette the card
     is about to be painted with rather than the one it had. */
  const live = accentFor(palette(), 'auto');
  ACCENTS.forEach(a => accentChipPaint(a.key, a.tint ? (live.dark ? a.tint.dark : a.tint.light) : live.accent));
}

function save() {
  saveCardStyle({
    theme: styleState.theme,
    layout: styleState.layout,
    accent: styleState.accent,
    metrics: [...styleState.metrics],
  });
}

function pick(group, key) {
  const lists = {
    theme: THEMES,
    layout: LAYOUTS,
    accent: ACCENTS,
  };
  const field = group;
  const list = lists[group];
  if (!list || !key || !list.some(t => t.key === key) || styleState[field] === key) return;
  styleState = { ...styleState, [field]: key };
  save();
  /* Marked before the paint: the palette is read off the panel, so the new chip
     has to be the marked one by the time the canvas asks for it. */
  markPicker();
  renderCard();
}

/* The metrics row is a queue rather than a radio group: a fourth pick takes the
   place of the oldest one instead of being refused, so the row never becomes a
   dead end the reader has to undo their way out of. */
function toggleMetric(key) {
  if (!metricByKey(key)) return;
  const on = styleState.metrics.includes(key);
  const next = on
    ? styleState.metrics.filter(k => k !== key)
    : [...styleState.metrics, key].slice(-MAX_METRICS);
  if (!next.length) return;   // a card with no numbers at all is not a choice
  styleState = { ...styleState, metrics: next };
  save();
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
  if (spinner && !img?.src) spinner.hidden = false;
  cardBlob = null;

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
    if (img) {
      img.src = url;
      img.hidden = false;
      /* The new card rises into place: a layout change is a different picture,
         and letting it appear under the old one's size makes the swap read as a
         change rather than a glitch. */
      img.classList.remove('is-new');
      void img.offsetWidth;
      img.classList.add('is-new');
    }
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
     the first paint: the palette is read off the panel. */
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
     never reach across the rows that both choose a colour. */
  themeRow = pickerRow($('#shareThemeChips'), THEMES, { group: 'card-theme', onPick: k => pick('theme', k) });
  layoutRow = pickerRow($('#shareLayoutChips'), LAYOUTS, { group: 'card-layout', onPick: k => pick('layout', k) });
  accentRow = pickerRow($('#shareAccentChips'), ACCENTS, { group: 'card-accent', onPick: k => pick('accent', k) });
  metricRow = toggleRow($('#shareMetricsChips'), METRICS, { group: 'card-metrics', onToggle: toggleMetric });
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
