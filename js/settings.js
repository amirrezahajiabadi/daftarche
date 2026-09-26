/* ═══ Settings — the page the profile's last card moved to ═══
   The rows themselves are older than this file: they were written at the foot of
   the profile, and the ids they answer to («themeModeSwitch», «themeSwatches»,
   «profFreezeBtn», «profClear») have not changed, so the theme picker, the
   achievements engine and the header switch all keep working without knowing the
   markup moved. What lives here is the page around them: what it paints when it
   is opened, and the two buttons that only exist on it.

   It is a page rather than a dialog because nothing here is an answer to the
   moment. Every row is a lasting choice, and a page can be left the way it was
   entered — the back control the shell adds above the header, the browser's own
   back, or the Android gesture (js/app.js). */

import { $, faNum } from './utils.js';
import { state } from './state.js';
import { markThemePicker } from './theme.js';
import { APP_VERSION, openReleaseNotes } from './changelog.js';
import { clearLibraryData } from './library.js';
import { clearUserAudioData } from './audio.js';

/* What the page says about itself, painted on entry. The picker is marked here
   as well as by js/theme.js because the two halves of the table are remembered
   per half: opening the page must show the theme the app is actually wearing,
   whichever door the reader came through. */
export function renderSettings() {
  markThemePicker();

  const pm = $('#profPomo');
  if (pm) pm.textContent = faNum(state.pomoMin) + ' دقیقه';

  /* The release number alone — the row it sits in is already labelled «نسخه»,
     so the cell must not say the word twice. Persian digits, "2.0.0" → "۲.۰".
     The number comes from js/version.js; without that file the cell is left
     empty rather than showing a wrong version. */
  const pv = $('#profVersion');
  if (pv && APP_VERSION) pv.textContent = APP_VERSION.split('.').slice(0, 2).join('.').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

export function initSettings() {
  /* ── What this build changed ──
     The boot check hands the release notes to whoever was here for the previous
     release; this is the other door — someone who wants to read what they are
     running right now. */
  $('#profNotes')?.addEventListener('click', openReleaseNotes);

  /* ── The wipe ──
     localStorage holds tasks, settings and the book metadata; the PDF files and
     the uploaded music live in their own databases and are removed explicitly.
     Both results are awaited before the page leaves, so a wipe that could not
     finish is reported instead of being reloaded away as a success. */
  const cl = $('#profClear');
  if (cl) cl.onclick = async () => {
    if (!confirm('همهٔ داده‌ها پاک بشه؟ این کار قابل برگشت نیست.')) return;
    const [booksCleared, audioCleared] = await Promise.all([
      clearLibraryData(),
      clearUserAudioData(),
    ]);
    localStorage.clear();
    if (!booksCleared || !audioCleared) {
      alert('فایل‌های کتاب یا موسیقی پاک نشدن؛ اگه تب دیگه‌ای از دفترچه بازه ببندش و دوباره امتحان کن.');
    }
    location.reload();
  };
}
