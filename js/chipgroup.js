/* ═══ Picker row — one row of small choices ═══
   The same control in two places: the interface's theme in settings, and the
   share card's template inside the Stats dialog. A row is a radio group with a
   single tab stop — the chosen chip — moved with the arrow keys, which is the
   behaviour the stats page's window switcher already had; giving it one shape
   means the two pickers cannot drift apart.

   A chip may wear a palette (`data-palette`). The dot inside it is then painted
   from the same primitives the themes and the card templates are made of, so a
   chip shows the colour it would paint with rather than describing it. */

export function pickerRow(host, items, { group, onPick }) {
  if (!host || !items.length) return { mark() {} };

  const mark = key => {
    host.querySelectorAll('.pick-chip').forEach(b => {
      const on = b.dataset.key === key;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  };

  /* Built once. The host is a container the markup owns; everything inside it
     comes from the caller's list, so a key that is not in that list can never
     be on screen — and a selected chip is always a real choice. */
  if (!host.dataset.built) {
    host.dataset.built = '1';
    host.innerHTML = items.map(it => {
      const pal = it.palette ? ` data-palette="${it.palette}"` : '';
      return `<button type="button" class="pick-chip" role="radio" data-group="${group}"`
        + ` data-key="${it.key}"${pal} aria-checked="false" tabindex="-1">`
        + `<i class="pick-dot" aria-hidden="true"></i>${it.label}</button>`;
    }).join('');

    host.addEventListener('click', e => {
      const b = e.target.closest('.pick-chip');
      if (b) onPick(b.dataset.key);
    });

    /* In a right-to-left row the left arrow moves on and the right arrow moves
       back, matching the way the row reads. */
    host.addEventListener('keydown', e => {
      const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const keys = items.map(i => i.key);
      const i = keys.indexOf(host.querySelector('.pick-chip.sel')?.dataset.key || '');
      const next = keys[(i + step + keys.length) % keys.length];
      onPick(next);
      host.querySelector(`[data-key="${next}"]`)?.focus();
    });
  }

  return { mark };
}
