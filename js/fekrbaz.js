/* ═══ Fekrbaz: fourth Daftarche character — sprite markup & avatar ═══
   Same architecture as Qorqori, Rizolo and Khabalo: expressions live as
   symbols in assets/characters/fekrbaz/fekrbaz.svg; the palette is CSS
   variables on the .fekrbaz class. New poses are just new symbols plus
   entries here. */

export const FEKRBAZ_URL = 'assets/characters/fekrbaz/fekrbaz.svg';

export const FEKRBAZ_EXPRS = [
  'default', 'thinking', 'focused', 'curious',
  'surprised', 'confused', 'happy', 'proud',
];

/* Decorative by default: aria-hidden keeps the character out of the
   accessibility tree (surrounding text carries the meaning). */
export function fekrbazMarkup(expr = 'default') {
  const e = FEKRBAZ_EXPRS.includes(expr) ? expr : 'default';
  return `<svg class="fekrbaz" viewBox="0 0 200 200" aria-hidden="true"><use href="${FEKRBAZ_URL}#fekrbaz-${e}"/></svg>`;
}

/* Simplified Fekrbaz bust for the profile avatar: same palette, the brow
   bands and warm cream eyes, so it stays recognizable at small sizes. */
export const FEKRBAZ_AVATAR = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#E7EDF2"/><path d="M13 64c3-12 10-18 19-18s16 6 19 18z" fill="#9EADB8"/><path d="M32 8 C45 8 53 17 53 28 C53 39 45 48 32 50 C19 48 11 39 11 28 C11 17 19 8 32 8 Z" fill="#718292" stroke="#414A52" stroke-width="2.4" stroke-linejoin="round"/><path d="M17 25 Q 24 20 31 23" stroke="#414A52" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M17 25 Q 24 20 31 23" stroke="#9EADB8" stroke-width="3.8" fill="none" stroke-linecap="round"/><path d="M47 25 Q 40 20 33 23" stroke="#414A52" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M47 25 Q 40 20 33 23" stroke="#9EADB8" stroke-width="3.8" fill="none" stroke-linecap="round"/><path d="M21 31 Q 26 27 31 31 Q 26 35 21 31 Z" fill="#D9C8A5" stroke="#414A52" stroke-width="1.7" stroke-linejoin="round"/><path d="M33 31 Q 38 27 43 31 Q 38 35 33 31 Z" fill="#D9C8A5" stroke="#414A52" stroke-width="1.7" stroke-linejoin="round"/><circle cx="26" cy="31.4" r="1.9" fill="#292F34"/><circle cx="38" cy="31.4" r="1.9" fill="#292F34"/><circle cx="25.4" cy="30.8" r=".7" fill="#fff"/><circle cx="37.4" cy="30.8" r=".7" fill="#fff"/><path d="M28.5 39.5 Q 32 42 35.5 39.5" stroke="#414A52" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`;
