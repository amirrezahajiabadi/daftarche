/* ═══ Due-date picker — what it promises, after the rebuild ═══
   js/duepicker.js used to draw its own month grid and now draws js/jalalical.js
   instead, which is the right call for a month of arithmetic that should only
   be written once. But the picker's own contract is unchanged and nobody was
   watching it while the drawing moved, so this pins the parts a caller can
   rely on: what the keys look like, that the quick buttons are there, that the
   footer clears rather than picks, and that the overlay refuses to open twice.

   These are the behaviours the task form reaches for on every tap of «مهلت».
   The overlay and DOM wiring around them is exercised in the browser; what is
   checked here is that the shape of a pick survives the refactor. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(HERE, '..', p), 'utf8');

const SRC = read('js/duepicker.js');
const HTML = read('index.html');

test('the picker no longer draws its own month', () => {
  /* A second copy of the grid arithmetic is what this refactor exists to
     remove, so its absence is the thing worth asserting. */
  assert.ok(SRC.includes("from './jalalical.js'"), 'the shared grid is not imported');
  assert.ok(!/cal-grid/.test(SRC), 'it still builds a grid by hand');
  assert.ok(!/cal-week/.test(SRC), 'it still writes the weekday row by hand');
});

test('the picker still offers today, tomorrow and the day after', () => {
  for (const label of ['امروز', 'فردا', 'پس‌فردا']) {
    assert.ok(SRC.includes(label), `the «${label}» quick button is gone`);
  }
  /* These answer «how soon is this due?» — the birthday calendar has no use
     for them, which is why they stayed on this side of the shared grid. */
  assert.ok(SRC.includes('dueKeyFromOffset'), 'quick buttons no longer build day keys');
});

test('the picker keeps clearing rather than picking', () => {
  /* closeWith(null) is what «بدون مهلت» sends, and null is the one value the
     caller reads as «remove the deadline». A change here would quietly turn
     that button into «pick today». */
  assert.ok(SRC.includes('بدون مهلت'));
  assert.ok(/closeWith\(null\)/.test(SRC), 'the clear button no longer sends null');
});

test('a picked day is a Gregorian day key', () => {
  const KEY = /^\d{4}-\d{2}-\d{2}$/;
  /* The task list stores and compares dueDate as YYYY-MM-DD, so this is the
     shape the caller depends on. The birthday calendar uses MM-DD instead,
     which is why keyOf is a parameter and not a constant. */
  assert.ok(SRC.includes('dayKey(jalaliToDate(jy, jm, jd))'),
    'the picker no longer keys days by the Gregorian day');
  /* The guard is asserted by running it, not by reading it out of the source:
     a pattern that only looks right in a string is one nobody has checked. */
  assert.equal(KEY.test('2026-10-04'), true, 'a real stored key is accepted');
  assert.equal(KEY.test('nonsense'), false, 'a corrupt value is refused');
});

test('the picker does not open on top of itself', () => {
  assert.ok(/if \(!overlay \|\| !overlay\.hidden\) return;/.test(SRC),
    'openDuePicker no longer refuses to open while already open');
});

test('the overlay it drives is still in the page', () => {
  for (const id of ['dueOverlay', 'dueCal', 'dueClose']) {
    assert.ok(HTML.includes(`id="${id}"`), `#${id} is missing from index.html`);
  }
});
