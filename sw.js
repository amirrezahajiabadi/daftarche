/* ═══ Service Worker — offline shell ═══
   Strategy, per asset class:
     · navigations → network-first, falling back to the cached shell so the app
       opens offline and still picks up a new build as soon as one is reachable
     · same-origin assets (css/js/fonts/icons) → stale-while-revalidate: instant
       and offline-capable, refreshed in the background for the next visit
     · the versioned pdf.js build on the CDN → cache-first, because those URLs
       are immutable and the Reader needs them to render offline
   Book binaries and reading data never pass through here. Everything the Reader
   persists (pdf files, highlights, notes, focus history) lives in IndexedDB and
   is read directly by the app, so no user content is duplicated into a cache.

   Updates are never forced. A new worker installs quietly and only takes over
   when the page asks it to (see the message handler), so a running session is
   never swapped out mid-task. */

const VERSION = 'v6';

const STATIC_CACHE = `daftarche-static-${VERSION}`;
const RUNTIME_CACHE = `daftarche-runtime-${VERSION}`;
const KEEP = [STATIC_CACHE, RUNTIME_CACHE];

/* Resolving against the script URL keeps every path correct both at a domain
   root and under a project subpath. */
const BASE = new URL('./', self.location);
const shellURL = path => new URL(path, BASE).href;

/* Everything the app needs to boot and run with no network at all. */
const SHELL = [
  'index.html',
  'manifest.webmanifest',
  'css/base.css',
  'css/components.css',
  'css/components2.css',
  'css/fekrbaz.css',
  'css/jingool.css',
  'css/khabalo.css',
  'css/library.css',
  'css/overlays.css',
  'css/profile.css',
  'css/qorqori.css',
  'css/rizolo.css',
  'css/tasks.css',
  'css/today.css',
  'js/app.js',
  'js/audio.js',
  'js/bus.js',
  'js/changelog.js',
  'js/confetti.js',
  'js/constants.js',
  'js/decision.js',
  'js/decisioncontext.js',
  'js/duepicker.js',
  'js/fekrbaz.js',
  'js/focus.js',
  'js/focushistory.js',
  'js/insights.js',
  'js/jalali.js',
  'js/jingool.js',
  'js/khabalo.js',
  'js/library.js',
  'js/notifications.js',
  'js/push-service.js',
  'js/profile.js',
  'js/progress.js',
  'js/qorqori.js',
  'js/reader.js',
  'js/rizolo.js',
  'js/roll.js',
  'js/state.js',
  'js/store.js',
  'js/tasks.js',
  'js/today.js',
  'js/utils.js',
  'js/week.js',
  'assets/fonts/Estedad-Mad.woff2',
  'assets/fonts/Estedad[wght].woff2',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-192.png',
  'assets/icons/icon-maskable-512.png',
  'assets/characters/fekrbaz/fekrbaz.svg',
  'assets/characters/jingool/jingool.svg',
  'assets/characters/khabalo/khabalo.svg',
  'assets/characters/qorqori/qorqori.svg',
  'assets/characters/rizolo/rizolo.svg',
];

/* The pinned pdf.js build. The two entry points are stored up front so the
   Reader can open a book offline; its auxiliary files (cmaps, standard fonts)
   are fetched on demand and kept by the runtime cache below. */
const PDFJS_PREFIX = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/';
const PDFJS_ENTRIES = [
  `${PDFJS_PREFIX}build/pdf.min.mjs`,
  `${PDFJS_PREFIX}build/pdf.worker.min.mjs`,
];

const inScope = href => href.startsWith(BASE.href);
const isPdfJs = href => href.startsWith(PDFJS_PREFIX);

/* ── Install: fill the shell cache ── */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    /* Individual adds so one missing file can never abort the whole install,
       and `reload` so a stale HTTP cache entry is not baked into the shell. */
    await Promise.allSettled(
      SHELL.map(path => cache.add(new Request(shellURL(path), { cache: 'reload' })))
    );
  })());
});

/* ── Activate: drop superseded caches, then take over open pages ── */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter(n => n.startsWith('daftarche-') && !KEEP.includes(n)).map(n => caches.delete(n))
    );
    /* The pdf.js entries are kept in the runtime cache and refreshed from the
       network when this worker activates on a new version. */
    const runtime = await caches.open(RUNTIME_CACHE);
    await Promise.allSettled(PDFJS_ENTRIES.map(href => runtime.add(new Request(href))));
    await self.clients.claim();
  })());
});

/* ── The page decides when an installed update may take over ── */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ── Notifications: tapping an alert opens (or focuses) the app ──
   Deep-links to the task list; when the payload carries a specific task the
   URL keeps that context so the list can highlight it. */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const extra = event.notification.data && event.notification.data.taskId
    ? `?task=${encodeURIComponent(event.notification.data.taskId)}`
    : '';
  const target = new URL(`index.html${extra}`, self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Focus an existing window if one is open, otherwise open a fresh one
    for (const client of all) {
      try {
        await client.focus();
        if (client.navigate) await client.navigate(target);
        return;
      } catch { /* try the next window */ }
    }
    await self.clients.openWindow(target);
  })());
});

/* ── Push: reminders delivered by the push server while the app is closed ──
   Every notification is Persian, right-to-left, and carries the deep-link
   context the notificationclick handler above consumes. */
self.addEventListener('push', event => {
  let data = { title: 'دَفتَرچه', body: 'شما یک یادآوری جدید دارید!' };
  if (event.data) {
    try { data = event.data.json(); }
    catch { data = { body: event.data.text() }; }
  }
  const options = {
    body: data.body || '',
    icon: data.icon || 'assets/icons/icon-192.png',
    badge: data.badge || 'assets/icons/icon-192.png',
    tag: data.tag || 'general-notification',
    dir: 'rtl',
    lang: 'fa',
    data: data.data || { url: '/' },
  };
  event.waitUntil(self.registration.showNotification(data.title || 'دَفتَرچه', options));
});

/* A subscription that the push service reports as gone (user cleared site
   data, reinstalled, endpoint rotated) must be dropped server-side; the
   page is told so it can re-subscribe on the next user interaction. */
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    try { await event.subscription.unsubscribe(); } catch { /* already gone */ }
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      try { client.postMessage({ type: 'push-subscription-invalid' }); } catch { /* ignore */ }
    }
  })());
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(res => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  if (cached) return cached;
  const fresh = await network;
  if (fresh) return fresh;
  return Response.error();
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
  return res;
}

/* A hanging connection must not hold the app closed; after this long the cached
   shell is served and the network copy still lands for the next launch. */
const NAV_TIMEOUT = 3500;

async function networkFirstShell(request) {
  const cache = await caches.open(STATIC_CACHE);
  const fromNetwork = fetch(request).then(res => {
    if (res && res.ok) cache.put(shellURL('index.html'), res.clone());
    return res;
  }).catch(() => null);

  const raced = await Promise.race([
    fromNetwork,
    new Promise(resolve => setTimeout(() => resolve('timeout'), NAV_TIMEOUT)),
  ]);
  if (raced && raced !== 'timeout') return raced;

  const cached = await cache.match(shellURL('index.html'));
  if (cached) return cached;
  const late = await fromNetwork;
  return late || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let target;
  try { target = new URL(request.url); } catch { return; }

  /* Range requests must reach the server untouched. */
  if (request.headers.has('range')) return;

  if (isPdfJs(target.href)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  /* Any other cross-origin resource is left to the network. */
  if (!inScope(target.href)) return;

  /* The worker itself is always fetched live, so an update is never blocked by
     a cached copy of the previous worker. */
  if (target.pathname === new URL(shellURL('sw.js')).pathname) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
});
