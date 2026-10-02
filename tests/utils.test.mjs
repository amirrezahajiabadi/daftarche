import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey, shiftKey, parseDurationMin, formatDuration, parseTimeMin, parseTimeRange,
  formatClock, weekStartOf, weekKeyOf, faDigits, DUR_MIN, DUR_MAX,
} from '../js/utils.js';

test('dayKey is local, zero-padded', () => {
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(dayKey(new Date(2026, 11, 31)), '2026-12-31');
});

test('shiftKey steps by calendar days across month/year ends and leap day', () => {
  assert.equal(shiftKey('2026-01-31', 1), '2026-02-01');
  assert.equal(shiftKey('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftKey('2024-02-28', 1), '2024-02-29');
  assert.equal(shiftKey('2024-02-29', 1), '2024-03-01');
  assert.equal(shiftKey('2026-09-30', 0), '2026-09-30');
  assert.equal(shiftKey('2026-09-30', 365), '2027-09-30');
});

test('parseDurationMin accepts integers 1–480 only', () => {
  assert.equal(parseDurationMin(25), 25);
  assert.equal(parseDurationMin('45'), 45);
  assert.equal(parseDurationMin(DUR_MIN), 1);
  assert.equal(parseDurationMin(DUR_MAX), 480);
  for (const bad of [0, -5, 481, 1.5, 'abc', null, undefined, '', NaN]) {
    assert.equal(parseDurationMin(bad), null, String(bad));
  }
});

test('formatDuration', () => {
  assert.equal(formatDuration(null), null);
  assert.ok(formatDuration(30).includes('دقیقه'));
  assert.ok(formatDuration(60).includes('ساعت') && !formatDuration(60).includes('دقیقه'));
  assert.ok(formatDuration(90).includes('ساعت') && formatDuration(90).includes('دقیقه'));
});

test('time of day: 0–1439 whole minutes, and a span needs both ends in order', () => {
  assert.equal(parseTimeMin(0), 0);
  assert.equal(parseTimeMin(1439), 1439);
  for (const bad of [-1, 1440, 12.5, 'x', null, undefined, '']) assert.equal(parseTimeMin(bad), null, String(bad));
  assert.deepEqual(parseTimeRange(840, 960), { from: 840, to: 960 });
  assert.equal(parseTimeRange(960, 840), null);   // reversed
  assert.equal(parseTimeRange(840, 840), null);   // empty
  assert.equal(parseTimeRange(840, null), null);  // half a span
  assert.equal(parseTimeRange(null, null), null);
});

test('formatClock: two digits, Persian numerals', () => {
  assert.equal(formatClock(870), faDigits('14:30'));
  assert.equal(formatClock(5), faDigits('00:05'));
  assert.equal(formatClock(2000), null);
});

test('the week starts on Saturday', () => {
  // 2026-09-26 is a Saturday; every day of that week maps back to it.
  for (let i = 0; i < 7; i++) {
    assert.equal(weekKeyOf(shiftKey('2026-09-26', i)), '2026-09-26', 'day +' + i);
  }
  assert.equal(weekKeyOf('2026-10-03'), '2026-10-03');           // next Saturday starts a new week
  assert.equal(dayKey(weekStartOf(new Date(2026, 8, 30))), '2026-09-26'); // Wednesday
  assert.equal(dayKey(weekStartOf(new Date(2026, 8, 27))), '2026-09-26'); // Sunday
});

/* ── esc: the one HTML escaper ── */
import { esc } from '../js/utils.js';

test('esc neutralises all five markup characters', () => {
  assert.equal(esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(esc(`a & b's`), 'a &amp; b&#39;s');
  assert.equal(esc('</script><script>'), '&lt;/script&gt;&lt;script&gt;');
});

test('esc: already-escaped text is escaped again (it is not idempotent on purpose), Persian is untouched', () => {
  assert.equal(esc('&lt;'), '&amp;lt;');
  assert.equal(esc('کار «مهم» امروز'), 'کار «مهم» امروز');
});

test('esc: null/undefined become empty, other values are stringified', () => {
  assert.equal(esc(null), ''); assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0'); assert.equal(esc(12), '12');
});
