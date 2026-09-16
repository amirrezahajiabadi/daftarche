/* ═══ Web Push — background reminder layer ═══
   Additive upgrade over js/notifications.js (local timers): when the push
   server is reachable, the subscription is created from the same user
   interaction that grants permission (the task bell), so closing the app
   no longer silences due-date reminders. iOS/iPadOS 16.4+ standalone PWAs
   are covered by the exact same standards-based path — the permission
   request always originates from a real user gesture. */

import { urlBase64ToUint8Array } from './utils.js';

/* Where the push server lives. Same origin by default; a deployment can
   point this at a dedicated host without touching the rest of the app. */
const SERVER = '/';

const API = {
  publicKey: `${SERVER}api/vapid-public-key`,
  subscribe: `${SERVER}api/subscribe`,
  unsubscribe: `${SERVER}api/unsubscribe`,
};

/* ── Capability ──
   Feature detection, never browser sniffing: every standards-compliant
   browser (Chrome, Edge, Firefox, Safari desktop, iOS 16.4+ standalone)
   passes automatically; everything else falls back to local notifications
   with zero console noise. */
export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/* The server may be absent (e.g. static hosting only) — in that case push
   is quietly unavailable and the local scheduler keeps working alone. */
async function serverAvailable() {
  try {
    const res = await fetch(API.publicKey, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.publicKey === 'string' && data.publicKey.length > 0 ? data.publicKey : null;
  } catch {
    return null; // no server → feature silently off
  }
}

/* ── Subscription state ── */
export async function getPushSubscription() {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

/* ── Subscribe ──
   MUST be called from inside a user gesture (bell click / settings toggle).
   Order matters: permission first (iOS requires it in the gesture), then
   the push subscription, then registration with the backend.
   Resolves with the subscription, or null when push is unavailable/denied. */
export async function enablePush() {
  if (!pushSupported()) return null;

  // Permission: never prompted outside a direct user interaction.
  let permission = Notification.permission;
  if (permission === 'default') {
    try { permission = await Notification.requestPermission(); }
    catch { return null; }
  }
  if (permission !== 'granted') return null;

  try {
    const reg = await navigator.serviceWorker.ready;

    // Reuse an existing subscription when one is already valid.
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const publicKey = await serverAvailable();
      if (!publicKey) return null;
      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    }

    // Tell the backend so it can target this device later.
    await fetch(API.subscribe, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    }).catch(() => { /* the local layer still works if the backend is down */ });

    return sub;
  } catch {
    // NotAllowedError / network failure / unsupported — never break the caller.
    return null;
  }
}

/* ── Unsubscribe ──
   Tears the subscription down locally and informs the backend. */
export async function disablePush() {
  if (!pushSupported()) return;
  try {
    const sub = await getPushSubscription();
    if (!sub) return;
    await fetch(API.unsubscribe, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => { /* backend cleanup is best-effort */ });
    await sub.unsubscribe();
  } catch { /* nothing the caller can do — stay silent */ }
}

/* ── Boot ──
   No prompts, no subscriptions on load. Only resyncs an already-existing
   subscription with the backend (covers the case where the backend store
   was rebuilt but the client subscription is still valid). */
export async function syncExistingSubscription() {
  if (!pushSupported()) return;
  try {
    const sub = await getPushSubscription();
    if (!sub) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && Notification.permission === 'granted') {
      await fetch(API.subscribe, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      }).catch(() => { /* server absent — nothing to do */ });
    }
  } catch { /* stay silent */ }
}
