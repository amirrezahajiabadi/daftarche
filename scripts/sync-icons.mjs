import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const REFERENCES = ['index.html', 'manifest.webmanifest'];

export function iconURL(path, bytes = readFileSync(new URL(path, ROOT))) {
  const fingerprint = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  return `${path}?asset=${fingerprint}`;
}

export function syncIconReferences(content) {
  return content.replace(/assets\/icons\/[\w.-]+(?:\?asset=[a-f\d]+)?/g, reference => {
    return iconURL(reference.split('?')[0]);
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  let stale = false;
  for (const path of REFERENCES) {
    const target = new URL(path, ROOT);
    const content = readFileSync(target, 'utf8');
    const updated = syncIconReferences(content);
    if (content === updated) continue;
    stale = true;
    if (process.argv.includes('--check')) {
      console.error(`Stale icon URLs in ${path}; run node scripts/sync-icons.mjs`);
    } else {
      writeFileSync(target, updated, 'utf8');
      console.log(`Updated icon URLs in ${path}`);
    }
  }
  if (stale && process.argv.includes('--check')) process.exitCode = 1;
}
