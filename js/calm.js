/* ═══ A calm moment ═══
   One rule, asked by everything that wants to interrupt the reader: the update
   prompt (js/app.js) and the due-date reminders (js/notifications.js). A moment
   is busy when any of these holds:

     · the hands are on the keyboard — measured by the keys, not by focus. The
       task field keeps focus long after the hands have stopped (adding a task
       puts the caret back in it), so waiting for a blur would mean waiting
       forever; a few quiet seconds is the whole test, and every keystroke
       pushes the clock forward.
     · a focus session is running — or is paused, which means it is coming back.
     · a dialog is open on top of the page. Rendered, not merely present: the
       same test the shared containment uses (js/modal.js), so a dialog inside
       an inactive page does not count as one.

   Two things deliberately do NOT live here, because the two callers answer them
   differently and neither answer belongs to the other:

     · whether the page is on screen. The prompt waits for the reader to come
       back — animating a toast behind a hidden tab is work nobody sees. A
       reminder may not wait: a notification is exactly how someone who is not
       looking at the app gets told.
     · whether another toast is holding the corner of the screen. A prompt would
       stack on it; a notification does not care. */

import { state } from './state.js';

/* How long a rest has to be, after the last key, before the hands count as off
   the keyboard. */
const REST_MS = 3000;

let lastKey = 0;
let armed = false;

/* The listener is attached the first time anyone asks, so importing this module
   has no side effects and no caller has to remember to start it. */
const arm = () => {
  if (armed) return;
  armed = true;
  document.addEventListener('keydown', () => { lastKey = Date.now(); }, true);
};

export function typing() {
  arm();
  return Date.now() - lastKey < REST_MS;
}

export function inSession() {
  const s = state.session;
  return !!s && (s.status === 'active' || s.status === 'paused');
}

export function dialogOpen() {
  for (const d of document.querySelectorAll('.overlay, .sheet')) {
    if (!d.hidden && d.getClientRects().length) return true;
  }
  return false;
}

export const isBusy = () => typing() || inSession() || dialogOpen();
