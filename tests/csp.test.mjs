/* The CSP pins the inline theme script by hash. If someone edits that script
   (or its line endings change) without updating the hash, the browser blocks it
   and every dark-theme reader gets a white flash — so this is checked here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('index.html carries a CSP meta, and it is the first thing after <meta charset>', () => {
  const head = html.slice(html.indexOf('<head>'));
  const csp = head.indexOf('http-equiv="Content-Security-Policy"');
  assert.ok(csp > 0, 'CSP meta missing');
  assert.ok(head.indexOf('<script') > csp, 'CSP must come before any script');
});

test('the inline theme script hash matches the CSP', () => {
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(inline.length, 1, 'exactly one inline script is allowed');
  const hash = 'sha256-' + createHash('sha256').update(inline[0][1], 'utf8').digest('base64');
  assert.ok(html.includes(`'${hash}'`), 'CSP hash is stale: expected ' + hash);
});

test('the policy does not weaken script execution', () => {
  const m = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  const policy = Object.fromEntries(m[1].split(';').map(d => d.trim()).filter(Boolean).map(d => {
    const [k, ...v] = d.split(/\s+/); return [k, v];
  }));
  assert.ok(!policy['script-src'].includes("'unsafe-inline'"));
  assert.ok(!policy['script-src'].includes("'unsafe-eval'"));
  assert.deepEqual(policy['object-src'], ["'none'"]);
  assert.deepEqual(policy['base-uri'], ["'self'"]);
  assert.ok(!html.match(/ on[a-z]+="/), 'inline event handlers would be blocked by the CSP');
});
