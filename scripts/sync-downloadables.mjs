#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const EXTENSION_DIR = path.join(REPO_ROOT, 'apps', 'extension');
const ANDROID_DIR = path.join(REPO_ROOT, 'apps', 'android');
const FRONTEND_DIR = path.join(REPO_ROOT, 'apps', 'frontend');
const FRONTEND_PUBLIC_DIR = path.join(FRONTEND_DIR, 'public');
const GENERATED_DIR = path.join(FRONTEND_DIR, 'src', 'generated');

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createZipBuffer(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const filenameBuf = Buffer.from(file.name.replace(/\\/g, '/'), 'utf8');
    const content = file.content ?? fs.readFileSync(file.fullPath);
    const uncompressedSize = content.length;
    const crc = zlib.crc32(content);
    const compressed = zlib.deflateRawSync(content);
    const compressedSize = compressed.length;

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30 + filenameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4);         // version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // general purpose bit flag (UTF-8 filename)
    localHeader.writeUInt16LE(8, 8);          // compression method (deflate)
    localHeader.writeUInt16LE(0, 10);         // file last mod time
    localHeader.writeUInt16LE(0, 12);         // file last mod date
    localHeader.writeUInt32LE(crc, 14);       // crc-32
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(filenameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);         // extra field length
    filenameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, compressed);

    // Central directory header (46 bytes + name)
    const centralHeader = Buffer.alloc(46 + filenameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central directory signature
    centralHeader.writeUInt16LE(20, 4);          // version made by
    centralHeader.writeUInt16LE(20, 6);          // version needed
    centralHeader.writeUInt16LE(0x0800, 8);      // flags
    centralHeader.writeUInt16LE(8, 10);          // compression
    centralHeader.writeUInt16LE(0, 12);          // mod time
    centralHeader.writeUInt16LE(0, 14);          // mod date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(filenameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);          // extra field length
    centralHeader.writeUInt16LE(0, 32);          // comment length
    centralHeader.writeUInt16LE(0, 34);          // disk number start
    centralHeader.writeUInt16LE(0, 36);          // internal file attributes
    centralHeader.writeUInt32LE(0, 38);          // external file attributes
    centralHeader.writeUInt32LE(offset, 42);     // relative offset of local header
    filenameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) centralDirSize += ch.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4);          // disk number
  eocd.writeUInt16LE(0, 6);          // disk with central directory
  eocd.writeUInt16LE(files.length, 8);  // entries on this disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);         // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

function collectExtensionFiles(dir, baseDir = dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  const ignored = new Set([
    'node_modules',
    'test',
    '.git',
    '.github',
    'package.json',
    'package-lock.json',
    'README.md',
    '.DS_Store',
    'Thumbs.db',
  ]);

  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    if (entry.name.endsWith('.test.js')) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(collectExtensionFiles(fullPath, baseDir));
    } else {
      const relPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
      files.push({ name: relPath, fullPath });
    }
  }

  return files;
}

export function packageExtension() {
  if (!fs.existsSync(EXTENSION_DIR)) {
    console.warn('[sync-downloads] Extension directory not found at', EXTENSION_DIR);
    return null;
  }

  const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
  let version = '0.2.1';
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.version) version = manifest.version;
    } catch (e) {
      console.warn('[sync-downloads] Failed to parse extension manifest:', e.message);
    }
  }

  const files = collectExtensionFiles(EXTENSION_DIR);
  if (files.length === 0) {
    console.warn('[sync-downloads] No extension files collected');
    return null;
  }

  const zipBuffer = createZipBuffer(files);
  fs.mkdirSync(FRONTEND_PUBLIC_DIR, { recursive: true });

  const zipOutPath = path.join(FRONTEND_PUBLIC_DIR, 'balakavach-chrome-extension.zip');
  fs.writeFileSync(zipOutPath, zipBuffer);

  const stats = fs.statSync(zipOutPath);
  return {
    version,
    versionName: `v${version}`,
    fileName: 'balakavach-chrome-extension.zip',
    downloadUrl: '/balakavach-chrome-extension.zip',
    sizeBytes: stats.size,
    sizeFormatted: formatBytes(stats.size),
    updatedAt: stats.mtime.toISOString(),
    versionHash: `${stats.size}-${Math.floor(stats.mtimeMs)}`,
  };
}

export function syncAndroidApk(options = { buildApk: false }) {
  const destinationApk = path.join(FRONTEND_PUBLIC_DIR, 'balakavach-companion.apk');
  fs.mkdirSync(FRONTEND_PUBLIC_DIR, { recursive: true });

  let version = '0.1.0';
  let versionCode = 1;
  const gradlePath = path.join(ANDROID_DIR, 'app', 'build.gradle.kts');
  if (fs.existsSync(gradlePath)) {
    try {
      const gradleText = fs.readFileSync(gradlePath, 'utf8');
      const match = gradleText.match(/versionName\s*=\s*"([^"]+)"/);
      if (match && match[1]) version = match[1];
      const codeMatch = gradleText.match(/versionCode\s*=\s*(\d+)/);
      if (codeMatch && codeMatch[1]) versionCode = parseInt(codeMatch[1], 10);
    } catch {
      // Keep default
    }
  }

  const candidateOutputs = [
    path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
    path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk'),
  ];

  if (options.buildApk) {
    console.log('[sync-downloads] Building Android Debug APK with Gradle...');
    const javaHomeCandidates = [
      process.env.JAVA_HOME,
      'C:\\Program Files\\Android\\Android Studio\\jbr',
      'C:\\Program Files\\Java\\jdk-17',
    ].filter(Boolean);

    let detectedJavaHome = javaHomeCandidates.find((dir) => fs.existsSync(dir));
    const isWindows = process.platform === 'win32';
    const gradlewCmd = isWindows ? 'gradlew.bat' : './gradlew';

    let env = { ...process.env };
    if (detectedJavaHome) {
      env.JAVA_HOME = detectedJavaHome;
      env.PATH = `${path.join(detectedJavaHome, 'bin')}${path.delimiter}${env.PATH}`;
    }

    try {
      execSync(`${gradlewCmd} assembleDebug`, {
        cwd: ANDROID_DIR,
        env,
        stdio: 'inherit',
      });
      console.log('[sync-downloads] Android APK build completed.');
    } catch (e) {
      console.warn('[sync-downloads] Gradle build failed or skipped:', e.message);
    }
  }

  // Find newest candidate APK if present
  let sourceApk = null;
  for (const cand of candidateOutputs) {
    if (fs.existsSync(cand)) {
      sourceApk = cand;
      break;
    }
  }

  if (sourceApk) {
    const srcStat = fs.statSync(sourceApk);
    let shouldCopy = true;
    if (fs.existsSync(destinationApk)) {
      const destStat = fs.statSync(destinationApk);
      if (destStat.size === srcStat.size && Math.abs(destStat.mtimeMs - srcStat.mtimeMs) < 1000) {
        shouldCopy = false;
      }
    }
    if (shouldCopy) {
      fs.copyFileSync(sourceApk, destinationApk);
      console.log(`[sync-downloads] Synced updated APK (${formatBytes(srcStat.size)}) to public directory.`);
    }
  }

  if (!fs.existsSync(destinationApk)) {
    console.warn('[sync-downloads] balakavach-companion.apk not found in public directory.');
    return {
      version,
      versionCode,
      versionName: `v${version}`,
      fileName: 'balakavach-companion.apk',
      downloadUrl: '/balakavach-companion.apk',
      sizeBytes: 9424587,
      sizeFormatted: '9.0 MB',
      updatedAt: new Date().toISOString(),
      versionHash: 'latest',
    };
  }

  const finalStat = fs.statSync(destinationApk);
  return {
    version,
    versionCode,
    versionName: `v${version}`,
    fileName: 'balakavach-companion.apk',
    downloadUrl: '/balakavach-companion.apk',
    sizeBytes: finalStat.size,
    sizeFormatted: formatBytes(finalStat.size),
    updatedAt: finalStat.mtime.toISOString(),
    versionHash: `${finalStat.size}-${Math.floor(finalStat.mtimeMs)}`,
  };
}

export function syncAll(options = {}) {
  console.log('[sync-downloads] Synchronizing downloadable assets for website...');
  const extMeta = packageExtension();
  const androidMeta = syncAndroidApk(options);

  const meta = {
    updatedAt: new Date().toISOString(),
    android: androidMeta,
    extension: extMeta,
  };

  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const metaOutPath = path.join(GENERATED_DIR, 'downloadMeta.json');
  fs.writeFileSync(metaOutPath, JSON.stringify(meta, null, 2), 'utf8');

  // Also write to backend generated directory for direct server-side version detection
  const backendGenDir = path.join(REPO_ROOT, 'apps', 'backend', 'src', 'generated');
  fs.mkdirSync(backendGenDir, { recursive: true });
  fs.writeFileSync(path.join(backendGenDir, 'downloadMeta.json'), JSON.stringify(meta, null, 2), 'utf8');

  console.log('[sync-downloads] Download metadata generated:');
  console.log(`  • Android Companion: ${androidMeta.versionName} (${androidMeta.sizeFormatted})`);
  if (extMeta) {
    console.log(`  • Chrome Extension:  ${extMeta.versionName} (${extMeta.sizeFormatted})`);
  }
  return meta;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const buildApk = process.argv.includes('--build-apk');
  syncAll({ buildApk });
}
