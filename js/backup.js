/* ═══ Backup — export and restore everything kept in localStorage ═══
   The app is local-first: the tasks, the streak, the badges and the reading
   progress live in this one browser and nowhere else, so clearing the browser's
   data, switching phone or a full storage means starting over. This module is
   the way out: one JSON file that holds every `daftarche-*` key (and the theme),
   and the way back in.

   It is pure on purpose — it knows nothing about the DOM. It is handed a
   storage object (window.localStorage in the app, a small fake in the tests),
   which is what makes the restore, the part that overwrites a person's data,
   something that can be tested to death without a browser.

   What is NOT in the file: the PDF files themselves and uploaded music. They
   live in IndexedDB and can be hundreds of megabytes; the book list, reading
   progress, highlights and notes travel with the backup, and a book whose file
   is missing simply says so when opened, so it can be added again. */

export const BACKUP_APP = 'daftarche';
export const BACKUP_FORMAT = 1;

/* A file bigger than this is not one of ours (localStorage itself tops out at
   about 5 MB per origin) — refused before it is even parsed. */
export const BACKUP_MAX_CHARS = 5 * 1024 * 1024;

/* Device-local keys that must not travel: which release notes this device has
   already shown is a fact about this device, not about the person's data. */
const EXCLUDED = new Set(['daftarche-seen-version']);

export const isBackupKey = key =>
  typeof key === 'string' &&
  (key === 'theme' || key.startsWith('daftarche-')) &&
  !EXCLUDED.has(key);

/* The few keys whose shape the rest of the app relies on. A restore that
   brought back a string where the app expects a list would not throw at once —
   it would break the next boot — so these are checked before anything is
   written. Every other key is a plain preference and is only required to be
   text. */
const SHAPES = {
  'daftarche-v1': 'array',           // tasks
  'daftarche-history': 'array',
  'daftarche-focus-history': 'array',
  'daftarche-books-meta': 'array',
  'daftarche-moods': 'object',
  'daftarche-ledger': 'object',
  'daftarche-achievements': 'object',
};

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function backupKeysOf(storage) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (isBackupKey(k)) keys.push(k);
  }
  return keys;
}

/* Everything that belongs in a backup, as a plain object ready for
   JSON.stringify. */
export function collectBackup(storage, { now = new Date(), release = '' } = {}) {
  const data = {};
  for (const k of backupKeysOf(storage)) {
    const v = storage.getItem(k);
    if (typeof v === 'string') data[k] = v;
  }
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    release: String(release || ''),
    exportedAt: now.toISOString(),
    data,
  };
}

/* Read a backup file's text and decide whether it can be restored. Never
   throws; answers { ok: true, backup, count } or { ok: false, reason } with a
   reason in the app's own voice so the page can show it as it is. */
export function parseBackup(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'فایل خالیه.' };
  if (text.length > BACKUP_MAX_CHARS) return { ok: false, reason: 'این فایل خیلی بزرگه و پشتیبان دفترچه نیست.' };

  let obj;
  try { obj = JSON.parse(text); }
  catch { return { ok: false, reason: 'این فایل خوانده نشد؛ پشتیبان دفترچه نیست یا خراب شده.' }; }

  if (!isPlainObject(obj) || obj.app !== BACKUP_APP) {
    return { ok: false, reason: 'این فایل پشتیبان دفترچه نیست.' };
  }
  if (!Number.isInteger(obj.format) || obj.format < 1) {
    return { ok: false, reason: 'قالب این پشتیبان شناخته نشد.' };
  }
  if (obj.format > BACKUP_FORMAT) {
    return { ok: false, reason: 'این پشتیبان با نسخهٔ جدیدتری از دفترچه ساخته شده؛ اول برنامه رو به‌روز کن.' };
  }
  if (!isPlainObject(obj.data)) return { ok: false, reason: 'داده‌ای داخل این پشتیبان نیست.' };

  const keys = Object.keys(obj.data);
  if (!keys.length) return { ok: false, reason: 'داده‌ای داخل این پشتیبان نیست.' };

  for (const k of keys) {
    if (!isBackupKey(k)) return { ok: false, reason: 'این پشتیبان کلیدهای ناشناخته دارد و رد شد.' };
    const v = obj.data[k];
    if (typeof v !== 'string') return { ok: false, reason: 'ساختار این پشتیبان درست نیست.' };
    const shape = SHAPES[k];
    if (shape) {
      let parsed;
      try { parsed = JSON.parse(v); }
      catch { return { ok: false, reason: 'بخشی از این پشتیبان خراب است و رد شد.' }; }
      const good = shape === 'array' ? Array.isArray(parsed) : isPlainObject(parsed);
      if (!good) return { ok: false, reason: 'بخشی از این پشتیبان خراب است و رد شد.' };
    }
  }

  return { ok: true, backup: obj, count: keys.length };
}

/* Replace the app's stored data with a validated backup. It is all-or-nothing:
   the current values are remembered first, and if any write fails (a full
   storage, say) the old values are put back, so a failed restore leaves the
   person exactly where they were. Answers { ok: true, restored } or
   { ok: false, reason }. */
export function applyBackup(storage, backup) {
  const before = {};
  for (const k of backupKeysOf(storage)) before[k] = storage.getItem(k);

  const rollback = () => {
    try {
      for (const k of backupKeysOf(storage)) storage.removeItem(k);
      for (const [k, v] of Object.entries(before)) storage.setItem(k, v);
    } catch { /* nothing more can be done */ }
  };

  try {
    for (const k of backupKeysOf(storage)) storage.removeItem(k);
    for (const [k, v] of Object.entries(backup.data)) storage.setItem(k, v);
  } catch {
    rollback();
    return { ok: false, reason: 'جا برای بازگرداندن کافی نبود؛ چیزی عوض نشد.' };
  }
  return { ok: true, restored: Object.keys(backup.data).length };
}

export const backupFileName = (now = new Date()) => {
  const p = n => String(n).padStart(2, '0');
  return `daftarche-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
};
