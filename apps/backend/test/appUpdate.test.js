import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { createAppUpdateRouter } from '../src/routes/appUpdateRoutes.js';

describe('App Update Router (/api/v1/app-update)', () => {
  it('returns current version info and updateAvailable=false when client is up to date', async () => {
    const app = express();
    app.use('/api/v1/app-update', createAppUpdateRouter({
      runtimeEnv: {
        LATEST_ANDROID_VERSION_NAME: '0.1.0',
        LATEST_ANDROID_VERSION_CODE: '1',
      },
    }));

    const response = await request(app)
      .get('/api/v1/app-update?currentVersionCode=1&currentVersionName=0.1.0')
      .expect(200);

    assert.equal(response.body.ok, true);
    assert.equal(response.body.data.platform, 'android');
    assert.equal(response.body.data.latestVersionName, '0.1.0');
    assert.equal(response.body.data.latestVersionCode, 1);
    assert.equal(response.body.data.updateAvailable, false);
    assert.match(response.body.data.downloadUrl, /app-update\/download/);
  });

  it('detects updateAvailable=true when client has older versionCode', async () => {
    const app = express();
    app.use('/api/v1/app-update', createAppUpdateRouter({
      runtimeEnv: {
        LATEST_ANDROID_VERSION_NAME: '0.1.1',
        LATEST_ANDROID_VERSION_CODE: '2',
      },
    }));

    const response = await request(app)
      .get('/api/v1/app-update?currentVersionCode=1&currentVersionName=0.1.0')
      .expect(200);

    assert.equal(response.body.ok, true);
    assert.equal(response.body.data.latestVersionName, '0.1.1');
    assert.equal(response.body.data.latestVersionCode, 2);
    assert.equal(response.body.data.updateAvailable, true);
  });

  it('downloads local APK file or redirects when requested', async () => {
    const app = express();
    app.use('/api/v1/app-update', createAppUpdateRouter({
      runtimeEnv: {
        ANDROID_APK_EXTERNAL_URL: 'https://example.com/balakavach-companion.apk',
      },
    }));

    const response = await request(app)
      .get('/api/v1/app-update/download');

    // Either streams existing APK (200) or redirects to external (302)
    assert.ok(response.status === 200 || response.status === 302);
    if (response.status === 200) {
      assert.match(response.headers['content-disposition'], /balakavach-companion\.apk/);
    } else {
      assert.match(response.headers.location, /balakavach-companion\.apk/);
    }
  });
});
