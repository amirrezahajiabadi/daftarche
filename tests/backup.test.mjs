/* Backup + guarded storage — the two things that decide whether a person's data
   survives a bad day. Pure Node, no browser: js/backup.js takes a storage
   object, and js/store.js only touches localStorage/window at call time. */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectBackup, parseBackup, applyBackup, mergeBackup, isBackupKey,
  backupFileName, BACKUP_FORMAT, BACKUP_APP,
} from '../js/backup.js';

class FakeStorage {
  constructor(init = {}, { failSetAfter = Infinity } = {}) {
    this.map = new Map(Object.entries(init));
    this.sets = 0;
    this.failSetAfter = failSetAfter;
  }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) {
    if (this.sets++ >= this.failSetAfter) throw new Error('QuotaExceededError');
    this.map.set(k, String(v));
  }
  removeItem(k) { this.map.delete(k); }
  snapshot() { return Object.fromEntries(this.map); }
}

const sample = () => ({
  'daftarche-v1': JSON.stringify([{ id: 'a1', text: 'x', done: false }]),
  'daftarche-ledger': JSON.stringify({ '2026-09-01': { done: 2, focusMin: 25, sessions: 1 } }),
  'daftarche-name': 'امیر',
  'daftarche-photo': 'data:image/png;base64,AAAA',
  'theme': 'night',
  'daftarche-seen-version': '2.6.0',   // device-local: must not travel
  'somebody-elses-key': 'nope',         // not ours: must not travel
});

test('isBackupKey: only our keys, never the device-local one', () => {
  assert.equal(isBackupKey('daftarche-v1'), true);
  assert.equal(isBackupKey('theme'), true);
  assert.equal(isBackupKey('daftarche-seen-version'), false);
  assert.equal(isBackupKey('other'), false);
  assert.equal(isBackupKey(null), false);
});

test('collectBackup: takes our keys only, stamps app/format/date', () => {
  const b = collectBackup(new FakeStorage(sample()), { now: new Date('2026-09-30T10:00:00Z'), release: '2.6.0' });
  assert.equal(b.app, BACKUP_APP);
  assert.equal(b.format, BACKUP_FORMAT);
  assert.equal(b.exportedAt, '2026-09-30T10:00:00.000Z');
  assert.deepEqual(Object.keys(b.data).sort(),
    ['daftarche-ledger', 'daftarche-name', 'daftarche-photo', 'daftarche-v1', 'theme']);
});

test('round trip: export → parse → apply reproduces the data on a fresh device', () => {
  const src = new FakeStorage(sample());
  const text = JSON.stringify(collectBackup(src));
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.count, 5);

  const dst = new FakeStorage({ 'daftarche-seen-version': '2.5.0' });
  const res = applyBackup(dst, parsed.backup);
  assert.equal(res.ok, true);
  assert.equal(dst.getItem('daftarche-v1'), src.getItem('daftarche-v1'));
  assert.equal(dst.getItem('daftarche-name'), 'امیر');
  assert.equal(dst.getItem('daftarche-seen-version'), '2.5.0');   // untouched
});

test('apply replaces: keys that are not in the backup are removed', () => {
  const dst = new FakeStorage({ 'daftarche-name': 'old', 'daftarche-pomo': '50', 'unrelated': 'keep' });
  const backup = { app: BACKUP_APP, format: 1, data: { 'daftarche-name': 'new' } };
  assert.equal(applyBackup(dst, backup).ok, true);
  assert.equal(dst.getItem('daftarche-name'), 'new');
  assert.equal(dst.getItem('daftarche-pomo'), null);
  assert.equal(dst.getItem('unrelated'), 'keep');
});

test('apply is all-or-nothing: a failed write puts the old data back', () => {
  const original = {
    'daftarche-v1': JSON.stringify([{ id: 'keep-me' }]),
    'daftarche-name': 'قبلی',
    'theme': 'paper',
  };
  // Fails on the 2nd write of the restore; rollback's own writes happen after
  // the counter has passed the limit, so lift the limit for them.
  const dst = new FakeStorage(original, { failSetAfter: 1 });
  const realSet = dst.setItem.bind(dst);
  dst.setItem = (k, v) => {
    try { return realSet(k, v); }
    catch (e) { if (dst.sets > 2) { dst.failSetAfter = Infinity; return realSet(k, v); } throw e; }
  };
  const backup = { app: BACKUP_APP, format: 1, data: {
    'daftarche-v1': '[]', 'daftarche-name': 'جدید', 'theme': 'night',
  } };
  const res = applyBackup(dst, backup);
  assert.equal(res.ok, false);
  assert.deepEqual(dst.snapshot(), original);
});

test('parseBackup rejects everything that is not a whole, safe backup', () => {
  const good = { app: BACKUP_APP, format: 1, data: { 'daftarche-name': 'x' } };
  const cases = [
    ['', 'empty'],
    ['not json', 'not json'],
    [JSON.stringify([]), 'array root'],
    [JSON.stringify({ ...good, app: 'other' }), 'wrong app'],
    [JSON.stringify({ ...good, format: 0 }), 'format 0'],
    [JSON.stringify({ ...good, format: BACKUP_FORMAT + 1 }), 'future format'],
    [JSON.stringify({ ...good, data: {} }), 'no data'],
    [JSON.stringify({ ...good, data: null }), 'null data'],
    [JSON.stringify({ ...good, data: { 'evil-key': 'x' } }), 'foreign key'],
    [JSON.stringify({ ...good, data: { 'daftarche-name': 5 } }), 'non-string value'],
    [JSON.stringify({ ...good, data: { 'daftarche-v1': '{"a":1}' } }), 'tasks not an array'],
    [JSON.stringify({ ...good, data: { 'daftarche-v1': 'not json' } }), 'tasks unparsable'],
    [JSON.stringify({ ...good, data: { 'daftarche-ledger': '[]' } }), 'ledger not an object'],
  ];
  for (const [text, label] of cases) {
    const r = parseBackup(text);
    assert.equal(r.ok, false, label);
    assert.equal(typeof r.reason, 'string', label);
  }
  assert.equal(parseBackup(JSON.stringify(good)).ok, true);
});

test('parseBackup: an empty session value is legal (saveSession writes "" when idle)', () => {
  const r = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 1, data: { 'daftarche-focus-session': '' } }));
  assert.equal(r.ok, true);
});

test('backupFileName: dated, zero-padded', () => {
  assert.equal(backupFileName(new Date(2026, 0, 5)), 'daftarche-backup-2026-01-05.json');
});

/* ── mergeBackup: the second way back in ──
   Every rule exercised here is written down in js/backup.js's merge table;
   these tests are that table's proof. */
const J = JSON.stringify;

test('merge keeps what is here, adds what the file brought, never removes', () => {
  const dst = new FakeStorage({
    'daftarche-v1': J([{ id: 't1', text: 'محلی', done: false }]),
    'daftarche-name': 'امیر',
    'theme': 'night',
    'daftarche-pomo': '50',
    'daftarche-seen-version': '2.6.0',
  });
  const backup = { app: BACKUP_APP, format: 1, data: {
    'daftarche-v1': J([{ id: 't9', text: 'از فایل', done: false }]),
    'daftarche-name': 'شیری',
    'daftarche-moods': J({ '2026-09-01': 3 }),
  } };
  const res = mergeBackup(dst, backup);
  assert.equal(res.ok, true);
  assert.deepEqual(JSON.parse(dst.getItem('daftarche-v1')).map(t => t.id), ['t1', 't9']);
  assert.equal(dst.getItem('daftarche-name'), 'امیر');       // a choice made here stands
  assert.equal(dst.getItem('theme'), 'night');               // a key the file never mentions is untouched
  assert.equal(dst.getItem('daftarche-pomo'), '50');
  assert.deepEqual(JSON.parse(dst.getItem('daftarche-moods')), { '2026-09-01': 3 }); // absence filled
  assert.equal(dst.getItem('daftarche-seen-version'), '2.6.0'); // device-local, outside all of this
});

test('merge tasks: a completion is a fact; two open copies keep this device\'s', () => {
  const dst = new FakeStorage({ 'daftarche-v1': J([
    { id: 'a', text: 'اینجا باز مونده', done: false },
    { id: 'b', text: 'اینجا زودتر', done: true, doneAt: 100 },
    { id: 'c', text: 'اینجا دوتایی', done: false },
  ]) });
  const backup = { app: BACKUP_APP, format: 1, data: { 'daftarche-v1': J([
    { id: 'a', text: 'اینجا باز مونده', done: true, doneAt: 500 },   // done beats open
    { id: 'b', text: 'اینجا زودتر', done: true, doneAt: 900 },       // later doneAt wins
    { id: 'c', text: 'اون‌جا دوتایی', done: false },                   // no stamp → local copy stands
  ]) } };
  assert.equal(mergeBackup(dst, backup).ok, true);
  const tasks = JSON.parse(dst.getItem('daftarche-v1'));
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks[0], { id: 'a', text: 'اینجا باز مونده', done: true, doneAt: 500 });
  assert.deepEqual(tasks[1], { id: 'b', text: 'اینجا زودتر', done: true, doneAt: 900 });
  assert.equal(tasks[2].text, 'اینجا دوتایی');
});

test('merge tasks: id-less records are kept, but an identical one is not doubled', () => {
  const dst = new FakeStorage({ 'daftarche-v1': J([{ text: 'بدون شناسه', done: false }]) });
  const backup = { app: BACKUP_APP, format: 1, data: { 'daftarche-v1': J([
    { text: 'بدون شناسه', done: false },     // exact twin → not appended
    { text: 'یکی دیگه', done: false },       // different → arrives
  ]) } };
  mergeBackup(dst, backup);
  const tasks = JSON.parse(dst.getItem('daftarche-v1'));
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.map(t => t.text), ['بدون شناسه', 'یکی دیگه']);
});

test('merge focus history: union by id, newest first, trimmed to the archive\'s own cap', () => {
  const rec = (id, at) => ({ id, startedAt: at, endedAt: at + 1000, actualDurationMin: 10, rating: 'good', taskCompleted: false });
  const local = Array.from({ length: 60 }, (_, i) => rec('l' + i, 1000 + i));          // ended 2000..2059
  const incoming = Array.from({ length: 60 }, (_, i) => rec('f' + i, 1500 + i));        // ended 2500..2559, all newer
  const dst = new FakeStorage({ 'daftarche-focus-history': J(local) });
  mergeBackup(dst, { app: BACKUP_APP, format: 1, data: { 'daftarche-focus-history': J(incoming) } });
  const merged = JSON.parse(dst.getItem('daftarche-focus-history'));
  assert.equal(merged.length, 100);                       // the cap, not 120
  assert.equal(merged[0].id, 'f59');                      // newest first
  assert.equal(merged[99].id, 'l20');                     // the oldest twenty locals are trimmed
  assert.equal(merged.filter(r => r.id.startsWith('f')).length, 60);  // every session from the file survives
  assert.equal(new Set(merged.map(r => r.id)).size, 100); // every survivor is there once
});

test('merge books: facts grow, choices stay local, absence is filled', () => {
  const dst = new FakeStorage({ 'daftarche-books-meta': J([{
    id: 'b1', title: 'قلمری', addedAt: 200, numPages: 200, lastPage: 50, goal: null,
    completedPages: [1, 2], stats: { '2026-09-01': { minutes: 10, pages: 3 } },
    highlights: [{ id: 'h1', page: 3, text: 'نکته', color: '#eab13c' }],
  }]) });
  const backup = { app: BACKUP_APP, format: 1, data: { 'daftarche-books-meta': J([
    { id: 'b1', title: 'قلمری نو', addedAt: 100, numPages: 180, lastPage: 80,
      goal: { type: 'days', n: 30 }, completedPages: [2, 3],
      stats: { '2026-09-01': { minutes: 7, pages: 5 }, '2026-09-02': { minutes: 2, pages: 1 } },
      notes: [{ id: 'n1', page: 4, text: 'یادداشت', createdAt: 300 }] },
    { id: 'b2', title: 'کتاب تازه', addedAt: 400, numPages: 90, lastPage: 1, stats: {}, highlights: [], notes: [] },
  ]) } };
  mergeBackup(dst, backup);
  const books = JSON.parse(dst.getItem('daftarche-books-meta'));
  assert.deepEqual(books.map(b => b.id), ['b1', 'b2']);
  const b1 = books[0];
  assert.equal(b1.title, 'قلمری');                          // a choice made here
  assert.equal(b1.addedAt, 100);                            // the earliest known day
  assert.equal(b1.numPages, 200);                           // the wider page count
  assert.equal(b1.lastPage, 80);                            // the furthest anyone reached
  assert.deepEqual(b1.completedPages, [1, 2, 3]);           // pages read only grow
  assert.deepEqual(b1.stats['2026-09-01'], { minutes: 10, pages: 5 }); // per field, the higher floor
  assert.deepEqual(b1.stats['2026-09-02'], { minutes: 2, pages: 1 });
  assert.deepEqual(b1.goal, { type: 'days', n: 30 });       // this device never chose one
  assert.deepEqual(b1.highlights.map(h => h.id), ['h1']);
  assert.deepEqual(b1.notes.map(n => n.id), ['n1']);
});

test('merge moods: this device\'s day stands, the file fills the empty days', () => {
  const dst = new FakeStorage({ 'daftarche-moods': J({ '2026-09-01': 4 }) });
  const backup = { app: BACKUP_APP, format: 1, data: { 'daftarche-moods': J({ '2026-09-01': 2, '2026-09-02': 5 }) } };
  mergeBackup(dst, backup);
  assert.deepEqual(JSON.parse(dst.getItem('daftarche-moods')), { '2026-09-01': 4, '2026-09-02': 5 });
});

test('merge ledger: every day keeps the highest it ever showed', () => {
  const dst = new FakeStorage({ 'daftarche-ledger': J({
    v: 1, seededAt: '2026-08-10',
    days: { '2026-09-01': { done: 5, focusMin: 40, sessions: 2 }, '2026-09-02': { done: 1, focusMin: 0, sessions: 0 } },
  }) });
  const backup = { app: BACKUP_APP, format: 1, data: { 'daftarche-ledger': J({
    v: 1, seededAt: '2026-08-20',
    days: { '2026-09-01': { done: 3, focusMin: 60, sessions: 1 }, '2026-09-03': { done: 2, focusMin: 10, sessions: 1 } },
  }) } };
  mergeBackup(dst, backup);
  const led = JSON.parse(dst.getItem('daftarche-ledger'));
  assert.equal(led.v, 1);
  assert.equal(led.seededAt, '2026-08-10');
  assert.deepEqual(led.days['2026-09-01'], { done: 5, focusMin: 60, sessions: 2 });
  assert.deepEqual(led.days['2026-09-02'], { done: 1, focusMin: 0, sessions: 0 });
  assert.deepEqual(led.days['2026-09-03'], { done: 2, focusMin: 10, sessions: 1 });
});

test('merge ledger: a side that is not a ledger contributes nothing', () => {
  // the file's copy is an older, unrecognized shape → this device's ledger is left byte-for-byte alone
  const localLedger = J({ v: 1, seededAt: null, days: { '2026-09-01': { done: 1, focusMin: 0, sessions: 0 } } });
  const dst = new FakeStorage({ 'daftarche-ledger': localLedger });
  mergeBackup(dst, { app: BACKUP_APP, format: 1, data: { 'daftarche-ledger': J({ '2026-09-01': { done: 9 } }) } });
  assert.equal(dst.getItem('daftarche-ledger'), localLedger);

  // and the other way round: nothing readable here → the file's ledger arrives verbatim
  const dst2 = new FakeStorage({ 'daftarche-ledger': 'not json' });
  const fileLedger = J({ v: 1, seededAt: null, days: {} });
  mergeBackup(dst2, { app: BACKUP_APP, format: 1, data: { 'daftarche-ledger': fileLedger } });
  assert.equal(dst2.getItem('daftarche-ledger'), fileLedger);
});

test('merge achievements: a tier reached is a tier kept; recSeen keeps the later day', () => {
  const dst = new FakeStorage({ 'daftarche-achievements': J({
    v: 1, baselineAt: '2026-08-01',
    unlocked: { firstTask: { tier: 1, at: '2026-08-02' }, tenTasks: { tier: 2, at: '2026-08-05' }, blank: { tier: 1, at: null } },
    recSeen: { streak: '2026-09-01' },
  }) });
  const backup = { app: BACKUP_APP, format: 1, data: { 'daftarche-achievements': J({
    v: 1, baselineAt: '2026-08-15',
    unlocked: { firstTask: { tier: 2, at: '2026-08-20' }, tenTasks: { tier: 1, at: '2026-08-03' }, blank: { tier: 1, at: '2026-08-04' }, reader: { tier: 1, at: '2026-08-09' } },
    recSeen: { streak: '2026-09-03', pages: '2026-09-01' },
  }) } };
  mergeBackup(dst, backup);
  const a = JSON.parse(dst.getItem('daftarche-achievements'));
  assert.equal(a.v, 1);
  assert.equal(a.baselineAt, '2026-08-01');
  assert.deepEqual(a.unlocked.firstTask, { tier: 2, at: '2026-08-20' });  // higher tier arrives
  assert.deepEqual(a.unlocked.tenTasks, { tier: 2, at: '2026-08-05' });   // equal tier → this device's day
  assert.deepEqual(a.unlocked.blank, { tier: 1, at: '2026-08-04' });      // a real day beats a blank one
  assert.deepEqual(a.unlocked.reader, { tier: 1, at: '2026-08-09' });     // new badge arrives
  assert.deepEqual(a.recSeen, { streak: '2026-09-03', pages: '2026-09-01' });
});

test('merge history: the union of both calendars, sorted', () => {
  const dst = new FakeStorage({ 'daftarche-history': J(['2026-09-02', '2026-09-01']) });
  const backup = { app: BACKUP_APP, format: 1, data: { 'daftarche-history': J(['2026-09-01', '2026-08-31']) } };
  mergeBackup(dst, backup);
  assert.deepEqual(JSON.parse(dst.getItem('daftarche-history')), ['2026-08-31', '2026-09-01', '2026-09-02']);
});

test('merge single values: an idle focus session on this device is a value, not an absence', () => {
  const dst = new FakeStorage({ 'daftarche-focus-session': '', 'daftarche-birthday': null });
  const backup = { app: BACKUP_APP, format: 1, data: {
    'daftarche-focus-session': J({ id: 's1', startedAt: 1, endedAt: 2 }),
    'daftarche-birthday': J({ m: 7, d: 12 }),
  } };
  mergeBackup(dst, backup);
  assert.equal(dst.getItem('daftarche-focus-session'), '');          // this device's timer state stands
  assert.equal(dst.getItem('daftarche-birthday'), J({ m: 7, d: 12 })); // only true absence is filled
});

test('merge that changes nothing writes nothing at all', () => {
  const dst = new FakeStorage({ 'daftarche-name': 'امیر', 'daftarche-v1': J([{ id: 'a', text: 'x', done: true, doneAt: 5 }]) });
  const backup = { app: BACKUP_APP, format: 1, data: {
    'daftarche-name': 'امیر',
    'daftarche-v1': J([{ id: 'a', text: 'x', done: true, doneAt: 5 }]),
  } };
  const res = mergeBackup(dst, backup);
  assert.equal(res.ok, true);
  assert.equal(res.written, 0);
  assert.equal(dst.sets, 0);
});

test('merge is all-or-nothing: a failed write puts every key back', () => {
  const original = { 'daftarche-moods': J({ '2026-09-01': 4 }), 'unrelated': 'keep' };
  // A storage that fails exactly once — on the second key the merge writes (the
  // moods merge) — and lets the rollback's own writes through, unlike
  // FakeStorage's persistent quota, so the promise under test is the one being
  // observed: a half-written merge leaves nothing behind.
  const map = new Map(Object.entries(original));
  let failedOnce = false;
  const dst = {
    get length() { return map.size; },
    key: i => [...map.keys()][i] ?? null,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      if (!failedOnce && k === 'daftarche-moods') { failedOnce = true; throw new Error('QuotaExceededError'); }
      map.set(k, String(v));
    },
    removeItem: k => map.delete(k),
    snapshot: () => Object.fromEntries(map),
  };
  const backup = { app: BACKUP_APP, format: 1, data: {
    'daftarche-name': 'تازه',                       // absent here → the fill write, which succeeds
    'daftarche-moods': J({ '2026-09-02': 5 }),       // differs → the write that fails
  } };
  const res = mergeBackup(dst, backup);
  assert.equal(failedOnce, true);
  assert.equal(res.ok, false);
  assert.equal(typeof res.reason, 'string');
  assert.deepEqual(dst.snapshot(), original);       // the filled name is taken back out again
});

test('mergeBackup refuses what parseBackup would have refused', () => {
  const dst = new FakeStorage({ 'daftarche-name': 'امیر' });
  assert.equal(mergeBackup(dst, { app: BACKUP_APP, format: 1, data: { 'evil-key': 'x' } }).ok, false);
  assert.equal(mergeBackup(dst, { app: BACKUP_APP, format: 1, data: { 'daftarche-name': 5 } }).ok, false);
  assert.equal(mergeBackup(dst, null).ok, false);
  assert.deepEqual(dst.snapshot(), { 'daftarche-name': 'امیر' });   // refused means untouched
});

test('merge → export → parse → replace round-trips on a fresh device', () => {
  // what a merge produced is an ordinary store: the next backup of it parses and restores whole
  const dst = new FakeStorage({
    'daftarche-v1': J([{ id: 'a', text: 'محلی', done: false }]),
    'daftarche-history': J(['2026-09-01']),
  });
  mergeBackup(dst, { app: BACKUP_APP, format: 1, data: {
    'daftarche-v1': J([{ id: 'b', text: 'از فایل', done: true, doneAt: 9 }]),
    'daftarche-name': 'ادغام‌شده',
  } });
  const text = JSON.stringify(collectBackup(dst, { release: '2.6.0' }));
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  const fresh = new FakeStorage();
  assert.equal(applyBackup(fresh, parsed.backup).ok, true);
  assert.deepEqual(JSON.parse(fresh.getItem('daftarche-v1')).map(t => t.id), ['a', 'b']);
  assert.equal(fresh.getItem('daftarche-name'), 'ادغام‌شده');
});

/* ── store.js: writes never throw, and a refused write is announced ── */
test('safeSet: returns true on success, false + event on failure, never throws', async () => {
  const events = [];
  globalThis.window = new EventTarget();
  window.addEventListener('daftarche:storage-error', e => events.push(e.detail));

  globalThis.localStorage = {
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() { throw new Error('denied'); },
    getItem() { return null; },
  };
  const { safeSet, safeRemove, saveTasks, readJSON } = await import('../js/store.js');

  assert.equal(safeSet('daftarche-x', '1'), false);
  assert.equal(events.length, 1);
  assert.equal(events[0].key, 'daftarche-x');
  assert.equal(safeRemove('daftarche-x'), false);
  assert.equal(events.length, 2);
  assert.equal(saveTasks([{ id: 1 }]), false);   // the real save path is guarded too
  assert.equal(readJSON('daftarche-x', 'fallback'), 'fallback');

  const written = new Map();
  globalThis.localStorage = { setItem: (k, v) => written.set(k, v), removeItem() {}, getItem: k => written.get(k) ?? null };
  assert.equal(safeSet('daftarche-y', '2'), true);
  assert.equal(written.get('daftarche-y'), '2');

  delete globalThis.window;
  delete globalThis.localStorage;
});
