/* ═══ Focus History V1 ═══
   A light, trustworthy archive of completed focus sessions.
   Flow: append → validate → dedupe by id → newest first → trim to 100 → persist.
   Records are self-contained (taskTitle snapshot), so a deleted or renamed
   task never breaks history.

   This module is the archive, not a page. The list it holds is shown inside the
   stats page now, under the window the reader picked there, so the display
   helpers below (a rating's face and its words, a day's friendly label) are
   exported for that page rather than painted onto a page of their own. */

import { loadFocusHistory, saveFocusHistory } from './store.js';
import { startOfToday } from './utils.js';
import { formatJalaliDate } from './jalali.js';

export const HISTORY_CAP = 100;

const RATINGS = ['good', 'okay', 'hard'];
const validTs = t => Number.isFinite(t) && t > 0;

/* A record is only usable when every field required by the UI and Insights
   is present and sane. Corrupted entries are dropped, never repaired. */
export function normalizeHistoryRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const id = typeof r.id === 'string' && r.id ? r.id : null;
  if (!id) return null;
  if (!validTs(Number(r.startedAt)) || !validTs(Number(r.endedAt))) return null;
  if (Number(r.endedAt) < Number(r.startedAt)) return null;
  const actual = Number(r.actualDurationMin);
  if (!Number.isFinite(actual) || actual <= 0) return null;
  if (typeof r.taskCompleted !== 'boolean') return null;
  if (!RATINGS.includes(r.rating)) return null;
  return {
    id,
    taskId: typeof r.taskId === 'string' ? r.taskId : null,
    taskTitle: typeof r.taskTitle === 'string' && r.taskTitle.trim() ? r.taskTitle.trim() : null,
    startedAt: Number(r.startedAt),
    endedAt: Number(r.endedAt),
    plannedDurationMin: Number.isFinite(Number(r.plannedDurationMin)) && Number(r.plannedDurationMin) > 0
      ? Math.floor(Number(r.plannedDurationMin)) : null,
    actualDurationMin: Math.round(actual),
    taskCompleted: r.taskCompleted,
    rating: r.rating,
  };
}

/* Self-contained historical snapshot built from a finished session.
   taskTitle is snapshotted here — later renames/deletes cannot touch it.
   actualDurationMin falls back to the accumulated activeMs when the
   finalize step has not stamped it yet. */
export function toHistoryRecord(session) {
  if (!session || typeof session !== 'object') return null;
  const actual = Number(session.actualDurationMin);
  const activeMs = Number(session.activeMs);
  const rawMin = Number.isFinite(actual) && actual > 0 ? actual
    : (Number.isFinite(activeMs) && activeMs > 0 ? Math.round(activeMs / 60000) : 0);
  /* Sub-minute sessions still count — same 1-minute floor the summary shows */
  const actualMin = rawMin > 0 ? rawMin : 1;
  return normalizeHistoryRecord({
    id: String(session.id ?? ''),
    taskId: typeof session.taskId === 'string' ? session.taskId : null,
    taskTitle: typeof session.taskTitle === 'string' ? session.taskTitle : null,
    startedAt: Number(session.startedAt),
    endedAt: Number(session.endedAt),
    plannedDurationMin: session.plannedDurationMin,
    actualDurationMin: actualMin,
    taskCompleted: session.taskCompleted,
    rating: session.rating,
  });
}

/* Validate, dedupe by id, newest first, cap at HISTORY_CAP. */
export function mergeHistory(existing, incoming) {
  const list = (Array.isArray(existing) ? existing : [])
    .map(normalizeHistoryRecord).filter(Boolean);
  const rec = normalizeHistoryRecord(incoming);
  if (!rec) return list;
  const merged = [rec, ...list.filter(x => x.id !== rec.id)];
  merged.sort((a, b) => b.endedAt - a.endedAt);
  return merged.slice(0, HISTORY_CAP);
}

/* Full persistence path: read → merge → save → return the stored list. */
export function addSessionToHistory(session) {
  const record = toHistoryRecord(session);
  if (!record) return loadFocusHistory().map(normalizeHistoryRecord).filter(Boolean);
  const next = mergeHistory(loadFocusHistory(), record);
  saveFocusHistory(next);
  return next;
}

/* Sanitized read for UI and Insights — corrupt data never escapes this module. */
export function getHistory() {
  const raw = loadFocusHistory();
  return (Array.isArray(raw) ? raw : [])
    .map(normalizeHistoryRecord).filter(Boolean);
}

/* ═══ Display helpers (shared with the stats page) ═══ */

export const RATING_LABEL = { good: 'خوب بود', okay: 'معمولی بود', hard: 'سخت بود' };
export const RATING_FACE = { good: '😊', okay: '😐', hard: '😵' };

/* A day as the reader remembers it: امروز / دیروز, then the Jalali date. */
export function historyDayLabel(ts) {
  const d = new Date(ts);
  const today = startOfToday();
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  if (diff === 0) return 'امروز';
  if (diff === 1) return 'دیروز';
  return formatJalaliDate(d);
}
