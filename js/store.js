/* ═══ Storage Layer (localStorage for now — Supabase will replace it later) ═══ */

import { STORAGE_KEYS } from './constants.js';

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};

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

export const loadTheme   = ()    => localStorage.getItem(STORAGE_KEYS.theme);
export const saveTheme   = t    => localStorage.setItem(STORAGE_KEYS.theme, t);