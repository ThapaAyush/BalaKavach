#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find repo root or sync script (3 levels up from apps/frontend/scripts)
const rootSyncScript = path.resolve(__dirname, '..', '..', '..', 'scripts', 'sync-downloadables.mjs');

if (fs.existsSync(rootSyncScript)) {
  const { syncAll } = await import(pathToFileURL(rootSyncScript).href);
  syncAll();
} else {
  console.log('[update-downloads] Running in standalone frontend mode, checking public download assets...');
  const publicDir = path.resolve(__dirname, '..', 'public');
  const genDir = path.resolve(__dirname, '..', 'src', 'generated');
  fs.mkdirSync(genDir, { recursive: true });
  const metaPath = path.join(genDir, 'downloadMeta.json');
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
      releaseNotes: 'Real-time screen-time tracking, app open counts, bedtime schedule enforcement, and zero-battery VPN-free architecture.',
      features: [
        'Background Screen Time Measurement',
        'Daily Usage & App Launch Limits',
        'Quiet Bedtime Hours Enforcement',
        'Zero VPN Battery-Friendly Engine',
      ],
    },
    extension: {
      version: '0.3.0',
      versionName: 'v0.3.0',
      fileName: 'balakavach-chrome-extension.zip',
      downloadUrl: '/balakavach-chrome-extension.zip',
      sizeBytes: zipStat ? zipStat.size : 264153,
      sizeFormatted: zipStat ? `${Math.round(zipStat.size / 1024)} KB` : '258 KB',
      versionHash: zipStat ? `${zipStat.size}` : 'latest',
      releaseNotes: 'Automatic 18+ adult content removal, spontaneous tab purge on connection, and live Chrome browsing history tracking.',
      features: [
        'Strict 18+ Adult Content Filter',
        'Spontaneous Open Tab Purge on Connect',
        'Live Chrome Browsing History Stream',
        'Parent Dashboard Activity Stream',
      ],
    },
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}
