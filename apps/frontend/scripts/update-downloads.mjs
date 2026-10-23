#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find repo root or sync script (3 levels up from apps/frontend/scripts)
const rootSyncScript = path.resolve(__dirname, '..', '..', '..', 'scripts', 'sync-downloadables.mjs');

if (fs.existsSync(rootSyncScript)) {
  const { syncAll } = await import(`file://${rootSyncScript.replace(/\\/g, '/')}`);
  syncAll();
} else {
  console.log('[update-downloads] Running in standalone frontend mode, checking public download assets...');
  const publicDir = path.resolve(__dirname, '..', 'public');
  const genDir = path.resolve(__dirname, '..', 'src', 'generated');
  fs.mkdirSync(genDir, { recursive: true });
  const metaPath = path.join(genDir, 'downloadMeta.json');
  if (!fs.existsSync(metaPath)) {
    const apkPath = path.join(publicDir, 'balakavach-companion.apk');
    const zipPath = path.join(publicDir, 'balakavach-chrome-extension.zip');
    const apkStat = fs.existsSync(apkPath) ? fs.statSync(apkPath) : null;
    const zipStat = fs.existsSync(zipPath) ? fs.statSync(zipPath) : null;
    const meta = {
      updatedAt: new Date().toISOString(),
      android: {
        version: '0.1.1',
        versionCode: 2,
        versionName: 'v0.1.1',
        fileName: 'balakavach-companion.apk',
        downloadUrl: '/balakavach-companion.apk',
        sizeBytes: apkStat ? apkStat.size : 8378634,
        sizeFormatted: apkStat ? `${(apkStat.size / (1024 * 1024)).toFixed(1)} MB` : '8.0 MB',
        versionHash: apkStat ? `${apkStat.size}` : 'latest',
      },
      extension: {
        version: '0.2.2',
        versionName: 'v0.2.2',
        fileName: 'balakavach-chrome-extension.zip',
        downloadUrl: '/balakavach-chrome-extension.zip',
        sizeBytes: zipStat ? zipStat.size : 260425,
        sizeFormatted: zipStat ? `${Math.round(zipStat.size / 1024)} KB` : '254 KB',
        versionHash: zipStat ? `${zipStat.size}` : 'latest',
      },
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  }
}
