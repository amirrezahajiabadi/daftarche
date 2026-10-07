import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/pwa.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/, '').replace('export function initPWA', 'function initPWA');

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  emit(type) { for (const listener of this.listeners.get(type) || []) listener(); }
}

class Worker extends Target {
  constructor(state = 'installed') { super(); this.state = state; this.messages = []; }
  postMessage(message) { this.messages.push(message); }
}

function setup({ firstInstall = false, busy = false, installing = null, readyState = 'complete', failRegister = false } = {}) {
  const worker = new Worker();
  const previous = new Worker('activated');
  const registration = new Target();
  Object.assign(registration, { waiting: firstInstall ? null : worker, installing, active: previous });
  let checks = 0;
  registration.update = async () => { checks++; };
  const sw = new Target();
  sw.controller = firstInstall ? null : previous;
  let attempts = 0;
  sw.register = async (url, options) => {
    attempts++;
    assert.equal(url.href, 'https://example.test/app/sw.js');
    assert.equal(options.updateViaCache, 'none');
    if (failRegister) { failRegister = false; throw new Error('offline'); }
    return registration;
  };
  sw.ready = Promise.resolve(registration);
  const message = { textContent: '' };
  const button = new Target();
  button.disabled = false;
  const toast = { hidden: true, classList: { add() {}, remove() {} }, querySelector: () => message };
  const otherToast = { hidden: true };
  const document = new Target();
  Object.assign(document, {
    readyState, hidden: false, baseURI: 'https://example.test/app/',
    querySelector: selector => selector === '#updateToast' ? toast : button,
    querySelectorAll: () => [toast, otherToast],
  });
  const window = new Target();
  let reloads = 0;
  let now = 100000;
  let timerId = 0;
  const timers = new Map();
  const context = vm.createContext({
    navigator: { serviceWorker: sw, onLine: true }, document,
    location: { reload() { reloads++; } }, URL, WeakSet,
    isBusy: () => busy, Date: { now: () => now },
    requestAnimationFrame: fn => fn(), addEventListener: window.addEventListener.bind(window),
    setInterval: (fn, delay) => { timers.set(++timerId, { fn, delay, interval: true }); return timerId; },
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearInterval: id => timers.delete(id), clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(source + '\ninitPWA();', context);
  return {
    worker, previous, registration, sw, document, window, button, toast, message, otherToast,
    get reloads() { return reloads; }, get checks() { return checks; }, get attempts() { return attempts; },
    idle() { busy = false; }, advance(ms) { now += ms; },
    fireTimers(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay !== delay) continue;
        if (!timer.interval) timers.delete(id);
        timer.fn();
      }
    },
  };
}

async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

test('a waiting update activates on click and reloads once after the controller changes', async () => {
  const app = setup();
  await flush();
  assert.equal(app.toast.hidden, false);
  app.button.emit('click');
  app.button.emit('click');
  assert.deepEqual(app.worker.messages, ['SKIP_WAITING']);
  assert.equal(app.button.disabled, true);
  app.fireTimers(3000);
  assert.equal(app.reloads, 0);
  app.sw.controller = app.worker;
  app.sw.emit('controllerchange');
  app.sw.emit('controllerchange');
  assert.equal(app.reloads, 1);
  assert.equal(app.toast.hidden, true);
});

test('a stalled activation offers a retry without reloading the old build', async () => {
  const app = setup();
  await flush();
  app.button.emit('click');
  app.fireTimers(15000);
  assert.equal(app.reloads, 0);
  assert.equal(app.button.disabled, false);
  assert.equal(app.toast.hidden, false);
  app.button.emit('click');
  assert.deepEqual(app.worker.messages, ['SKIP_WAITING', 'SKIP_WAITING']);
});

test('first installation does not interrupt the page, but a later update reloads', async () => {
  const app = setup({ firstInstall: true });
  await flush();
  app.sw.controller = app.previous;
  app.sw.emit('controllerchange');
  assert.equal(app.reloads, 0);
  app.registration.waiting = app.worker;
  app.registration.emit('updatefound');
  assert.equal(app.toast.hidden, false);
  app.sw.controller = app.worker;
  app.sw.emit('controllerchange');
  assert.equal(app.reloads, 1);
});

test('an install already in progress when registration resolves is observed', async () => {
  const installing = new Worker('installing');
  const app = setup({ firstInstall: true, installing });
  await flush();
  app.sw.controller = app.previous;
  app.registration.waiting = installing;
  installing.state = 'installed';
  installing.emit('statechange');
  assert.equal(app.toast.hidden, false);
});

test('the prompt waits for an idle moment and does not activate when hidden', async () => {
  const app = setup({ busy: true });
  await flush();
  assert.equal(app.toast.hidden, true);
  app.document.hidden = true;
  app.document.emit('visibilitychange');
  app.idle();
  app.fireTimers(2000);
  assert.equal(app.toast.hidden, true);
  assert.deepEqual(app.worker.messages, []);
  app.document.hidden = false;
  app.document.emit('visibilitychange');
  assert.equal(app.toast.hidden, false);
});

test('click uses the latest waiting worker and ignores a discarded worker', async () => {
  const app = setup();
  await flush();
  const replacement = new Worker();
  app.registration.waiting = replacement;
  app.button.emit('click');
  assert.deepEqual(app.worker.messages, []);
  assert.deepEqual(replacement.messages, ['SKIP_WAITING']);
  app.fireTimers(15000);
  replacement.state = 'redundant';
  app.registration.waiting = null;
  replacement.emit('statechange');
  assert.equal(app.toast.hidden, true);
  app.button.emit('click');
  assert.equal(app.reloads, 0);
});

test('resume, restored pages, online and periodic checks detect updates without flooding requests', async () => {
  const app = setup();
  await flush();
  assert.equal(app.checks, 1);
  app.document.emit('visibilitychange');
  app.window.emit('pageshow');
  await flush();
  assert.equal(app.checks, 1);
  app.advance(60000);
  app.document.emit('visibilitychange');
  await flush();
  assert.equal(app.checks, 2);
  app.window.emit('online');
  await flush();
  assert.equal(app.checks, 3);
  app.advance(1800000);
  app.fireTimers(1800000);
  await flush();
  assert.equal(app.checks, 4);
});

test('registration waits for load and retries on connection recovery', async () => {
  const app = setup({ readyState: 'loading', failRegister: true });
  await flush();
  assert.equal(app.attempts, 0);
  app.window.emit('load');
  await flush();
  assert.equal(app.attempts, 1);
  app.window.emit('online');
  await flush();
  assert.equal(app.attempts, 2);
  assert.equal(app.toast.hidden, false);
});
