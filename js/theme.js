/* ═══ Theme — what colour the interface is painted in ═══
   One place decides, and three things can ask for a change: the picker in
   settings, the one-tap switch in the page headers, and the last choice the
   reader made. Everything else in the app only reads the CSS, because every
   theme is a block of the same tokens in css/base.css.

   The choice is remembered as one of the keys in js/constants.js. Anything else
   — a key an older build wrote down, a hand-edited value — counts as no choice
   at all, and the system preference answers instead, which is also what the
   inline script in index.html does before the first paint (it cannot import
   this file, so it repeats the keys; see the comment there).

   It is a module of its own rather than a corner of app.js so that the picker in
   the profile can mark itself without the page and the boot code importing each
   other. */

import { $ } from './utils.js';
import { loadTheme, saveTheme } from './store.js';
import { THEMES, DEFAULT_THEME, NIGHT_THEME, normalizeTheme } from './constants.js';
import { pickerRow } from './chipgroup.js';

let row = { mark() {} };

const systemTheme = () =>
  (matchMedia('(prefers-color-scheme:dark)').matches ? NIGHT_THEME : DEFAULT_THEME);

export const currentTheme = () =>
  normalizeTheme(document.documentElement.dataset.theme) || systemTheme();

/* The browser paints its own chrome (Android status bar, Safari toolbar) from
   the theme-color meta. It has to follow the theme actually in use rather than
   the system preference alone, and it is read from the same token the CSS paints
   with, so the brand colour and the interface can never drift apart. */
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
  if (bg) meta.setAttribute('content', bg);
}

/* The switch in the header flips between dark and light; its label says what
   the tap will do, so one tap never has to be tried to be understood. */
function syncThemeButtons() {
  const night = currentTheme() === NIGHT_THEME;
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.setAttribute('aria-label', night ? 'تم روشن' : 'تم شب');
  });
}

export function markThemePicker() {
  row.mark(currentTheme());
  syncThemeButtons();
}

/* One write: the attribute is the whole state. `remember` is false only when the
   value being applied is the one already stored (or one the reader never chose),
   where re-saving it would turn a system preference into a decision. */
export function applyTheme(key, { remember = true } = {}) {
  const next = normalizeTheme(key) || DEFAULT_THEME;
  document.documentElement.dataset.theme = next;
  if (remember) saveTheme(next);
  syncThemeColor();
  markThemePicker();
}

/* Night from any light theme, and the default light back from night: the
   four-way choice lives in settings, where every option can be named. */
export const toggleTheme = () => applyTheme(currentTheme() === NIGHT_THEME ? DEFAULT_THEME : NIGHT_THEME);

export function initTheme() {
  /* The inline script has already written the attribute; this settles it for the
     case where it could not (storage blocked) and makes sure the token the
     browser chrome is told about is the theme that is really in use. */
  applyTheme(loadTheme() || currentTheme(), { remember: false });

  row = pickerRow($('#profThemeChips'), THEMES, { group: 'theme', onPick: applyTheme });
  markThemePicker();

  document.querySelectorAll('.theme-btn').forEach(btn => { btn.onclick = toggleTheme; });
}
