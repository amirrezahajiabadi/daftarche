import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const version = readFileSync(new URL('../js/version.js', import.meta.url), 'utf8');
const base = 'https://example.test/app/';
const urlOf = request => typeof request === 'string' ? request : request.url;

function setup({ missing = '', versionSource = version, pdfFetch = null, importFails = false } = {}) {
  const handlers = new Map();
  const stored = new Map();
  const requests = [];
  const deleted = [];
  let claims = 0;
  let skips = 0;
  const fetch = async (request, options) => {
    const url = urlOf(request);
    requests.push({ url, cache: request.cache });
    if (url.startsWith('https://cdn.jsdelivr.net/')) {
      if (pdfFetch) return pdfFetch(request, options);
      return new Response('pdf module');
    }
    if (url.endsWith(missing) && missing) return new Response('missing', { status: 404 });
    return new Response(url.endsWith('js/version.js') ? versionSource : 'shell: ' + url);
  };
  class Cache {
    constructor() { this.entries = new Map(); }
    async match(request, { ignoreSearch = false } = {}) {
      let key = urlOf(request);
      if (ignoreSearch) key = [...this.entries.keys()].find(url => url.split('?')[0] === key.split('?')[0]);
      return this.entries.get(key)?.clone();
    }
    async put(request, response) { this.entries.set(urlOf(request), response.clone()); }
    async keys() { return [...this.entries.keys()].map(url => new Request(url)); }
    async addAll(requests) {
      const responses = await Promise.all(requests.map(async request => {
        const response = await fetch(request);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response;
      }));
      await Promise.all(requests.map((request, index) => this.put(request, responses[index])));
    }
  }
  const caches = {
    async open(name) { if (!stored.has(name)) stored.set(name, new Cache()); return stored.get(name); },
    async keys() { return [...stored.keys()]; },
    async delete(name) { deleted.push(name); return stored.delete(name); },
  };
  const self = {
    location: base + 'sw.js', addEventListener: (type, listener) => handlers.set(type, listener),
    clients: { async claim() { claims++; } }, async skipWaiting() { skips++; },
  };
  const context = vm.createContext({
    self, caches, fetch, URL, Request, Response, AbortController, setTimeout, clearTimeout,
    importScripts() {
      if (importFails) throw new Error('Version unavailable');
      vm.runInContext(version, context);
    },
  });
  vm.runInContext(source, context);
  const build = self.DAFTARCHE_BUILD;
  return {
    self, caches, stored, requests, deleted, build,
    get claims() { return claims; }, get skips() { return skips; },
    shell: Array.from(vm.runInContext('SHELL', context)),
    async dispatch(type, data = {}) {
      const pending = [];
      let response;
      handlers.get(type)({ ...data, waitUntil: promise => pending.push(promise), respondWith: promise => { response = promise; } });
      await Promise.all(pending);
      return response;
    },
    staticName: `daftarche-static-${build}`, runtimeName: `daftarche-runtime-${build}`,
  };
}

test('shell lists all boot files, including the update module, under a subpath', async () => {
  const sw = setup();
  for (const path of sw.shell) assert.ok(existsSync(new URL('../' + path, import.meta.url)), 'Missing ' + path);
  for (const directory of ['js', 'css']) {
    for (const file of readdirSync(new URL('../' + directory + '/', import.meta.url))) {
      assert.ok(sw.shell.includes(directory + '/' + file), 'Uncached ' + file);
    }
  }
  await sw.dispatch('install');
  const cache = await sw.caches.open(sw.staticName);
  assert.equal((await cache.keys()).length, sw.shell.length);
  assert.ok(sw.requests.every(request => request.cache === 'reload' && request.url.startsWith(base)));
});

test('a missing shell file rejects installation and preserves the active cache', async () => {
  const sw = setup({ missing: 'js/app.js' });
  const previous = await sw.caches.open('daftarche-static-previous');
  await previous.put(base + 'index.html', new Response('old page'));
  await assert.rejects(sw.dispatch('install'), /HTTP 404/);
  assert.equal(await (await previous.match(base + 'index.html')).text(), 'old page');
  assert.equal((await (await sw.caches.open(sw.staticName)).keys()).length, 0);
  assert.equal(sw.claims, 0);
  assert.equal(sw.skips, 0);
  assert.deepEqual(sw.deleted, []);
});

test('installation fails when the build marker changes during download', async () => {
  const sw = setup({ versionSource: version.replace(/DAFTARCHE_BUILD = '[^']+'/, "DAFTARCHE_BUILD = 'changed'") });
  await assert.rejects(sw.dispatch('install'), /Build changed during install/);
  assert.equal(sw.skips, 0);
});

test('a missing version script cannot create an unknown build', () => {
  assert.throws(() => setup({ importFails: true }), /Version unavailable/);
});

test('activation takes control without waiting for the PDF network and preserves cached reader files', async () => {
  const sw = setup({ pdfFetch: () => new Promise(() => {}) });
  const pdf = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
  const cmap = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/cmaps/test.bcmap';
  const previous = await sw.caches.open('daftarche-runtime-previous');
  await previous.put(pdf, new Response('cached module'));
  await previous.put(cmap, new Response('cached cmap'));
  await sw.caches.open('daftarche-static-previous');
  await sw.caches.open(sw.staticName);
  await sw.caches.open('unrelated-cache');
  await sw.dispatch('activate');
  assert.equal(sw.claims, 1);
  assert.equal(sw.requests.length, 0);
  const current = await sw.caches.open(sw.runtimeName);
  assert.equal(await (await current.match(pdf)).text(), 'cached module');
  assert.equal(await (await current.match(cmap)).text(), 'cached cmap');
  assert.ok(sw.stored.has('unrelated-cache'));
  assert.ok(sw.stored.has(sw.staticName));
  assert.ok(!sw.stored.has('daftarche-static-previous'));
});

test('activation messages keep skipWaiting alive for the message event', async () => {
  const sw = setup();
  await sw.dispatch('message', { data: 'SKIP_WAITING' });
  assert.equal(sw.skips, 1);
});

test('PDF warming is separate, uses cached files and tolerates a failed CDN', async () => {
  const sw = setup({ pdfFetch: async () => { throw new Error('offline'); } });
  await sw.dispatch('install');
  await sw.dispatch('activate');
  await sw.dispatch('message', { data: 'WARM_PDF_CACHE' });
  assert.equal(sw.claims, 1);
  assert.equal(sw.requests.filter(request => request.url.startsWith('https://cdn.jsdelivr.net/')).length, 2);
  assert.ok(sw.stored.has(sw.staticName));
});

test('navigation, deep links and queried icons stay in the same offline build', async () => {
  const sw = setup();
  await sw.dispatch('install');
  await sw.dispatch('activate');
  const fetchCount = sw.requests.length;
  const page = await sw.dispatch('fetch', { request: {
    url: base + '?task=123', method: 'GET', mode: 'navigate', headers: new Headers(),
  } });
  assert.equal(await page.text(), 'shell: ' + base + 'index.html');
  const app = await sw.dispatch('fetch', { request: new Request(base + 'js/pwa.js') });
  assert.equal(await app.text(), 'shell: ' + base + 'js/pwa.js');
  const icon = await sw.dispatch('fetch', { request: new Request(base + 'assets/icons/icon-192.png?asset=test') });
  assert.equal(await icon.text(), 'shell: ' + base + 'assets/icons/icon-192.png');
  assert.equal(sw.requests.length, fetchCount);
});
