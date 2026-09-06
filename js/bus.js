/* ═══ Simple Event System for Coordinating Modules ═══
   Modules that depend on data changes subscribe,
   and modules that change data call notify. */

const listeners = new Set();

export const subscribe = fn => listeners.add(fn);
export const notify = () => listeners.forEach(fn => fn());