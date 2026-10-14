import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('declares only the permissions required for local rules and storage', async () => {
  const manifestUrl = new URL('../manifest.json', import.meta.url);
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['alarms', 'declarativeNetRequest', 'storage']);
  assert.deepEqual(manifest.host_permissions, [
    'http://localhost:5000/*',
    'http://127.0.0.1:5000/*'
  ]);
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
  assert.equal(manifest.host_permissions.some((p) => p.includes('*://*/*')), false);
  assert.deepEqual(manifest.background, {
    service_worker: 'src/service-worker.js',
    type: 'module'
  });
  assert.equal(Number(manifest.minimum_chrome_version) >= 101, true);
});
