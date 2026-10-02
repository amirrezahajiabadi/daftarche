/* ═══ Storage warning — the write that could not be kept, said out loud ═══
   js/store.js never throws when the browser refuses a write (storage full,
   disabled in a private mode); it announces the failure on `window` instead.
   This is the listener: a toast that says the last change was not saved, and
   where the way out is. It is rate-limited so a burst of failed writes (a
   full storage fails on every save) is one message, not a wall of them. */

import { STORAGE_ERROR_EVENT } from './store.js';

const QUIET_MS = 30000;   // at most one message per half minute
const SHOW_MS = 9000;     // long enough to read two lines

let lastShown = 0;
let hideTimer = 0;

export function initStorageWarning() {
  const toast = document.getElementById('storageToast');
  const close = document.getElementById('storageToastClose');
  if (!toast) return;

  const hide = () => {
    clearTimeout(hideTimer);
    toast.classList.remove('show');
    toast.hidden = true;
  };
  close?.addEventListener('click', hide);

  window.addEventListener(STORAGE_ERROR_EVENT, () => {
    const now = Date.now();
    if (now - lastShown < QUIET_MS) return;
    lastShown = now;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, SHOW_MS);
  });
}
