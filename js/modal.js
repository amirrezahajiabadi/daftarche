/* ═══ Modal containment — focus stays in, the page behind stays put ═══
   A modal is any rendered .overlay or .sheet, whoever opened it. While one is
   open two things hold at once:

     · keyboard focus lives inside it — Tab and Shift+Tab cycle through the
       dialog's own controls and never wander into the page underneath — and
       when it closes, focus goes back to whatever had it before;
     · the page behind does not scroll, so a drag on the backdrop cannot slide
       the list the dialog is floating over.

   The dialogs in this app live in six different modules (the name card, the
   dice, the due picker, the goal editor, the character picker, the release
   notes, and the reader's two sheets) and every one of them opens and closes by
   flipping the `hidden` attribute. So containment is not bolted onto each call
   site: it watches that one attribute and follows whichever dialog is on top.
   A dialog added later is contained without anyone having to remember this file
   exists — and the release-notes dialog, which used to carry its own private
   copy of the same three behaviours, now just opens.

   A dialog may name the control it wants focused first with [data-autofocus]
   (the character picker uses it to start on the character already chosen);
   otherwise its first focusable control is used, and failing that the dialog
   itself becomes the focus stop so Tab still stays inside. */

const MODAL_SELECTOR = '.overlay, .sheet';

/* Anything a keyboard can legitimately land on. Disabled controls and hidden
   inputs are left out so the loop never parks focus on something unreachable. */
const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe',
  'audio[controls]', 'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/* Rendered, not merely present: a dialog inside an inactive page is display:none
   and must not count as open. getClientRects() answers that for fixed elements
   too, where offsetParent is always null. */
const isRendered = el => !el.hidden && el.getClientRects().length > 0;

const openModals = () => [...document.querySelectorAll(MODAL_SELECTOR)].filter(isRendered);

const focusablesIn = modal =>
  [...modal.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0);

/* The dialog currently owning focus, and the element to hand it back to.
   Document order is the stacking order for these dialogs (the sheets mount
   before the overlays, the release notes append last), so the last rendered
   one is the one on top. */
let top = null;
let returnTo = null;

function apply() {
  const open = openModals();
  const next = open.length ? open[open.length - 1] : null;
  if (next === top) return;

  /* Closed: release the page and give focus back — unless the element that had
     it is gone (the task that opened the picker was deleted, the row was
     filtered away), in which case focus is left where the browser put it. */
  if (!next) {
    top = null;
    document.body.classList.remove('no-scroll');
    const back = returnTo;
    returnTo = null;
    if (back && back.isConnected) back.focus({ preventScroll: true });
    return;
  }

  /* A dialog opening on top of another one keeps the original return point. */
  if (!top) returnTo = document.activeElement;
  top = next;
  document.body.classList.add('no-scroll');

  /* preventScroll: the dialog is fixed and the page behind is frozen, so there
     is nothing to scroll into view — and opening never moves the page. */
  const entry = next.querySelector('[data-autofocus]') || focusablesIn(next)[0] || next;
  if (entry === next && !next.hasAttribute('tabindex')) next.tabIndex = -1;
  entry.focus({ preventScroll: true });
}

/* The loop itself: Tab from the last control comes back to the first, Shift+Tab
   from the first goes to the last, and focus that somehow escaped the dialog is
   pulled back in. Captured, so a dialog's own key handling cannot open a hole in
   it. */
function onKeydown(e) {
  if (e.key !== 'Tab' || !top) return;
  const items = focusablesIn(top);
  if (!items.length) { e.preventDefault(); return; }

  const first = items[0], last = items[items.length - 1];
  const active = document.activeElement;

  if (!top.contains(active)) { e.preventDefault(); first.focus({ preventScroll: true }); return; }
  if (e.shiftKey && active === first) { e.preventDefault(); last.focus({ preventScroll: true }); }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus({ preventScroll: true }); }
}

export function initModalContainment() {
  const watch = new MutationObserver(records => {
    /* Only a dialog opening or closing concerns this module, while the observer
       sees every `hidden` flip in the document (rows, empty states, hints) and
       every node a render adds. The records are therefore filtered down to the
       one question that matters — "is this a dialog's own hidden attribute, or
       a dialog being mounted?" — before the state check runs. Each test is a
       class match on the node itself, never a scan of its subtree: a render that
       appends a hundred elements must not make this look inside all of them. */
    for (const r of records) {
      if (r.type === 'attributes') {
        if (r.target.matches?.(MODAL_SELECTOR)) return apply();
        continue;
      }
      for (const node of r.addedNodes) {
        if (node.nodeType === 1 && node.matches?.(MODAL_SELECTOR)) return apply();
      }
    }
  });
  watch.observe(document.body, {
    attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true,
  });
  document.addEventListener('keydown', onKeydown, true);
  apply();
}
