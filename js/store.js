/* ═══ Storage Layer (localStorage for now — Supabase will replace it later) ═══ */

import { STORAGE_KEYS } from './constants.js';

/* Guarded read of one stored value: a corrupt entry falls back instead of
   throwing, so a malformed value can never take an import down at module
   evaluation time. Exported for the modules that own their own key and would
   otherwise parse storage themselves. */
export const readJSON = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};

const read = readJSON;

export const loadTasks   = ()    => read(STORAGE_KEYS.tasks, null);
export const saveTasks   = t    => localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(t));

export const loadName    = ()    => localStorage.getItem(STORAGE_KEYS.name) || '';
export const saveName    = v    => localStorage.setItem(STORAGE_KEYS.name, v);

export const loadHistory = ()    => read(STORAGE_KEYS.history, []);
export const saveHistory = h    => localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(h));

export const loadMoods   = ()    => read(STORAGE_KEYS.moods, {});
export const saveMoods   = m    => localStorage.setItem(STORAGE_KEYS.moods, JSON.stringify(m));

export const loadPomo    = ()    => Number(localStorage.getItem(STORAGE_KEYS.pomo)) || 25;
export const savePomo    = v    => localStorage.setItem(STORAGE_KEYS.pomo, v);

/* Active/paused focus session — survives reload; source of truth for the timer */
export const loadSession = ()    => read(STORAGE_KEYS.session, null);
export const saveSession = s    => localStorage.setItem(STORAGE_KEYS.session, s ? JSON.stringify(s) : '');
export const clearSession = ()   => localStorage.removeItem(STORAGE_KEYS.session);

/* Completed focus sessions archive (newest first, capped) */
export const loadFocusHistory = ()  => read(STORAGE_KEYS.focusHistory, []);
export const saveFocusHistory = h  => localStorage.setItem(STORAGE_KEYS.focusHistory, JSON.stringify(h));

/* The stats window the reader last chose. A view preference, not data — if it
   is missing or unreadable the stats page falls back to its default range. */
export const loadStatsRange = ()    => localStorage.getItem(STORAGE_KEYS.statsRange) || '';
export const saveStatsRange = key   => localStorage.setItem(STORAGE_KEYS.statsRange, key);

/* The share card's template — a colour and a layout. A view preference like the
   stats range, not data: an unreadable value falls back to the default pair in
   js/sharecard.js, which is also where the keys are defined. */
export const loadCardStyle = ()    => read(STORAGE_KEYS.cardStyle, null);
export const saveCardStyle = style => localStorage.setItem(STORAGE_KEYS.cardStyle, JSON.stringify(style));

/* Streak freeze — «مرخصی پیوستگی». On unless it was deliberately turned off,
   so the setting only has to be written down once, when the reader changes it,
   and a missing key (a fresh install, a wiped storage) means the default. */
export const loadFreeze  = ()    => localStorage.getItem(STORAGE_KEYS.freeze) !== 'off';
export const saveFreeze  = on    => localStorage.setItem(STORAGE_KEYS.freeze, on ? 'on' : 'off');

/* Unlocked achievements, keyed by id, with the highest tier reached and the day
   it was reached. Read and sanitized by js/achievements.js, which owns the
   shape; this is only the shelf it sits on. */
export const loadAchv    = ()    => read(STORAGE_KEYS.achievements, null);
export const saveAchv    = v     => localStorage.setItem(STORAGE_KEYS.achievements, JSON.stringify(v));

export const loadTheme   = ()    => localStorage.getItem(STORAGE_KEYS.theme);
export const saveTheme   = t    => localStorage.setItem(STORAGE_KEYS.theme, t);

/* The last theme used in each half of the table — { light: 'cream', dark: 'ocean' }.
   It exists so the one-tap switch in the header can return to the dark theme the
   reader actually chose instead of falling back to a fixed one. A view
   preference, not data: unreadable means the first theme of that half. */
export const loadThemeModes = ()    => read(STORAGE_KEYS.themeModes, null);
export const saveThemeModes = m     => localStorage.setItem(STORAGE_KEYS.themeModes, JSON.stringify(m));