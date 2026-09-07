/* ═══ Khabalo: third Daftarche character — sprite markup & avatar ═══
   Same architecture as Qorqori and Rizolo: expressions live as symbols in
   assets/characters/khabalo/khabalo.svg; the palette is CSS variables on the
   .khabalo class. New poses are just new symbols plus entries here. */

export const KHABALO_URL = 'assets/characters/khabalo/khabalo.svg';

export const KHABALO_EXPRS = [
  'default', 'sleepy', 'cozy', 'tired',
  'thinking', 'surprised', 'happy', 'celebrating',
];

/* Decorative by default: aria-hidden keeps the character out of the
   accessibility tree (surrounding text carries the meaning). */
export function khabaloMarkup(expr = 'default') {
  const e = KHABALO_EXPRS.includes(expr) ? expr : 'default';
  return `<svg class="khabalo" viewBox="0 0 200 200" aria-hidden="true"><use href="${KHABALO_URL}#khabalo-${e}"/></svg>`;
}

/* Simplified Khabalo bust for the profile avatar: same palette, the soft
   cloud body and the small pillow resting on the head, calm neutral face. */
export const KHABALO_AVATAR = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#EFEAF5"/><rect x="19.5" y="7" width="25" height="15" rx="7.5" transform="rotate(-5 32 14.5)" fill="#D8CFDF" stroke="#514A55" stroke-width="2"/><path d="M24 14.5 Q 27 13 30 14.5 M34 14.5 Q 37 13 40 14.5" stroke="#C9BED5" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M32 21 C44 21 52 30 52 42 C52 53 43 60 32 60 C21 60 12 53 12 42 C12 30 20 21 32 21 Z" fill="#A89BBF" stroke="#514A55" stroke-width="2.5" stroke-linejoin="round"/><path d="M23 41 Q 26 38.5 29 41 M35 41 Q 38 38.5 41 41" stroke="#514A55" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M28.5 48.5 Q 32 51.5 35.5 48.5" stroke="#514A55" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="21" cy="47" rx="2.4" ry="1.5" fill="#C6A8BB" opacity=".5"/><ellipse cx="43" cy="47" rx="2.4" ry="1.5" fill="#C6A8BB" opacity=".5"/></svg>`;
