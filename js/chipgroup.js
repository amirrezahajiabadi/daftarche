/* ═══ Picker row — one row of small choices ═══
   The same control in three places: the interface's theme in settings, and the
   share card's colour and accent inside the Stats dialog. A row is a radio group
   with a single tab stop — the chosen chip — moved with the arrow keys, which is
   the behaviour the stats page's window switcher already had; giving it one
   shape means the pickers cannot drift apart.

   A chip may wear a palette (`data-palette`). The dot inside it is then painted
   from the same primitives the themes and the card templates are made of, so a
   chip shows the colour it would paint with rather than describing it — and a
   caller whose colours are not in that table (an accent) is free to paint its
   own dots, which is why the dot carries a class rather than an inline style.

   A chip may also wear a mode (`data-mode`). The caller then says which half is
   on screen — `setMode` — and the chips of the other half are hidden by CSS.
   That is what lets the share card offer the palettes of the theme it is being
   made in rather than all six, without rebuilding the row when the app's theme
   changes underneath it. A chip with no mode (the card's own «برنامه») is always
   visible, because it belongs to neither half. */

import { faDigits } from './utils.js';

export function pickerRow(host, items, { group, onPick }) {
  if (!host || !items.length) return { mark() {}, setMode() {} };

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
      const mode = it.mode ? ` data-mode="${it.mode}"` : '';
      return `<button type="button" class="pick-chip" role="radio" data-group="${group}"`
        + ` data-key="${it.key}"${pal}${mode} aria-checked="false" tabindex="-1">`
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
      /* Only what is on screen is walkable — a hidden half is not a detour. */
      const on = [...host.querySelectorAll('.pick-chip')].filter(b =>
        !host.dataset.mode || !b.dataset.mode || b.dataset.mode === host.dataset.mode);
      const i = on.findIndex(b => b.classList.contains('sel'));
      const next = on[(i + step + on.length) % on.length];
      if (!next) return;
      onPick(next.dataset.key);
      next.focus();
    });
  }

  /* Which half of the card's palettes is on screen. The hiding is CSS, keyed on
     the same attribute, so the two can never disagree. */
  const setMode = mode => { host.dataset.mode = mode || ''; };

  return { mark, setMode };
}

/* ═══ Toggle row — a row of choices that can hold several at once ═══
   The share card's numbers are the one place a reader picks more than one thing,
   and it is the same chip in the same row: what changes is the contract — a
   checkbox rather than a radio, and a selection the caller keeps as a list. It
   is the caller's queue, not the control's, because what a fourth pick should do
   is a decision about the card, not about the chips.

   The box in front of the label is a checkbox with a job: on the card the chosen
   numbers are ordered, so a picked chip wears its place in that order (۱، ۲، ۳)
   instead of a tick. When a fourth pick pushes the oldest one out, the numbers
   renumber in front of the reader — the one visible trace of the rule the hint
   under the row spells out. */
export function toggleRow(host, items, { group, onToggle }) {
  if (!host || !items.length) return { mark() {} };

  const mark = keys => {
    const list = Array.isArray(keys) ? keys : [keys];
    host.querySelectorAll('.pick-chip').forEach(b => {
      const at = list.indexOf(b.dataset.key);
      const sel = at !== -1;
      b.classList.toggle('sel', sel);
      b.setAttribute('aria-checked', String(sel));
      const box = b.querySelector('.pick-box');
      if (box) box.textContent = sel ? faDigits(at + 1) : '';
    });
  };

  if (!host.dataset.built) {
    host.dataset.built = '1';
    host.innerHTML = items.map(it => (
      `<button type="button" class="pick-chip" role="checkbox" aria-checked="false"`
      + ` data-group="${group}" data-key="${it.key}">`
      + `<i class="pick-box" aria-hidden="true"></i>${it.label}</button>`
    )).join('');

    host.addEventListener('click', e => {
      const b = e.target.closest('.pick-chip');
      if (b) onToggle(b.dataset.key);
    });

    /* Every chip keeps its own tab stop here — with more than one answer on
       screen, a single stop would make the others unreachable by keyboard. */
    host.querySelectorAll('.pick-chip').forEach(b => { b.tabIndex = 0; });

    host.addEventListener('keydown', e => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const b = e.target.closest('.pick-chip');
      if (!b) return;
      e.preventDefault();
      onToggle(b.dataset.key);
    });
  }

  return { mark };
}

/* ═══ Mode switch — the two halves of the theme table ═══
   Choosing a colour is two answers, not six: which half of the table, then
   which theme in it. This is the first answer — a segmented control whose two
   options are exclusive and exactly one is always on.

   It is a radio group with a single tab stop moved by the arrow keys, like every
   other row of choices in the app, so the picker and the rest of the interface
   are learned once. */

const SEG_LABELS = { light: 'روشن', dark: 'تیره' };

export function modeSwitch(host, { modes = ['light', 'dark'], onPick }) {
  if (!host) return { mark() {} };

  const mark = key => {
    host.querySelectorAll('.seg-btn').forEach(b => {
      const on = b.dataset.key === key;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  };

  if (!host.dataset.built) {
    host.dataset.built = '1';
    host.classList.add('seg');
    host.setAttribute('role', 'radiogroup');
    host.innerHTML = modes.map(m =>
      `<button type="button" class="seg-btn" role="radio" data-key="${m}"`
      + ` aria-checked="false" tabindex="-1">${SEG_LABELS[m] || m}</button>`
    ).join('');

    host.addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) onPick(b.dataset.key);
    });

    host.addEventListener('keydown', e => {
      const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const i = modes.indexOf(host.querySelector('.seg-btn.sel')?.dataset.key || '');
      const next = modes[(i + step + modes.length) % modes.length];
      onPick(next);
      host.querySelector(`[data-key="${next}"]`)?.focus();
    });
  }

  return { mark };
}

/* ═══ Swatch row — a theme shown, not described ═══
   The themes inside one half of the table. A chip is a small preview of the
   interface it would paint: three bands — the paper, a card standing on it, and
   the accent that card is drawn in. The bands are not painted here; the chip
   wears its palette as data-palette and css/base.css fills --card-bg,
   --card-surface and --card-accent from the same table the app themes are cut
   from, so a swatch can never advertise a colour its theme does not use.

   All six are built once and the three outside the chosen half are hidden by
   CSS — the host carries data-mode — so moving the switch above shows the other
   three without rebuilding anything: the selection is only marked again. */

export function swatchRow(host, items, { group, onPick }) {
  if (!host || !items.length) return { mark() {}, setMode() {} };

  const mark = key => {
    host.querySelectorAll('.swatch').forEach(b => {
      const on = b.dataset.key === key;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  };

  if (!host.dataset.built) {
    host.dataset.built = '1';
    host.innerHTML = items.map(it =>
      `<button type="button" class="swatch" role="radio" data-group="${group}"`
      + ` data-key="${it.key}" data-mode="${it.mode}" data-palette="${it.palette}"`
      + ` aria-checked="false" tabindex="-1">`
      + `<i class="swatch-preview" aria-hidden="true"><i></i><i></i><i></i></i>`
      + `<span class="swatch-name">${it.label}</span>`
      + `</button>`
    ).join('');

    host.addEventListener('click', e => {
      const b = e.target.closest('.swatch');
      if (b) onPick(b.dataset.key);
    });

    /* Only the half on screen is walkable: the arrow keys step through the three
       swatches the reader can actually see, never into a hidden one. */
    host.addEventListener('keydown', e => {
      const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const on = [...host.querySelectorAll('.swatch')]
        .filter(s => s.dataset.mode === host.dataset.mode);
      const i = on.findIndex(s => s.classList.contains('sel'));
      const next = on[(i + step + on.length) % on.length];
      if (!next) return;
      onPick(next.dataset.key);
      next.focus();
    });
  }

  /* Which half is on screen. The hiding itself is CSS, keyed on the same
     attribute, so the two can never disagree. */
  const setMode = mode => { host.dataset.mode = mode; };

  return { mark, setMode };
}
