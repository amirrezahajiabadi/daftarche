/* ═══ Shared App State (Singleton) ═══ */

import { loadTasks, loadName, loadHistory, loadMoods, loadPomo, loadSession } from './store.js';
import { dayKey, dueKeyFromOffset, parseDurationMin, parseTimeRange } from './utils.js';

const defaultTasks = () => [
  { id: 'a1', text: 'نسخهٔ جدید دَفتَرچه را بازبینی کن', done: false, p: 'high', cat: 'project', dueDate: dayKey(new Date()), durationMin: null },
  { id: 'a2', text: 'چای تازه دم کن', done: true, p: 'low', cat: 'home', doneAt: Date.now(), durationMin: null },
  { id: 'a3', text: 'برای امتحان هفتهٔ بعد برنامه بریز', done: false, p: 'mid', cat: 'study', dueDate: dueKeyFromOffset(1), durationMin: null, timeFrom: 16 * 60, timeTo: 18 * 60 },
];

/* ═══ Migration: make every task safe with the extended model ═══
   Old tasks (without durationMin / completedAt) keep all of their data;
   only missing optional fields get safe defaults. Nothing is deleted. */
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeTask(t) {
  if (!t || typeof t !== 'object') return null;
  const task = { ...t };
  if (!task.id) task.id = Date.now() + '' + Math.random().toString(16).slice(2);
  task.durationMin = parseDurationMin(task.durationMin);
  // Migrate the old deadline field (due) to dueDate without losing data
  if (!task.dueDate && task.due) task.dueDate = task.due;
  delete task.due;
  task.dueDate = task.dueDate && DAY_KEY_RE.test(task.dueDate) ? task.dueDate : null;
  /* The optional span of the day this task is planned for («۱۴:۰۰ تا ۱۶:۰۰»).
     It is a plan, not an alarm: nothing schedules itself from it. Kept as two
     minutes-past-midnight numbers, validated as a pair — an old task, or a
     half-written one, comes back with no span rather than with half of one. */
  const span = parseTimeRange(task.timeFrom, task.timeTo);
  task.timeFrom = span ? span.from : null;
  task.timeTo = span ? span.to : null;
  if (!task.created) task.created = Date.now();
  task.doneAt = task.done ? (task.doneAt || Date.now()) : null;
  /* Notification fields (optional, safe defaults for old data):
     notify         — per-task switch, user controlled
     notifiedStatus — dedupe marker so a task is never nagged repeatedly:
                      'none' | 'soon' (due today) | 'overdue' (past due) */
  task.notify = typeof task.notify === 'boolean' ? task.notify : false;
  if (!['none', 'soon', 'overdue'].includes(task.notifiedStatus)) task.notifiedStatus = 'none';
  return task;
}

/* The first-run seed goes through the same normalizer as stored tasks: it used
   to be handed over as written, which made the three starter tasks the only
   tasks in the app without a `created` stamp — invisible until the stats page
   asked when they were written down, and then it read as a list where nothing
   had ever been added. */
const normalizeTasks = list =>
  Array.isArray(list) ? list.map(normalizeTask).filter(Boolean) : defaultTasks().map(normalizeTask).filter(Boolean);

export const state = {
  tasks: normalizeTasks(loadTasks()),
  filter: 'all',
  catFilter: 'all',
  query: '',
  selPri: 'mid',
  selCat: 'misc',
  selDue: 'none',
  selDur: null, // estimated duration (minutes) for the next task
  userName: loadName(),
  history: loadHistory(),
  moods: loadMoods(),
  pomoMin: loadPomo(),
  session: null, // active focus session (restored in initFocusPage from storage)
};

export const getTask = id => state.tasks.find(t => t && t.id === id);