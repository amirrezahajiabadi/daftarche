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
import { renderBirthdayRow } from './birthday.js';
import { collectBackup, parseBackup, applyBackup, backupFileName, BACKUP_MAX_CHARS } from './backup.js';

/* What the page says about itself, painted on entry. The picker is marked here
   as well as by js/theme.js because the two halves of the table are remembered
   per half: opening the page must show the theme the app is actually wearing,
   whichever door the reader came through. */
export function renderSettings() {
  markThemePicker();
  renderBirthdayRow();

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

  /* ── Backup ──
     Export writes every daftarche-* key to one JSON file; import validates a
     file completely before touching anything, asks, and only then replaces the
     stored data (js/backup.js rolls back if a write fails). The page reloads
     after a restore so every module boots from the restored data. */
  const status = $('#backupStatus');
  const say = msg => { if (status) status.textContent = msg; };

  $('#backupExport')?.addEventListener('click', () => {
    try {
      const backup = collectBackup(localStorage, { release: APP_VERSION });
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      say('پشتیبان ساخته شد؛ فایل رو یه جای امن نگه دار.');
    } catch {
      say('ساختن پشتیبان نشد. دوباره امتحان کن.');
    }
  });

  const fileInput = $('#backupFile');
  $('#backupImport')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';   // so choosing the same file twice still fires
    if (!file) return;
    if (file.size > BACKUP_MAX_CHARS) { say('این فایل خیلی بزرگه و پشتیبان دفترچه نیست.'); return; }

    let text;
    try { text = await file.text(); } catch { say('فایل خوانده نشد.'); return; }

    const parsed = parseBackup(text);
    if (!parsed.ok) { say(parsed.reason); return; }

    const when = parsed.backup.exportedAt ? new Date(parsed.backup.exportedAt) : null;
    const whenText = when && !isNaN(when) ? ' (' + when.toLocaleDateString('fa-IR') + ')' : '';
    if (!confirm('داده‌های فعلی با این پشتیبان' + whenText + ' جایگزین بشن؟ این کار قابل برگشت نیست.')) return;

    const res = applyBackup(localStorage, parsed.backup);
    if (!res.ok) { say(res.reason); return; }
    say('بازگردانی شد؛ دفترچه دوباره بالا می‌آد…');
    setTimeout(() => location.reload(), 600);
  });

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
