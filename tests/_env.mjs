/* Shared test environment: an in-memory localStorage installed BEFORE any app
   module is imported (js/state.js reads storage while it is being evaluated). */
class MemoryStorage {
  constructor() { this.map = new Map(); this.writes = 0; }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.writes++; this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}
export const ls = new MemoryStorage();
globalThis.localStorage = ls;
