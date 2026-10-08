/* The tour's pure parts: the station data (the walk is a table before it is
   behaviour, and a typo in one selector is a station that points at nothing)
   and the placement geometry, which is DOM-free by design. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, LETTERS, computePlacement } from '../js/tour.js';

/* Every page the tour walks to must exist in index.html — the list is copied
   from the markup there; adding a page to the tour without the page is the
   mistake this catches. */
const PAGES = new Set(['today', 'tasks', 'focus', 'library', 'week', 'profile', 'stats', 'achv', 'settings']);

test('stations: every one has a real page, a title and a text', () => {
  assert.ok(STEPS.length >= 2, 'a walk of one station is not a walk');
  for (const [i, s] of STEPS.entries()) {
    assert.ok(PAGES.has(s.page), `station ${i}: page «${s.page}» does not exist`);
    assert.equal(typeof s.title, 'string');
    assert.ok(s.title.trim().length > 0, `station ${i}: empty title`);
    assert.equal(typeof s.text, 'string');
    assert.ok(s.text.trim().length > 0, `station ${i}: empty text`);
  }
});

test('stations: only the welcome has no target; targeted ones have selectors', () => {
  assert.equal(STEPS[0].sel, null, 'the first station is the welcome question');
  for (const [i, s] of STEPS.entries()) {
    if (i === 0) continue;
    assert.equal(typeof s.sel, 'string');
    assert.match(s.sel, /^[.#][a-zA-Z]/, `station ${i}: selector is a class or an id`);
    if (s.wrap != null) assert.ok(s.wrap.startsWith('.'), `station ${i}: wrap is a class selector`);
  }
});

test('stations: the walk moves forward, and the last one ends in settings', () => {
  for (let i = 1; i < STEPS.length; i++) {
    if (STEPS[i].page === STEPS[i - 1].page) continue;
    // A page the tour returns to (it never does today) would read as a glitch;
    // a new page is fine only if it is not one we have already left.
    const visited = new Set(STEPS.slice(0, i).map(s => s.page));
    assert.ok(!visited.has(STEPS[i].page),
      `station ${i}: back to «${STEPS[i].page}» after leaving it`);
  }
  assert.equal(STEPS[STEPS.length - 1].page, 'settings',
    'the walk ends at the door it can be re-entered from');
});

test('letters: one per station, all distinct', () => {
  assert.equal(LETTERS.length, STEPS.length);
  assert.equal(new Set(LETTERS).size, LETTERS.length);
});

/* ── Geometry ──
   A phone-sized viewport (390×760, the dock's band reserved) and targets in
   the places that decide the side. */
const VW = 390, VH = 760, BW = 320, BH = 180, BOTTOM = 80;
const opts = { bottomInset: BOTTOM };
const r = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });

test('a target in the middle sits below, arrow on its top edge', () => {
  const p = computePlacement(r(35, 300, 320, 56), VW, VH, BW, BH, opts);
  assert.equal(p.side, 'bottom');
  assert.equal(p.box.top, 300 + 56 + 10 + 14);              // rect.bottom + pad + gap
  assert.ok(Math.abs(p.arrow.top - p.box.top + 7) < 1);      // diamond half under the card
  assert.ok(p.arrow.left >= p.box.left + 16 && p.arrow.left <= p.box.left + BW - 30);
  // The hole wraps the target with 10px of air
  assert.equal(p.spot.left, 35 - 10);
  assert.equal(p.spot.width, 320 + 20);
  assert.equal(p.spot.height, 56 + 20);
});

test('a target near the bottom is read from above', () => {
  const rect = r(35, VH - BOTTOM - 90, 320, 56);
  const p = computePlacement(rect, VW, VH, BW, BH, opts);
  assert.equal(p.side, 'top');
  assert.ok(p.box.top + BH <= rect.top - 10, 'the card sits above the hole, not on the target');
  assert.equal(p.box.top + BH, rect.top - 10 - 14);            // hole's lower pad + gap
  assert.equal(p.arrow.top, p.box.top + BH - 7);
});

test('a tall target on a short screen hangs beside, not on top', () => {
  const p = computePlacement(r(35, 100, 320, 600), 390, 500, BW, BH, { bottomInset: 0 });
  assert.ok(p.side === 'left' || p.side === 'right');
  assert.ok(p.box.left >= 0 && p.box.left + BW <= 390, 'card stays inside the viewport');
});

test('the card never leaves the viewport, whatever the target does', () => {
  const cases = [
    r(-200, -100, 800, 60),   // half off both edges
    r(380, 200, 400, 60),     // past the right edge
    r(0, 0, 390, 760),        // the whole screen
    r(180, 740, 30, 30),      // corner, inside the dock band
  ];
  for (const [i, rect] of cases.entries()) {
    const p = computePlacement(rect, VW, VH, BW, BH, opts);
    assert.ok(p.box.left >= 12 - 0.001, `case ${i}: card past the inline edge`);
    assert.ok(p.box.left + BW <= VW - 12 + 0.001, `case ${i}: card past the other edge`);
    assert.ok(p.spot.width >= 24 && p.spot.height >= 24, `case ${i}: hole collapsed`);
  }
});

test('mobile placement moves a wide target card to a clear top or bottom edge', () => {
  const target = r(16, 430, 358, 300);
  const p = computePlacement(target, 390, 844, 286, 286, { bottomInset: 70, mobile: true });
  assert.ok(p.side === 'top' || p.side === 'bottom');
  const overlaps = Math.max(0, Math.min(p.box.top + 286, target.bottom + 10)
    - Math.max(p.box.top, target.top - 10));
  assert.equal(overlaps, 0, 'the mobile card does not cover the highlighted target');
  assert.ok(p.box.top >= 12 && p.box.top + 286 <= 844 - 70 - 12);
});

test('the mobile companion station leaves the entire target visible after scrolling', () => {
  let target = r(12, 240, 366, 360);
  const options = { mobile: true, bottomInset: 90 };
  let p = computePlacement(target, 390, 844, 320, 260, options);
  assert.notEqual(p.scrollBy, 0, 'a centered tall target needs to move away from the card');
  target = r(target.left, target.top - p.scrollBy, target.width, target.height);
  p = computePlacement(target, 390, 844, 320, 260, options);
  assert.equal(p.scrollBy, 0);
  assert.ok(p.box.top + 260 + 14 <= target.top - 10
    || target.bottom + 10 + 14 <= p.box.top);
  assert.equal(p.spot.height, target.height + 20);
});

test('mobile card and spotlight stay separate across small and rotated phone sizes', () => {
  const phones = [
    [320, 568, 288, 200], [390, 844, 320, 260], [430, 932, 320, 280],
    [667, 375, 560, 160], [844, 390, 560, 170],
  ];
  for (const [vw, vh, bw, bh] of phones) {
    for (const top of [-500, 0, 100, vh / 2, vh - 80]) {
      for (const height of [44, 200, 360, 900]) {
        let target = r(16, top, vw - 32, height);
        const options = { mobile: true, topInset: 20, bottomInset: 80 };
        let p;
        for (let i = 0; i < 4; i++) {
          p = computePlacement(target, vw, vh, bw, bh, options);
          if (Math.abs(p.scrollBy) <= 1) break;
          target = r(target.left, target.top - p.scrollBy, target.width, target.height);
        }
        const context = `${vw}x${vh}, target ${top}/${height}`;
        assert.ok(p.side === 'top' || p.side === 'bottom', context);
        assert.ok(p.box.top >= 32 && p.box.top + bh <= vh - 92, context);
        assert.ok(p.box.left >= 12 && p.box.left + bw <= vw - 12, context);
        assert.ok(p.spot.height > 0, context);
        assert.ok(p.spot.top + p.spot.height + 14 <= p.box.top + .001
          || p.box.top + bh + 14 <= p.spot.top + .001, context);
        assert.ok(Math.abs(p.scrollBy) <= 1, 'scroll alignment settles: ' + context);
      }
    }
  }
});

test('mobile navigation station remains highlighted rather than clipped by its own inset', () => {
  const target = r(30, 754, 330, 64);
  const p = computePlacement(target, 390, 844, 320, 240, { mobile: true, bottomInset: 0 });
  assert.equal(p.side, 'top');
  assert.equal(p.scrollBy, 0);
  assert.equal(p.spot.height, target.height + 20);
  assert.ok(p.box.top + 240 < target.top);
});

test('the hole never swallows the whole dimmed screen', () => {
  const p = computePlacement(r(0, 0, 390, 760), VW, VH, BW, BH, opts);
  assert.ok(p.spot.left >= 12 && p.spot.top >= 12);
  assert.ok(p.spot.left + p.spot.width <= VW - 12);
  assert.ok(p.spot.top + p.spot.height <= VH - BOTTOM - 12);
});
