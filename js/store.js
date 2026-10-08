/* ═══ Storage Layer (localStorage for now — Supabase will replace it later) ═══ */

import { STORAGE_KEYS } from './constants.js';

/* ── Guarded writes ──
   localStorage.setItem throws when the quota is full, when storage is disabled
   (some private modes) or when the browser is under pressure. Left unguarded,
   the throw escaped into whatever handler was saving — and the person lost the
   change without ever being told. Every write in the app now goes through
   safeSet: it never throws, it answers true/false, and on failure it announces
   the problem once on `window` (js/storagewarn.js shows it) so the loss is
   visible instead of silent. Reads are guarded separately by readJSON below. */
export const STORAGE_ERROR_EVENT = 'daftarche:storage-error';

function reportStorageError(key, error) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { key, error } })); }
  catch { /* nothing more can be done */ }
}

export function safeSet(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch (error) { reportStorageError(key, error); return false; }
}

export function safeRemove(key) {
  try { localStorage.removeItem(key); return true; }
  catch (error) { reportStorageError(key, error); return false; }
}

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
export const saveTasks   = t    => safeSet(STORAGE_KEYS.tasks, JSON.stringify(t));

export const loadName    = ()    => localStorage.getItem(STORAGE_KEYS.name) || '';
export const saveName    = v    => safeSet(STORAGE_KEYS.name, v);

export const loadHistory = ()    => read(STORAGE_KEYS.history, []);
export const saveHistory = h    => safeSet(STORAGE_KEYS.history, JSON.stringify(h));

export const loadMoods   = ()    => read(STORAGE_KEYS.moods, {});
export const saveMoods   = m    => safeSet(STORAGE_KEYS.moods, JSON.stringify(m));

export const loadPomo    = ()    => Number(localStorage.getItem(STORAGE_KEYS.pomo)) || 25;
export const savePomo    = v    => safeSet(STORAGE_KEYS.pomo, v);

/* Active/paused focus session — survives reload; source of truth for the timer */
export const loadSession = ()    => read(STORAGE_KEYS.session, null);
export const saveSession = s    => safeSet(STORAGE_KEYS.session, s ? JSON.stringify(s) : '');
export const clearSession = ()   => safeRemove(STORAGE_KEYS.session);

/* Completed focus sessions archive (newest first, capped) */
export const loadFocusHistory = ()  => read(STORAGE_KEYS.focusHistory, []);
export const saveFocusHistory = h  => safeSet(STORAGE_KEYS.focusHistory, JSON.stringify(h));

/* The stats window the reader last chose. A view preference, not data — if it
   is missing or unreadable the stats page falls back to its default range. */
export const loadStatsRange = ()    => localStorage.getItem(STORAGE_KEYS.statsRange) || '';
export const saveStatsRange = key   => safeSet(STORAGE_KEYS.statsRange, key);

/* The share card's template — a colour and a layout. A view preference like the
   stats range, not data: an unreadable value falls back to the default pair in
   js/sharecard.js, which is also where the keys are defined. */
export const loadCardStyle = ()    => read(STORAGE_KEYS.cardStyle, null);
export const saveCardStyle = style => safeSet(STORAGE_KEYS.cardStyle, JSON.stringify(style));

/* Streak freeze — «مرخصی پیوستگی». On unless it was deliberately turned off,
   so the setting only has to be written down once, when the reader changes it,
   and a missing key (a fresh install, a wiped storage) means the default. */
export const loadFreeze  = ()    => localStorage.getItem(STORAGE_KEYS.freeze) !== 'off';
export const saveFreeze  = on    => safeSet(STORAGE_KEYS.freeze, on ? 'on' : 'off');

/* Unlocked achievements, keyed by id, with the highest tier reached and the day
   it was reached. Read and sanitized by js/achievements.js, which owns the
   shape; this is only the shelf it sits on. */
export const loadAchv    = ()    => read(STORAGE_KEYS.achievements, null);
export const saveAchv    = v     => safeSet(STORAGE_KEYS.achievements, JSON.stringify(v));

export const loadTheme   = ()    => localStorage.getItem(STORAGE_KEYS.theme);
export const saveTheme   = t    => safeSet(STORAGE_KEYS.theme, t);

/* The last theme used in each half of the table — { light: 'cream', dark: 'ocean' }.
   It exists so the one-tap switch in the header can return to the dark theme the
   reader actually chose instead of falling back to a fixed one. A view
   preference, not data: unreadable means the first theme of that half. */
export const loadThemeModes = ()    => read(STORAGE_KEYS.themeModes, null);
export const saveThemeModes = m     => safeSet(STORAGE_KEYS.themeModes, JSON.stringify(m));

/* The reader's own birthday, as a Jalali MM-DD with no year — a birthday is
   the same day every year, so a year would only be one more thing to get wrong.
   js/birthday.js owns the shape and refuses anything the calendar could not
   write; this is only the shelf it sits on. Saving null takes the date away
   again, which is why the row has a «پاک کن» that means what it says. */
export const loadBirthday = ()    => read(STORAGE_KEYS.birthday, null);
export const saveBirthday = b     => b ? safeSet(STORAGE_KEYS.birthday, JSON.stringify(b)) : safeRemove(STORAGE_KEYS.birthday);

/* The last day the greeting was shown, as a bare MM-DD. It carries no year on
   purpose: nothing about it has to expire, so next year's greeting arrives by
   itself with no cleanup and no year to roll over. Device-local, so js/backup.js
   keeps it out of the file. */
export const loadBirthdaySeen = ()    => localStorage.getItem(STORAGE_KEYS.birthdaySeen) || '';
export const saveBirthdaySeen = key   => safeSet(STORAGE_KEYS.birthdaySeen, key || '');

/* The guided tour. This release owns a new marker on purpose: the old
   `daftarche-tour-done` key belongs to the previous tour and must not suppress
   this release's required first visit. «Done» means the reader either walked
   it to the end or skipped it; leaving mid-tour (Escape) writes nothing. */
export const loadTourDone = ()    => {
  try {
    return localStorage.getItem(STORAGE_KEYS.tourDone) === 'yes';
  }
  catch { return false; }
};
export const saveTourDone   = ()    => safeSet(STORAGE_KEYS.tourDone, 'yes');
/* A separate marker is essential: dismissing the automatic offer must never
   count as completing the tour or unlock an achievement reward on next boot. */
export const saveTourAwarded = () => safeSet(STORAGE_KEYS.tourAwarded, 'yes');
export const loadTourAwarded = ()    => {
  try { return localStorage.getItem(STORAGE_KEYS.tourAwarded) === 'yes'; }
  catch { return false; }
};
