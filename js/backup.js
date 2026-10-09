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
   is missing simply says so when opened, so it can be added again.

   A file can come back in two ways. applyBackup replaces — the file is the
   whole truth and the device obeys it. mergeBackup combines — the file and the
   device have usually both moved on since they last met, so each key is merged
   by the meaning it has in the rest of the app rather than overwritten. */

export const BACKUP_APP = 'daftarche';
export const BACKUP_FORMAT = 1;

/* A file bigger than this is not one of ours (localStorage itself tops out at
   about 5 MB per origin) — refused before it is even parsed. */
export const BACKUP_MAX_CHARS = 5 * 1024 * 1024;

/* Device-local keys that must not travel: which release notes this device has
   already shown is a fact about this device, not about the person's data. The
   day the birthday card was last shown belongs here for the same reason — it is
   a property of this installation, and moving it to another device would only
   mean that device greets them twice or not at all. The date itself does travel,
   because that one is theirs. */
const EXCLUDED = new Set(['daftarche-seen-version', 'daftarche-birthday-seen']);

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

/* ═══ Merge — the second way back in ═══
   The rules are per key on purpose: there is no generic "combine two values"
   here because the keys do not mean the same thing. Most of them follow rules
   the app already lives by elsewhere, and where this file invents one it says
   so. Every merger below takes the two stored strings and answers the string
   to store, or null when the file has nothing to contribute to that key — in
   which case the local value is left exactly as it is.

     daftarche-v1            tasks, by id. A completion is a fact (the day book
                             floors it, js/ledger.js), so the done copy of a
                             task both sides have wins, and between two done
                             copies the later doneAt. Two open copies have no
                             edit stamp to compare, so the one already here
                             stays. Order: this device's order first (it is the
                             order the reader arranged), the file's new tasks
                             appended after, in the file's own order.
     daftarche-history       days the app was opened — the union of both
                             calendars; a day opened anywhere was opened.
     daftarche-focus-history finished sessions, by id. The copy this device
                             archived is authoritative (a finished session never
                             changes), the file's unknown ones join, newest first
                             and trimmed to the same 100 the archive itself
                             keeps (js/focushistory.js, HISTORY_CAP).
     daftarche-books-meta    books, by id. For a book both sides have: pages
                             read and per-day stats only grow (the day book's
                             own floor rule), the reading position and the page
                             count take the furthest anyone reached, the added
                             day is the earliest known, highlights and notes
                             join by their own ids (ties keep this device's
                             copy), and every choice — title, cover, goal —
                             stays as chosen here unless it was never chosen
                             here at all.
     daftarche-moods         per day: this device's mood stands (a day's mood
                             is one choice with no history to compare); the
                             file fills the days that have none.
     daftarche-ledger        per day, per number: the higher floor stands —
                             the rule bumpDay already enforces. A side that is
                             missing or not the shape readLedger reads
                             contributes nothing; if that side is this device,
                             the file's ledger is stored verbatim rather than
                             merged against nothing.
     daftarche-achievements  a tier reached is a tier kept: the higher tier
                             stands, and between equal tiers the day already
                             written here does. recSeen keeps the later day.
                             baselineAt keeps the earliest.
     everything else         one value — a setting, a name, a photo, the theme,
                             the live focus timer, keys a future release may
                             add. If this device has one it stands; if it does
                             not, the file's value arrives. Absence in the file
                             is never an instruction to remove anything.

   Records without a usable id (only a hand-edited store ever has them) cannot
   be matched, so they are kept from both sides and deduplicated by their exact
   text — nothing is dropped silently. */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const pos = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const numOr = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* JSON.parse that never throws: undefined means "not parseable", which every
   caller below treats as "that side contributes nothing". */
const readJSONSafely = s => {
  try { return JSON.parse(s); } catch { return undefined; }
};
const asArray = raw => {
  const v = readJSONSafely(raw);
  return Array.isArray(v) ? v : [];
};

/* The id a record can be matched by: a non-empty string. Tasks, focus
   sessions, books, highlights and notes all carry one (a timestamp plus noise,
   written once at creation and never changed). */
const stableId = r => (r && typeof r === 'object' && typeof r.id === 'string' && r.id ? r.id : null);

/* The earliest of two stored day keys, ignoring either that is not one. */
const minDay = (a, b) => {
  const av = typeof a === 'string' && DAY_RE.test(a) ? a : null;
  const bv = typeof b === 'string' && DAY_RE.test(b) ? b : null;
  if (av && bv) return av < bv ? av : bv;
  return av || bv;
};

/* Two copies of one task exist only because a backup traveled between devices. */
function pickTask(local, incoming) {
  const localDone = local.done === true;
  const incomingDone = incoming.done === true;
  if (localDone !== incomingDone) return incomingDone ? incoming : local;
  if (localDone) {
    const lt = Number(local.doneAt), it = Number(incoming.doneAt);
    if (Number.isFinite(it) && it > (Number.isFinite(lt) ? lt : -Infinity)) return incoming;
  }
  return local;
}

function mergeTaskList(localRaw, incomingRaw) {
  const out = [];
  const byId = new Map();   // id → position of its first occurrence in out
  const texts = new Set();  // exact text of every id-less record kept so far
  const keepText = t => {
    const s = JSON.stringify(t);
    if (texts.has(s)) return false;
    texts.add(s);
    return true;
  };

  for (const t of asArray(localRaw)) {
    out.push(t);
    const id = stableId(t);
    if (id) { if (!byId.has(id)) byId.set(id, out.length - 1); }
    else keepText(t);
  }
  for (const t of asArray(incomingRaw)) {
    const id = stableId(t);
    if (id) {
      const at = byId.get(id);
      if (at === undefined) { byId.set(id, out.length); out.push(t); }
      else out[at] = pickTask(out[at], t);
    } else if (keepText(t)) out.push(t);
  }
  return JSON.stringify(out);
}

function mergeDayList(localRaw, incomingRaw) {
  const days = new Set();
  for (const raw of [localRaw, incomingRaw]) {
    for (const k of asArray(raw)) if (typeof k === 'string' && DAY_RE.test(k)) days.add(k);
  }
  return JSON.stringify([...days].sort());
}

/* Mirrors HISTORY_CAP in js/focushistory.js: the archive keeps the newest
   hundred, so a merge of two archives must not leave more behind than the app
   itself would have kept. */
const FOCUS_HISTORY_CAP = 100;

function mergeFocusHistory(localRaw, incomingRaw) {
  const out = [];
  const byId = new Set();
  const texts = new Set();
  for (const r of asArray(localRaw)) {
    out.push(r);
    const id = stableId(r);
    if (id) byId.add(id);
    else texts.add(JSON.stringify(r));
  }
  for (const r of asArray(incomingRaw)) {
    const id = stableId(r);
    if (id) { if (!byId.has(id)) { byId.add(id); out.push(r); } }
    else { const s = JSON.stringify(r); if (!texts.has(s)) { texts.add(s); out.push(r); } }
  }
  const endedAt = r => (r && typeof r === 'object' && Number.isFinite(Number(r.endedAt)) ? Number(r.endedAt) : 0);
  out.sort((a, b) => endedAt(b) - endedAt(a));
  return JSON.stringify(out.slice(0, FOCUS_HISTORY_CAP));
}

/* Highlights and notes carry their own ids; the copy already here wins a tie —
   the only field that can really differ is a note someone typed, and no stamp
   says which typing is newer. */
function unionById(localList, incomingList) {
  if (!Array.isArray(localList)) return Array.isArray(incomingList) ? incomingList : localList;
  if (!Array.isArray(incomingList)) return localList;
  const out = [...localList];
  const ids = new Set(), texts = new Set();
  for (const r of out) {
    const id = stableId(r);
    if (id) ids.add(id);
    else texts.add(JSON.stringify(r));
  }
  for (const r of incomingList) {
    const id = stableId(r);
    if (id) { if (!ids.has(id)) { ids.add(id); out.push(r); } }
    else { const s = JSON.stringify(r); if (!texts.has(s)) { texts.add(s); out.push(r); } }
  }
  return out;
}

/* A page read is a fact; order never mattered to the reader (it is a Set the
   moment the app reads it, js/library.js). */
function unionPages(localPages, incomingPages) {
  if (!Array.isArray(localPages)) return Array.isArray(incomingPages) ? incomingPages : localPages;
  if (!Array.isArray(incomingPages)) return localPages;
  return [...new Set([...localPages, ...incomingPages])];
}

/* Per day, per counter: the higher stands — the same floor the day book keeps. */
function mergeBookStats(localStats, incomingStats) {
  if (!isPlainObject(localStats)) return isPlainObject(incomingStats) ? incomingStats : localStats;
  if (!isPlainObject(incomingStats)) return localStats;
  const out = { ...localStats };
  for (const [k, v] of Object.entries(incomingStats)) {
    if (!DAY_RE.test(k) || !isPlainObject(v)) continue;
    const cur = isPlainObject(out[k]) ? out[k] : {};
    const day = { ...cur };
    for (const f of ['minutes', 'pages']) {
      const best = Math.max(pos(cur[f]), pos(v[f]));
      if (best > 0) day[f] = best;
      else if (cur[f] !== undefined) day[f] = cur[f];
    }
    if (Object.keys(day).length || out[k] !== undefined) out[k] = day;
  }
  return out;
}

function mergeBook(local, incoming) {
  const m = { ...local };
  m.completedPages = unionPages(local.completedPages, incoming.completedPages);
  m.stats = mergeBookStats(local.stats, incoming.stats);
  const wider = Math.max(numOr(local.numPages), numOr(incoming.numPages));
  if (wider > 0 || local.numPages !== undefined) m.numPages = wider;
  const further = Math.max(numOr(local.lastPage), numOr(incoming.lastPage));
  if (further > 0 || local.lastPage !== undefined) m.lastPage = further;
  const firstAdded = minPositive(local.addedAt, incoming.addedAt);
  if (firstAdded !== null) m.addedAt = firstAdded;
  m.highlights = unionById(local.highlights, incoming.highlights);
  m.notes = unionById(local.notes, incoming.notes);
  /* What is a choice rather than a fact stays as chosen here — unless this
     device never chose, in which case the file's choice arrives. */
  for (const k of ['title', 'cover', 'goal']) {
    if ((m[k] === undefined || m[k] === null || m[k] === '') && incoming[k] !== undefined) m[k] = incoming[k];
  }
  return m;
}

/* addedAt/createdAt are timestamps, not day keys; the earliest one known is
   the truth about when the thing happened. */
function minPositive(a, b) {
  const av = pos(a), bv = pos(b);
  if (av && bv) return Math.min(av, bv);
  return av || bv || null;
}

function mergeBooks(localRaw, incomingRaw) {
  const out = [];
  const byId = new Map();
  const texts = new Set();
  for (const b of asArray(localRaw)) {
    out.push(b);
    const id = stableId(b);
    if (id) { if (!byId.has(id)) byId.set(id, out.length - 1); }
    else texts.add(JSON.stringify(b));
  }
  for (const b of asArray(incomingRaw)) {
    const id = stableId(b);
    if (id) {
      const at = byId.get(id);
      if (at === undefined) { byId.set(id, out.length); out.push(b); }
      else if (out[at] && typeof out[at] === 'object') out[at] = mergeBook(out[at], b);
    } else {
      const s = JSON.stringify(b);
      if (!texts.has(s)) { texts.add(s); out.push(b); }
    }
  }
  return JSON.stringify(out);
}

function mergeMoods(localRaw, incomingRaw) {
  const local = readJSONSafely(localRaw);
  const incoming = readJSONSafely(incomingRaw);
  if (!isPlainObject(incoming)) return null;
  if (!isPlainObject(local)) return JSON.stringify(incoming);
  const out = { ...local };
  for (const [k, v] of Object.entries(incoming)) if (!(k in out)) out[k] = v;
  return JSON.stringify(out);
}

/* The shape readLedger reads (js/ledger.js): anything else is not a ledger,
   and a merge never writes a shape the app would not recognize. */
const ledgerShaped = raw => isPlainObject(raw) && raw.v === 1 && isPlainObject(raw.days);

function mergeLedger(localRaw, incomingRaw) {
  const local = readJSONSafely(localRaw);
  const incoming = readJSONSafely(incomingRaw);
  if (!ledgerShaped(incoming)) return null;
  if (!ledgerShaped(local)) return JSON.stringify(incoming);
  const days = {};
  for (const [k, v] of Object.entries(local.days)) {
    if (DAY_RE.test(k) && isPlainObject(v)) days[k] = { ...v };
  }
  for (const [k, v] of Object.entries(incoming.days)) {
    if (!DAY_RE.test(k) || !isPlainObject(v)) continue;
    const cur = isPlainObject(days[k]) ? days[k] : {};
    days[k] = {
      done: Math.max(pos(cur.done), pos(v.done)),
      focusMin: Math.max(pos(cur.focusMin), pos(v.focusMin)),
      sessions: Math.max(pos(cur.sessions), pos(v.sessions)),
    };
  }
  return JSON.stringify({ v: 1, seededAt: minDay(local.seededAt, incoming.seededAt), days });
}

/* The shape the shelf writes (js/achievementsview.js writes v:1 always). */
const achvShaped = raw => isPlainObject(raw) && raw.v === 1;

function mergeAchv(localRaw, incomingRaw) {
  const local = readJSONSafely(localRaw);
  const incoming = readJSONSafely(incomingRaw);
  if (!achvShaped(incoming)) return null;
  if (!achvShaped(local)) return JSON.stringify(incoming);
  const unlocked = { ...(isPlainObject(local.unlocked) ? local.unlocked : {}) };
  const incomingUnlocked = isPlainObject(incoming.unlocked) ? incoming.unlocked : {};
  for (const [id, rec] of Object.entries(incomingUnlocked)) {
    const cur = unlocked[id];
    if (!cur) { unlocked[id] = rec; continue; }
    if (pos(rec.tier) > pos(cur.tier)) unlocked[id] = rec;
    /* Equal tiers keep the day already written here — unless it is blank and
       the file's copy knows the day, which is more truth, not less. */
    else if (pos(rec.tier) === pos(cur.tier) && cur.at == null && rec && rec.at != null) unlocked[id] = rec;
  }
  /* recSeen is a "already celebrated this day" mark; the later day suppresses
     more, which is the safe direction for a mark whose whole job is dedupe. */
  const recSeen = { ...(isPlainObject(local.recSeen) ? local.recSeen : {}) };
  const incomingSeen = isPlainObject(incoming.recSeen) ? incoming.recSeen : {};
  for (const [k, v] of Object.entries(incomingSeen)) {
    if (typeof v !== 'string') continue;
    const cur = recSeen[k];
    if (typeof cur !== 'string' || v > cur) recSeen[k] = v;
  }
  return JSON.stringify({ v: 1, baselineAt: minDay(local.baselineAt, incoming.baselineAt), unlocked, recSeen });
}

const MERGERS = {
  'daftarche-v1': mergeTaskList,
  'daftarche-history': mergeDayList,
  'daftarche-focus-history': mergeFocusHistory,
  'daftarche-books-meta': mergeBooks,
  'daftarche-moods': mergeMoods,
  'daftarche-ledger': mergeLedger,
  'daftarche-achievements': mergeAchv,
};

/* Combine a validated backup with what is already on the device, one key at a
   time, and write only the keys the file actually changed — keys the file does
   not mention are not touched at all, unlike applyBackup, which removes them.
   The whole merged result is built in memory and re-checked against SHAPES
   before the first write, and a write that fails puts every key back, so a
   failed merge leaves the person exactly where they were. Answers
   { ok: true, written } or { ok: false, reason }. */
export function mergeBackup(storage, backup) {
  if (!backup || !isPlainObject(backup.data)) {
    return { ok: false, reason: 'ساختار این پشتیبان درست نیست.' };
  }

  const writes = {};
  for (const [k, v] of Object.entries(backup.data)) {
    if (!isBackupKey(k)) return { ok: false, reason: 'این پشتیبان کلیدهای ناشناخته دارد و رد شد.' };
    if (typeof v !== 'string') return { ok: false, reason: 'ساختار این پشتیبان درست نیست.' };
    const local = storage.getItem(k);
    const merged = MERGERS[k] ? MERGERS[k](local, v) : (local ?? v);
    if (merged === null || merged === undefined) continue;   // the file adds nothing here
    if (merged !== storage.getItem(k)) writes[k] = merged;
  }

  /* A merge must never leave a key in a shape the next boot would reject. */
  for (const [k, v] of Object.entries(writes)) {
    const shape = SHAPES[k];
    if (!shape) continue;
    const parsed = readJSONSafely(v);
    const good = shape === 'array' ? Array.isArray(parsed) : isPlainObject(parsed);
    if (!good) return { ok: false, reason: 'بخشی از این پشتیبان خراب است و رد شد.' };
  }

  if (!Object.keys(writes).length) return { ok: true, written: 0 };

  const before = {};
  for (const k of Object.keys(writes)) before[k] = storage.getItem(k);
  const rollback = () => {
    try {
      for (const [k, v] of Object.entries(before)) {
        if (v === null) storage.removeItem(k);
        else storage.setItem(k, v);
      }
    } catch { /* nothing more can be done */ }
  };

  try {
    for (const [k, v] of Object.entries(writes)) storage.setItem(k, v);
  } catch {
    rollback();
    return { ok: false, reason: 'جا برای ادغام کافی نبود؛ چیزی عوض نشد.' };
  }
  return { ok: true, written: Object.keys(writes).length };
}
