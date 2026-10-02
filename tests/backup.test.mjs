/* Backup + guarded storage — the two things that decide whether a person's data
   survives a bad day. Pure Node, no browser: js/backup.js takes a storage
   object, and js/store.js only touches localStorage/window at call time. */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectBackup, parseBackup, applyBackup, isBackupKey,
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
