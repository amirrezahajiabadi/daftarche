/* ═══ Qorqori: Daftarche mascot — sprite markup & avatar ═══
   Expressions live as symbols in assets/characters/qorqori/qorqori.svg;
   the palette is CSS variables on the .qorqori class so colors can be
   tuned without touching the asset. Adding a new pose is just a new
   symbol in the sprite plus an entry here. */

export const QORQORI_URL = 'assets/characters/qorqori/qorqori.svg';

export const QORQORI_EXPRS = [
  'default', 'happy', 'determined', 'thinking',
  'sleepy', 'surprised', 'proud', 'celebrating',
];

/* Decorative by default: aria-hidden so the character stays out of the
   accessibility tree (surrounding text carries the meaning). */
export function qorqoriMarkup(expr = 'default') {
  const e = QORQORI_EXPRS.includes(expr) ? expr : 'default';
  return `<svg class="qorqori" viewBox="0 0 200 200" aria-hidden="true"><use href="${QORQORI_URL}#qorqori-${e}"/></svg>`;
}

/* Simplified Qorqori bust used as the profile avatar, drawn in the same
   palette and outline language so it is the same character at small size. */
export const QORQORI_AVATAR = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#eef3e2"/><path d="M13 64c2-13 9-19 19-19s17 6 19 19z" fill="#8aa96f"/><path d="M32 7c12 0 20 8 20 20 0 13-8 20-20 20S12 40 12 27c0-12 8-20 20-20z" fill="#93b37c" stroke="#42593a" stroke-width="2.5"/><ellipse cx="23" cy="26.5" rx="4.6" ry="5.1" fill="#fbfaf4" stroke="#42593a" stroke-width="1.6"/><ellipse cx="41" cy="27.5" rx="4.1" ry="4.7" fill="#fbfaf4" stroke="#42593a" stroke-width="1.6"/><circle cx="24" cy="27.5" r="2.1" fill="#333d2c"/><circle cx="40" cy="28.5" r="1.8" fill="#333d2c"/><path d="M27 36.5q5 3.6 10 0" stroke="#42593a" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="16.5" cy="33" r="2.3" fill="#e8a77f" opacity=".5"/><circle cx="47.5" cy="33.5" r="2.1" fill="#e8a77f" opacity=".5"/></svg>`;