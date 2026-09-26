/* ═══ Release identity ═══
   The single place a release number is written down. The page loads it
   (index.html, just before the module entry) and the service worker loads it
   too (importScripts), so the offline build, the release label in settings and
   the changelog engine all read the same value instead of keeping a copy each.

   It is a classic script on purpose: a document and a worker can both load it
   as-is, with no build step, no bundler and no module-scope tricks.

     RELEASE — the version people see. Bump it when a release ships, and append
               the matching entry to CHANGELOG in js/changelog.js.
     BUILD   — the name of the offline build; the service worker keys its caches
               on it. Bump it on every deploy that changes any file in the
               worker's SHELL list — index.html and this file included. That
               bump is what makes an installed client install the new worker,
               fill the next cache and drop the previous one, so a release
               reaches people as one whole build rather than a cache that is
               half old and half new.

   Both values live here and nowhere else. */
self.DAFTARCHE_RELEASE = '2.6.0';
self.DAFTARCHE_BUILD = 'v46';
