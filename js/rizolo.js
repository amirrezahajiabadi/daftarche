/* ═══ Rizolo: second Daftarche character — sprite markup & avatar ═══
   Same architecture as Qorqori: expressions live as symbols in
   assets/characters/rizolo/rizolo.svg; the palette is CSS variables
   on the .rizolo class. New poses are just new symbols plus entries here. */

export const RIZOLO_URL = 'assets/characters/rizolo/rizolo.svg';

export const RIZOLO_EXPRS = [
  'default', 'curious', 'energetic', 'determined',
  'surprised', 'happy', 'sleepy', 'celebrating',
];

/* Decorative by default: aria-hidden keeps the character out of the
   accessibility tree (surrounding text carries the meaning). */
export function rizoloMarkup(expr = 'default') {
  const e = RIZOLO_EXPRS.includes(expr) ? expr : 'default';
  return `<svg class="rizolo" viewBox="0 0 200 200" aria-hidden="true"><use href="${RIZOLO_URL}#rizolo-${e}"/></svg>`;
}

/* Simplified Rizolo bust for the profile avatar: same palette, ears and
   the tiny spring-coil tail, so it stays recognizable at small sizes. */
export const RIZOLO_AVATAR = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#F6EBDD"/><path d="M13 64c2-13 9-19 19-19s17 6 19 19z" fill="#C97B4A"/><path d="M32 12c10 0 17 6 17 15 0 11-7 15-17 15S15 38 15 27c0-9 7-15 17-15z" fill="#D78355" stroke="#4F463F" stroke-width="2.5"/><path d="M21 18C17 12 15 7 17 3c2-2 5 0 6 4 1 3 3 8 4 11z" fill="#D78355" stroke="#4F463F" stroke-width="2"/><path d="M43 18c4-6 7-10 6-14-1-3-4-3-6 0-1 3-3 8-4 12z" fill="#D78355" stroke="#4F463F" stroke-width="2"/><ellipse cx="22" cy="15" rx="3" ry="4.5" transform="rotate(-20 22 15)" fill="#E8A47A"/><ellipse cx="42" cy="15" rx="2.8" ry="4.2" transform="rotate(18 42 15)" fill="#E8A47A"/><ellipse cx="25" cy="28" rx="4.3" ry="5" fill="#FBF8F2" stroke="#4F463F" stroke-width="1.5"/><ellipse cx="39" cy="28.5" rx="3.9" ry="4.6" fill="#FBF8F2" stroke="#4F463F" stroke-width="1.5"/><circle cx="26" cy="29" r="2" fill="#302B27"/><circle cx="38.5" cy="29.5" r="1.8" fill="#302B27"/><path d="M28 37q4 3 8 0" stroke="#4F463F" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="18.5" cy="33" r="1.8" fill="#E89B6C" opacity=".5"/><circle cx="45.5" cy="33.5" r="1.7" fill="#E89B6C" opacity=".5"/><path d="M50 56l3.5-2.6 3.5 2.6 3.5-2.6" stroke="#4F463F" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;