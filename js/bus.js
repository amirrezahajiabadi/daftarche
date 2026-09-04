/* ═══ سیستم رویداد ساده برای هماهنگی ماژول‌ها ═══
   هر ماژولی که به تغییر داده‌ها وابسته است، subscribe می‌کند
   و هر ماژولی که داده‌ای را تغییر می‌دهد، notify را صدا می‌زند. */

const listeners = new Set();

export const subscribe = fn => listeners.add(fn);
export const notify = () => listeners.forEach(fn => fn());