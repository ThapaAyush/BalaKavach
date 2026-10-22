import test from 'node:test';
import assert from 'node:assert/strict';

function evaluateUpdateStatus({ clientVersionCode, clientVersionName, serverVersionCode, serverVersionName }) {
  if (clientVersionCode < serverVersionCode) return true;
  if (clientVersionName !== serverVersionName) return true;
  return false;
}

function resolveAbsoluteDownloadUrl(rawUrl, apiBaseUrl) {
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    return rawUrl;
  }
  const parsed = new URL(apiBaseUrl);
  const path = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  return `${parsed.origin}${path}`;
}

test('Android contract: detects update available when server has newer versionCode', () => {
  const isAvailable = evaluateUpdateStatus({
    clientVersionCode: 1,
    clientVersionName: '0.1.0',
    serverVersionCode: 2,
    serverVersionName: '0.1.1',
  });
  assert.equal(isAvailable, true);
});

test('Android contract: detects up-to-date when versions match', () => {
  const isAvailable = evaluateUpdateStatus({
    clientVersionCode: 2,
    clientVersionName: '0.1.1',
    serverVersionCode: 2,
    serverVersionName: '0.1.1',
  });
  assert.equal(isAvailable, false);
});

test('Android contract: resolves relative download URLs against backend origin', () => {
  const resolved = resolveAbsoluteDownloadUrl(
    '/api/v1/app-update/download',
    'https://balakavach-be.onrender.com/api/v1'
  );
  assert.equal(resolved, 'https://balakavach-be.onrender.com/api/v1/app-update/download');
});

test('Android contract: preserves absolute download URLs', () => {
  const resolved = resolveAbsoluteDownloadUrl(
    'https://github.com/ThapaAyush/KidsGuard/releases/download/v0.1.1/balakavach-companion.apk',
    'https://balakavach-be.onrender.com/api/v1'
  );
  assert.equal(
    resolved,
    'https://github.com/ThapaAyush/KidsGuard/releases/download/v0.1.1/balakavach-companion.apk'
  );
});
