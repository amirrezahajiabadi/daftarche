/* ═══ Jingool: fifth Daftarche character — sprite markup & avatar ═══
   Same architecture as Qorqori, Rizolo, Khabalo and Fekrbaz: expressions live
   as symbols in assets/characters/jingool/jingool.svg; the palette is CSS
   variables on the .jingool class. New poses are just new symbols plus
   entries here. */

export const JINGOOL_URL = 'assets/characters/jingool/jingool.svg';

export const JINGOOL_EXPRS = [
  'default', 'delighted', 'excited', 'mischievous',
  'surprised', 'proud', 'sleepy', 'celebrating',
];

/* Pose foundation for future contextual moments (task done, streak,
   achievements, milestones). Each pose maps to a base expression plus an
   optional pose-symbol overlay available in the sprite. */
export const JINGOOL_POSES = [
  { pose: 'idle', expr: 'default', overlay: null },
  { pose: 'pop', expr: 'surprised', overlay: 'jingool-motion' },
  { pose: 'tiny-cheer', expr: 'delighted', overlay: 'jingool-arms-up' },
  { pose: 'excited-float', expr: 'excited', overlay: null },
  { pose: 'proud', expr: 'proud', overlay: null },
  { pose: 'celebration', expr: 'celebrating', overlay: 'jingool-arms-up' },
];

/* Decorative by default: aria-hidden keeps the character out of the
   accessibility tree (surrounding text carries the meaning). */
export function jingoolMarkup(expr = 'default') {
  const e = JINGOOL_EXPRS.includes(expr) ? expr : 'default';
  return `<svg class="jingool" viewBox="0 0 200 200" aria-hidden="true"><use href="${JINGOOL_URL}#jingool-${e}"/></svg>`;
}

/* Simplified Jingool bust for the profile avatar: the spark-blob silhouette,
   clear face and the luminous core, recognizable at small sizes. */
export const JINGOOL_AVATAR = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#F7EBD2"/><path d="M32 9 C45 9 55 18 55 30 C55 42 49 52 40 56 C33 59 24 58 18 53 C11 47 9 38 10 29 C11 19 20 9 32 9 Z" fill="#D9A441" stroke="#5A4B35" stroke-width="2.4" stroke-linejoin="round"/><path d="M32 34 C38 34 44 38 44 44 C44 50 38 53 32 53 C26 53 20 50 20 44 C20 38 26 34 32 34 Z" fill="#EBCB78"/><path d="M32 38 C36 38 40 41 40 45 C40 49 36 51 32 51 C28 51 24 49 24 45 C24 41 28 38 32 38 Z" fill="#FFE8A3"/><path d="M26 23.5 a 3.2 3.4 0 1 0 6.4 0 a 3.2 3.4 0 1 0 -6.4 0" fill="#332D29"/><path d="M38.5 23.5 a 3.2 3.4 0 1 0 6.4 0 a 3.2 3.4 0 1 0 -6.4 0" fill="#332D29"/><circle cx="26.7" cy="22.4" r=".9" fill="#fff"/><circle cx="39.2" cy="22.4" r=".9" fill="#fff"/><path d="M29.5 29.5 Q 32.5 32 35.5 29.5" stroke="#5A4B35" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`;
