/* ═══ Service Worker — offline shell ═══
   Strategy, per asset class:
     · the app document and the same-origin files it asks for → served from the
       release cache this worker owns, so a page load can never pair a new
       index.html with the previous build's styles or modules; the network is
       consulted only for something this release did not cache (the very first
       controlled load, or a cache the browser evicted)
     · a navigation that is not the app document → the network answers, with the
       cached document as the offline fallback
     · the versioned pdf.js build on the CDN → cache-first, because those URLs
       are immutable and the Reader needs them to render offline
   Book binaries and reading data never pass through here. Everything the Reader
   persists (pdf files, highlights, notes, focus history) lives in IndexedDB and
   is read directly by the app, so no user content is duplicated into a cache.

   A release is the unit of change. `install` writes a whole cache for the next
   build and `activate` drops every earlier one, so a release is never applied
   in pieces: the cache is only filled as a set, and swapping a running client
   over happens through the worker lifecycle below (the page offers the update,
   or hands over quietly while it is in the background). That is why js/version.js
   has to move for any change to a shell file — it is what makes the new worker
   install at all.

   Updates are never forced. A new worker installs quietly and only takes over
   when the page asks it to (see the message handler), so a running session is
   never swapped out mid-task. */

/* Release identity, from the one file the page reads as well. The path is
   relative to this worker's own script URL, so it lands inside whatever
   subpath the project is served from. */
try { importScripts('./js/version.js'); } catch { /* deploy is missing it; the fallback below keeps the worker usable */ }

const BUILD = self.DAFTARCHE_BUILD || 'unknown';

const STATIC_CACHE = `daftarche-static-${BUILD}`;
const RUNTIME_CACHE = `daftarche-runtime-${BUILD}`;
const KEEP = [STATIC_CACHE, RUNTIME_CACHE];

/* Resolving against the script URL keeps every path correct both at a domain
   root and under a project subpath. */
const BASE = new URL('./', self.location);
const shellURL = path => new URL(path, BASE).href;
/* Notifications point back into the project, so their deep-links and artwork
   resolve against the worker's own base and land correctly both at a domain
   root and under a project subpath. A deployment may hand over an absolute
   URL instead; that one passes through untouched. */
const projectURL = p => new URL(String(p || '').replace(/^\/+/, ''), BASE).href;

/* Everything the app needs to boot and run with no network at all. */
const SHELL = [
  'index.html',
  'manifest.webmanifest',
  'css/achievements.css',
  'css/base.css',
  'css/components.css',
  'css/components2.css',
  'css/fekrbaz.css',
  'css/jingool.css',
  'css/khabalo.css',
  'css/library.css',
  'css/overlays.css',
  'css/planner.css',
  'css/profile.css',
  'css/qorqori.css',
  'css/rizolo.css',
  'css/settings.css',
  'css/stats.css',
  'css/tasks.css',
  'css/today.css',
  'js/achievements.js',
  'js/achievementsview.js',
  'js/app.js',
  'js/audio.js',
  'js/bus.js',
  'js/calm.js',
  'js/changelog.js',
  'js/chipgroup.js',
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
  'js/ledger.js',
  'js/library.js',
  'js/modal.js',
  'js/notifications.js',
  'js/planner.js',
  'js/push-service.js',
  'js/profile.js',
  'js/progress.js',
  'js/qorqori.js',
  'js/reader.js',
  'js/rizolo.js',
  'js/roll.js',
  'js/settings.js',
  'js/sharecard.js',
  'js/state.js',
  'js/stats.js',
  'js/store.js',
  'js/tasks.js',
  'js/theme.js',
  'js/today.js',
  'js/utils.js',
  'js/version.js',
  'js/week.js',
  'assets/fonts/Estedad-Mad.woff2',
  'assets/fonts/Estedad[wght].woff2',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/daftarche-electron.png',
  'assets/icons/daftarche.ico',
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
    /* The shell of this build is already cached. That is a release which moved
       only the version marker: every other file is byte-identical, so the
       marker is re-read and nothing else is touched — no pointless download,
       and no window where a cache someone is reading from is short of files. */
    const held = new Set((await cache.keys()).map(r => new URL(r.url).pathname));
    if (SHELL.every(path => held.has(new URL(shellURL(path)).pathname))) {
      await cache.add(new Request(shellURL('js/version.js'), { cache: 'reload' })).catch(() => {});
      return;
    }
    /* A build this cache has not seen: individual adds so one missing file can
       never abort the whole install, and `reload` so a stale HTTP cache entry
       is not baked into the shell. */
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
  const target = projectURL(`index.html${extra}`);
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
    icon: projectURL(data.icon || 'assets/icons/icon-192.png'),
    badge: projectURL(data.badge || 'assets/icons/icon-192.png'),
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

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
  return res;
}

/* The app document, in every form a deployment asks for it: the directory the
   project is served from, and index.html inside it — either can carry the
   deep-link query a notification click adds. */
const APP_DOCS = new Set([
  new URL(shellURL('.')).pathname,
  new URL(shellURL('index.html')).pathname,
]);

async function cachedShell(request) {
  const cache = await caches.open(STATIC_CACHE);
  return (await cache.match(request)) || (await cache.match(shellURL('index.html')));
}

/* The app document, served from this release's own cache so the markup and the
   styles/modules loaded underneath it always belong to the same build. Nothing
   of this release cached yet (first controlled load, or a cache the browser
   evicted) is the one case that goes to the network; what comes back is kept,
   so the app still opens offline from then on. */
async function releaseDocument(request) {
  const cached = await cachedShell(request);
  if (cached) return cached;
  const res = await fetch(request).catch(() => null);
  if (res && res.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(shellURL('index.html'), res.clone());
  }
  return res || Response.error();
}

/* Everything else the document asks for, from that same release cache. A file
   this release does not hold is served live and deliberately not written into
   the cache: a release is only ever filled as a whole, by install. */
async function releaseAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  return fetch(request);
}

/* A navigation that is not the app document (an unexpected path): the network
   answers, and the cached document keeps the app reachable offline. */
async function networkThenShell(request) {
  const res = await fetch(request).catch(() => null);
  if (res) return res;
  return (await cachedShell(request)) || Response.error();
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
    event.respondWith(APP_DOCS.has(target.pathname) ? releaseDocument(request) : networkThenShell(request));
    return;
  }

  event.respondWith(releaseAsset(request));
});
