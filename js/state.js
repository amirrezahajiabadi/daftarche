/* ═══ وضعیت مشترک اپ (سینگلتون) ═══ */

import { loadTasks, loadName, loadHistory, loadMoods, loadPomo } from './store.js';
import { dayKey, dueKeyFromOffset } from './utils.js';

const defaultTasks = () => [
  { id: 'a1', text: 'نسخهٔ جدید دَفتَرچه را بازبینی کن', done: false, p: 'high', cat: 'project', due: dayKey(new Date()) },
  { id: 'a2', text: 'چای تازه دم کن', done: true, p: 'low', cat: 'home', doneAt: Date.now() },
  { id: 'a3', text: 'برای امتحان هفتهٔ بعد برنامه بریز', done: false, p: 'mid', cat: 'study', due: dueKeyFromOffset(1) },
];

export const state = {
  tasks: loadTasks() ?? defaultTasks(),
  filter: 'all',
  catFilter: 'all',
  query: '',
  selPri: 'mid',
  selCat: 'misc',
  selDue: 'none',
  userName: loadName(),
  history: loadHistory(),
  moods: loadMoods(),
  pomoMin: loadPomo(),
  focus: null, // {taskId,total,remain,running,done,interval,endTime}
};

export const getTask = id => state.tasks.find(t => t.id === id);