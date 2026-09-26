/* ═══ Theme audit ═══
   The eight themes are written down in three places that have to agree, and none
   of them can see the others: the list in js/constants.js, the palette table and
   the html[data-theme] blocks in css/base.css, and the small script inside
   index.html that paints the theme before the first frame. One key typed wrong
   in any of the three is a theme that silently does not exist — the picker shows
   a chip that paints nothing, or the boot script flashes the wrong colour.

   It also measures. A palette that misses a contrast floor looks perfectly fine
   to whoever wrote it (their screen, their eyes, the light of their room) and
   unreadable to somebody else — which is exactly how «کاغذ» shipped for months
   with an accent at 2.5:1 on its own paper before a measurement caught it.

   Run it with:   node --test tests/
   or directly:   node tests/themes.test.mjs
   No dependencies: node:test and node:assert are both in the runtime, and this
   project has no build step and no package.json to hang a script on. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  THEMES, THEME_KEYS, THEME_MODES, DEFAULT_THEME, NIGHT_THEME,
  normalizeTheme, modeOf, themesOfMode,
} from '../js/constants.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = path => readFileSync(join(HERE, '..', path), 'utf8');

const CSS = read('css/base.css');
/* The picker's own rules live here — the swatch grid, the segmented control, and
   the two hiding rules that decide which half of the table is on screen. */
const COMPONENTS2 = read('css/components2.css');
const HTML = read('index.html');

/* The fourteen values a palette is made of. meaning colours (success, warning,
   danger) are deliberately not here: they are shared by mode, not by palette. */
const PALETTE_TOKENS = [
  'bg', 'surface', 'elev', 'text', 'text2', 'muted',
  'border', 'border-strong', 'accent', 'accent-strong', 'accent-soft',
  'tape', 'glass', 'on-accent',
];

/* The fifteen slots a theme block fills from its palette. */
const THEME_TOKENS = [
  '--color-bg', '--color-surface', '--color-surface-elevated',
  '--color-text-primary', '--color-text-secondary', '--color-text-muted',
  '--color-text-on-accent', '--color-border', '--color-border-strong',
  '--color-accent', '--color-accent-strong', '--color-accent-soft',
  '--color-focus', '--tape', '--glass',
];

/* The card's own vocabulary plus the dot a picker paints, all cut from the same
   palette — which is what keeps a printed card from drifting from the app. */
const CARD_TOKENS = [
  '--card-bg', '--card-surface', '--card-text', '--card-muted', '--card-accent',
  '--card-accent-soft', '--card-border', '--card-grid', '--card-tape',
  '--pick-dot-bg', '--pick-dot-ring',
];

/* ── reading the sheet ──
   Every block this cares about starts at the beginning of a line, so the parser
   anchors there: it is what stops `html[data-mode="dark"] .bottom-nav{...}` from
   being read as if it were a mode block. */

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Every body for a selector, in order. A selector can legitimately appear more
   than once — `:root` holds the safe-area insets before it holds the tokens — so
   a caller that wants a particular one has to say which. */
function blockBodies(selector) {
  const out = [];
  const re = new RegExp(`^${escapeRe(selector)}\\{`, 'gm');
  let m;
  while ((m = re.exec(CSS))) {
    const start = m.index + m[0].length;
    const end = CSS.indexOf('}', start);
    if (end > -1) out.push(CSS.slice(start, end));
  }
  return out;
}

/* The token block, not the safe-area one, wherever it has drifted to. */
const defaultBlock = () => blockBodies(':root').find(body => body.includes('--color-bg')) ?? null;

const blockBody = selector => blockBodies(selector)[0] ?? null;

/* Comments come out first: a colon in a sentence would otherwise read as a
   declaration, and these blocks are written with a paragraph above the values. */
const declarations = body => {
  const out = {};
  if (!body) return out;
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
  /* Properties, not just custom properties: `color-scheme` is a real one and it
     is one of the things that has to stay in step with the theme's mode. */
  for (const m of clean.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
};

const themeBlock = key => declarations(blockBody(`html[data-theme="${key}"]`));
const cardBlock = key => declarations(blockBody(`[data-palette="${key}"]`));
const modeBlock = mode => declarations(blockBody(`html[data-mode="${mode}"]`));

/* The palette table: every `--pal-<theme>-<token>: value` line in the sheet. */
const palettes = {};
for (const m of CSS.matchAll(/^\s*--pal-([a-z]+)-([a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
  (palettes[m[1]] ||= {})[m[2]] = m[3].trim();
}

/* Every `var(--pal-…)` the sheet consumes, and every one it declares. A
   reference with no declaration resolves to nothing, which paints as transparent
   rather than as an error. */
const referenced = new Set([...CSS.matchAll(/var\((--pal-[a-z0-9-]+)[,)]/g)].map(m => m[1]));
const declared = new Set([...CSS.matchAll(/^\s*(--pal-[a-z0-9-]+)\s*:/gm)].map(m => m[1]));

/* ── reading the boot script ──
   The one copy of the theme list that cannot import the others, because it runs
   before any module has been fetched. */
const bootList = name => {
  const m = new RegExp(`var ${name} = \\[([^\\]]*)\\]`).exec(HTML);
  assert.ok(m, `index.html has no \`var ${name} = [...]\``);
  return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
};

const BOOT_KEYS = bootList('KEYS');
const BOOT_DARK = bootList('DARK');
const BOOT_ALIAS = Object.fromEntries(
  [...(/var ALIAS = \{([^}]*)\}/.exec(HTML)?.[1] || '')
    .matchAll(/(\w+)\s*:\s*'(\w+)'/g)].map(m => [m[1], m[2]]),
);
const BOOT_DEFAULTS = (() => {
  const m = /matchMedia\('\(prefers-color-scheme:dark\)'\)\.matches \? '(\w+)' : '(\w+)'/.exec(HTML);
  assert.ok(m, 'index.html boot script has no prefers-color-scheme fallback');
  return { dark: m[1], light: m[2] };
})();

/* ── colour maths ──
   The same three functions the share card uses, kept here in miniature so the
   numbers in the messages are the numbers a reader would get. */

function parseColor(str) {
  if (!str) return null;
  const s = String(str).trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
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

const luminance = ([r, g, b]) => {
  const f = v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contrast = (a, b) => {
  const A = luminance(a), B = luminance(b);
  return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
};

/* A translucent colour, laid over what is behind it: what a reader sees for a
   soft accent fill is the accent mixed with the paper under it. */
const over = (fg, bg) => (fg[3] >= 1
  ? fg
  : [fg[0] * fg[3] + bg[0] * (1 - fg[3]),
     fg[1] * fg[3] + bg[1] * (1 - fg[3]),
     fg[2] * fg[3] + bg[2] * (1 - fg[3]), 1]);

/* The floors, each with the reason it is what it is. */
const FLOORS = [
  { what: 'body text on the page', fg: '--color-text-primary', bg: '--color-bg', min: 4.5 },
  { what: 'body text on a card', fg: '--color-text-primary', bg: '--color-surface', min: 4.5 },
  { what: 'secondary text on a card', fg: '--color-text-muted', bg: '--color-surface', min: 3 },
  { what: 'the accent as an edge or an icon', fg: '--color-accent', bg: '--color-bg', min: 3 },
  { what: 'the label on an accent button', fg: '--color-text-on-accent', bg: '--color-accent', min: 4.5 },
  { what: 'text on a soft accent fill', fg: '--color-text-primary', bg: '--color-accent-soft', min: 4.5 },
  { what: 'the focus ring', fg: '--color-focus', bg: '--color-bg', min: 3 },
];

test('every theme in js/constants.js is a complete palette in css/base.css', () => {
  for (const theme of THEMES) {
    const palette = palettes[theme.palette];
    assert.ok(palette, `no --pal-${theme.palette}-* block in css/base.css for theme «${theme.key}»`);
    const missing = PALETTE_TOKENS.filter(t => !(t in palette));
    assert.deepEqual(missing, [], `--pal-${theme.palette}-* is missing: ${missing.join(', ')}`);
    const extra = Object.keys(palette).filter(t => !PALETTE_TOKENS.includes(t));
    assert.deepEqual(extra, [], `--pal-${theme.palette}-* has tokens nothing reads: ${extra.join(', ')}`);
  }
});

test('no palette value is empty, and every token the sheet consumes is declared', () => {
  for (const [name, palette] of Object.entries(palettes)) {
    for (const [token, value] of Object.entries(palette)) {
      assert.ok(value.length > 0, `--pal-${name}-${token} is empty`);
    }
  }
  const dangling = [...referenced].filter(name => !declared.has(name)).sort();
  assert.deepEqual(dangling, [], `consumed but never declared: ${dangling.join(', ')}`);
});

test('palette values are colours the share card can parse', () => {
  /* The card reads its colours out of getComputedStyle and its parser only
     understands #hex and rgb()/rgba(). A palette written with color-mix() would
     resolve to `color(srgb …)` in Chromium, the parser would return null, and the
     card would silently fall back to black and white — taking its measured
     contrast system with it. Hence plain colours, forever. */
  for (const [name, palette] of Object.entries(palettes)) {
    for (const [token, value] of Object.entries(palette)) {
      assert.ok(parseColor(value), `--pal-${name}-${token} is "${value}" — not a #hex or rgba() the card can read`);
    }
  }
  assert.ok(!/color-mix\(|color\(srgb|oklch\(/.test(defaultBlock() || ''),
    'the default token block uses a colour function the card cannot parse');
});

test('every theme block fills all fifteen slots from its own palette', () => {
  for (const theme of THEMES) {
    const block = themeBlock(theme.key);
    assert.ok(Object.keys(block).length, `no html[data-theme="${theme.key}"] block in css/base.css`);
    const missing = THEME_TOKENS.filter(t => !(t in block));
    assert.deepEqual(missing, [], `html[data-theme="${theme.key}"] leaves ${missing.join(', ')} unset`);
    /* And each slot has to point at this theme's own palette: a copy-pasted
       block that still names the previous one is the mistake this catches.
       `color-scheme` is the one real property in here and maps nothing. */
    for (const [token, value] of Object.entries(block)) {
      if (!token.startsWith('--')) continue;
      const ref = /^var\((--pal-([a-z]+)-[a-z0-9-]+)\)$/.exec(value);
      assert.ok(ref, `html[data-theme="${theme.key}"] sets ${token} to "${value}" — a theme block only maps its palette`);
      assert.equal(ref[2], theme.palette,
        `html[data-theme="${theme.key}"] maps ${token} from «${ref[2]}», which is not its palette «${theme.palette}»`);
    }
  }
});

test('every palette has a card block wired to that same palette', () => {
  for (const theme of THEMES) {
    const block = cardBlock(theme.palette);
    assert.ok(Object.keys(block).length, `no [data-palette="${theme.palette}"] block in css/base.css`);
    const missing = CARD_TOKENS.filter(t => !(t in block));
    assert.deepEqual(missing, [], `[data-palette="${theme.palette}"] leaves ${missing.join(', ')} unset`);
    for (const [token, value] of Object.entries(block)) {
      assert.ok(new RegExp(`^var\\(--pal-${theme.palette}-`).test(value),
        `[data-palette="${theme.palette}"] maps ${token} to "${value}" — it must come from its own palette`);
    }
  }
});

test('the three sources agree on which themes exist', () => {
  assert.deepEqual(BOOT_KEYS, THEME_KEYS,
    'the boot script in index.html and js/constants.js disagree about the theme keys');
  assert.deepEqual(BOOT_DARK, themesOfMode('dark').map(t => t.key),
    'the boot script\'s dark list disagrees with the themes whose mode is dark');
  assert.deepEqual(THEME_KEYS, THEMES.map(t => t.key));
  assert.equal(new Set(THEME_KEYS).size, THEME_KEYS.length, 'a theme key is used twice');
  for (const mode of THEME_MODES) {
    assert.ok(themesOfMode(mode).length >= 2, `the ${mode} half of the table has fewer than two themes`);
  }
});

test('color-scheme follows the mode, in both the theme block and the mode block', () => {
  for (const theme of THEMES) {
    const scheme = themeBlock(theme.key)['color-scheme'];
    assert.equal(scheme, theme.mode, `html[data-theme="${theme.key}"] declares color-scheme:${scheme}`);
  }
  assert.equal(modeBlock('light')['color-scheme'], 'light');
  assert.equal(modeBlock('dark')['color-scheme'], 'dark');
  /* The mode blocks are also where the shared decisions live, so a theme never
     has to restate them. */
  for (const mode of THEME_MODES) {
    const block = modeBlock(mode);
    for (const token of ['--state-success', '--state-warning', '--state-danger', '--state-glass-hover', '--shadow-1', '--shadow-2']) {
      assert.ok(block[token], `html[data-mode="${mode}"] does not set ${token}`);
    }
  }
});

test('the default theme is the one :root and the boot script point at', () => {
  assert.ok(THEME_KEYS.includes(DEFAULT_THEME), 'DEFAULT_THEME is not one of THEMES');
  assert.equal(THEME_KEYS[0], DEFAULT_THEME, 'the first theme in the table is meant to be the default');
  assert.equal(modeOf(DEFAULT_THEME), 'light', 'the default theme belongs to the light half');
  assert.ok(THEME_KEYS.includes(NIGHT_THEME), 'NIGHT_THEME is not one of THEMES');
  assert.equal(modeOf(NIGHT_THEME), 'dark', 'NIGHT_THEME belongs to the dark half');

  /* :root is the default theme written out longhand, so the two cannot drift. */
  const root = declarations(defaultBlock());
  assert.equal(root['--color-bg'], `var(--pal-${DEFAULT_THEME}-bg)`);
  assert.equal(root['--color-accent'], `var(--pal-${DEFAULT_THEME}-accent)`);
  assert.equal(root['--color-text-muted'], `var(--pal-${DEFAULT_THEME}-muted)`);
  assert.equal(root['--tape'], `var(--pal-${DEFAULT_THEME}-tape)`);

  assert.equal(BOOT_DEFAULTS.light, DEFAULT_THEME, 'a first visit on a light system should land on the default theme');
  assert.equal(BOOT_DEFAULTS.dark, NIGHT_THEME, 'a first visit on a dark system should land on the night theme');
});

test('keys an older build wrote down still resolve to a real theme', () => {
  for (const [legacy, expected] of Object.entries(BOOT_ALIAS)) {
    assert.equal(normalizeTheme(legacy), expected, `the boot script maps «${legacy}» to «${expected}»`);
    assert.ok(THEME_KEYS.includes(expected), `«${legacy}» maps to «${expected}», which is not a theme`);
  }
  assert.equal(normalizeTheme('night'), 'night', 'a stored key whose meaning has not changed must pass through');
  assert.equal(normalizeTheme('nonsense'), '', 'an unknown key must come back empty, not as itself');
  assert.equal(normalizeTheme(''), '');
  assert.equal(modeOf('nonsense'), modeOf(DEFAULT_THEME), 'an unknown key still needs a mode');
});

/* A theme is read the way the browser reads it: the block names a slot, the slot
   points at a palette value, and `mode` blocks supply the tokens a theme does not
   write down itself. This resolves one step of that indirection, which is all the
   sheet has. */
function resolveToken(theme, get) {
  const decls = { ...themeBlock(theme.key), ...modeBlock(theme.mode) };
  return token => {
    const raw = decls[token];
    if (!raw) return null;
    /* A palette name is letters only, which is what keeps `--pal-gold-accent-soft`
       from being read as palette «gold-accent» and token «soft». */
    const ref = /^var\(--pal-([a-z]+)-([a-z0-9-]+)\)$/.exec(raw);
    return ref ? (palettes[ref[1]]?.[ref[2]] ?? null) : raw;
  };
}

test('contrast floors hold in every theme', () => {
  const failures = [];
  const missing = [];

  for (const theme of THEMES) {
    const value = resolveToken(theme);
    const colour = token => {
      const raw = value(token);
      if (raw === null) { missing.push(`«${theme.key}» ${token}`); return null; }
      const parsed = parseColor(raw);
      if (!parsed) missing.push(`«${theme.key}» ${token} = "${raw}"`);
      return parsed;
    };

    /* The surface a translucent fill is laid over, resolved once per theme. */
    const surface = colour('--color-surface');

    for (const floor of FLOORS) {
      const fg = colour(floor.fg);
      let bg = colour(floor.bg);
      if (!fg || !bg) continue;
      /* A soft accent fill is not what the page paints — what a reader sees is
         that fill mixed with the surface under it. */
      if (fg[3] < 1 || bg[3] < 1) bg = over(bg, surface || [255, 255, 255, 1]);
      const ratio = contrast(fg, bg);
      if (ratio < floor.min) {
        failures.push(`«${theme.key}» ${floor.what}: ${ratio.toFixed(2)}:1 (floor ${floor.min}) [${floor.fg} on ${floor.bg}]`);
      }
    }
  }

  assert.deepEqual(missing, [], `tokens with no resolvable colour:\n  ${missing.join('\n  ')}`);
  assert.deepEqual(failures, [], `contrast floors missed:\n  ${failures.join('\n  ')}`);
});

test('the picker hides the other half of the table by CSS, in both directions', () => {
  /* The swatches and the card's palette chips are all in the DOM; which half is
     on screen is one attribute on the host. Both directions have to be written
     down, or the half that was showing first never goes away. */
  for (const row of ['.swatch-row', '.pick-row']) {
    for (const [host, hidden] of [['light', 'dark'], ['dark', 'light']]) {
      const needle = `${row}[data-mode="${host}"]`;
      const i = COMPONENTS2.indexOf(needle);
      assert.ok(i > -1, `css/components2.css has no hiding rule for ${needle}`);
      const rule = COMPONENTS2.slice(i, COMPONENTS2.indexOf('}', i));
      assert.ok(rule.includes(`[data-mode="${hidden}"]`) && rule.includes('display:none'),
        `${needle} does not hide its [data-mode="${hidden}"] children`);
    }
  }
});
