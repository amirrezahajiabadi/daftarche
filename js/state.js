/* ═══ Shared App State (Singleton) ═══ */

import { loadTasks, loadName, loadHistory, loadMoods, loadPomo } from './store.js';
import { dayKey, dueKeyFromOffset, parseDurationMin } from './utils.js';

const defaultTasks = () => [
  { id: 'a1', text: 'نسخهٔ جدید دَفتَرچه را بازبینی کن', done: false, p: 'high', cat: 'project', dueDate: dayKey(new Date()), durationMin: null },
  { id: 'a2', text: 'چای تازه دم کن', done: true, p: 'low', cat: 'home', doneAt: Date.now(), durationMin: null },
  { id: 'a3', text: 'برای امتحان هفتهٔ بعد برنامه بریز', done: false, p: 'mid', cat: 'study', dueDate: dueKeyFromOffset(1), durationMin: null },
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
  if (!task.created) task.created = Date.now();
  task.doneAt = task.done ? (task.doneAt || Date.now()) : null;
  return task;
}

const normalizeTasks = list =>
  Array.isArray(list) ? list.map(normalizeTask).filter(Boolean) : defaultTasks();

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
  focus: null, // {taskId,total,remain,running,done,interval,endTime}
};

export const getTask = id => state.tasks.find(t => t.id === id);