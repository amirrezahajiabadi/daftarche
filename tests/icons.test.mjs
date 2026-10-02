import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { iconURL, syncIconReferences } from '../scripts/sync-icons.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('web and installed icon URLs track the image contents', () => {
  for (const path of ['index.html', 'manifest.webmanifest']) {
    const content = read(path);
    assert.equal(content, syncIconReferences(content), `Run node scripts/sync-icons.mjs for ${path}`);
  }
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.id, './');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.deepEqual(manifest.icons.map(icon => [icon.sizes, icon.purpose]), [
    ['192x192', 'any'], ['512x512', 'any'], ['192x192', 'maskable'], ['512x512', 'maskable'],
  ]);
  assert.match(read('index.html'), /rel="manifest" href="manifest.webmanifest"/);
});

test('only a changed image changes its URL and synchronization is idempotent', () => {
  const path = 'assets/icons/icon-192.png';
  assert.equal(iconURL(path, 'same'), iconURL(path, 'same'));
  assert.notEqual(iconURL(path, 'old'), iconURL(path, 'new'));
  const content = `href="${path}" href="${path}?asset=0000"`;
  const updated = syncIconReferences(content);
  assert.equal(updated, `href="${iconURL(path)}" href="${iconURL(path)}"`);
  assert.equal(syncIconReferences(updated), updated);
});

function worker(base = 'https://example.test/daftarche/') {
  const handlers = new Map();
  const stores = new Map();
  const network = [];
  const self = {
    location: new URL('sw.js', base),
    DAFTARCHE_BUILD: 'test-current',
    addEventListener: (type, handler) => handlers.set(type, handler),
    clients: { claim: async () => {} },
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(request, options = {}) {
          const target = new URL(typeof request === 'string' ? request : request.url);
          for (const [url, response] of entries) {
            const held = new URL(url);
            if (options.ignoreSearch) { held.search = ''; target.search = ''; }
            if (held.href === target.href) return response.clone();
          }
        },
        async keys() { return [...entries.keys()].map(url => new Request(url)); },
        async add(request) { entries.set(request.url, new Response(`fresh:${request.url}`)); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  runInNewContext(read('sw.js'), {
    self, caches, URL, Request, Response, importScripts: () => {},
    fetch: async request => {
      network.push(request.url);
      return new Response('network');
    },
  });
  return {
    stores, network,
    async lifecycle(type) {
      let pending;
      handlers.get(type)({ waitUntil: promise => { pending = promise; } });
      await pending;
    },
    async asset(path) {
      let pending;
      handlers.get('fetch')({
        request: new Request(new URL(path, base)),
        respondWith: promise => { pending = promise; },
      });
      return pending;
    },
  };
}

for (const base of ['https://example.test/', 'https://example.test/daftarche/']) {
  test(`updated icons work offline in the current build under ${base}`, async () => {
    const app = worker(base);
    app.stores.set('daftarche-static-old', new Map([
      [new URL('assets/icons/icon-192.png', base).href, new Response('old logo')],
    ]));
    await app.lifecycle('install');
    await app.lifecycle('activate');
    assert.ok(!app.stores.has('daftarche-static-old'));
    const paths = [
      ...JSON.parse(read('manifest.webmanifest')).icons.map(icon => icon.src),
      ...[...read('index.html').matchAll(/href="(assets\/icons\/[^"\s]+)"/g)].map(match => match[1]),
    ];
    for (const path of paths) {
      const response = await app.asset(path);
      assert.equal(await response.text(), `fresh:${new URL(path.split('?')[0], base).href}`);
    }
    assert.equal(app.network.length, 0);
    assert.equal(await (await app.asset('assets/icons/icon-192.png')).text(),
      `fresh:${new URL('assets/icons/icon-192.png', base).href}`);
    assert.equal(await (await app.asset('js/app.js?different=1')).text(), 'network');
    assert.equal(await (await app.asset('assets/icons/not-in-shell.png?asset=123')).text(), 'network');
    assert.equal(app.network.length, 2);
  });
}
