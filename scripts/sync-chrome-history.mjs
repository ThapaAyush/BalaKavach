#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve('apps/backend/.env') });

const ADULT_KEYWORDS = [
  'porn', 'xxx', 'sex', 'nude', 'nsfw', 'erotic', 'hentai',
  'xvideos', 'pornhub', 'xnxx', 'redtube', 'youporn', 'stripchat',
  'chaturbate', 'onlyfans', 'camgirls', 'cam4', 'livejasmin', 'spankbang'
];

function extractDomain(urlStr) {
  try {
    const parsed = new URL(urlStr);
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith('www.')) hostname = hostname.slice(4);
    return hostname;
  } catch {
    return 'unknown';
  }
}

function isAdultContentUrl(urlStr, domain) {
  const d = (domain || '').toLowerCase();
  for (const kw of ADULT_KEYWORDS) {
    if (d.includes(kw)) return true;
  }
  try {
    const parsed = new URL(urlStr);
    const search = parsed.search.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    for (const kw of ADULT_KEYWORDS) {
      if (search.includes(kw) || pathname.includes(`/${kw}/`)) return true;
    }
  } catch {}
  return false;
}

function inferCategory(urlStr, domain, isBlocked) {
  if (isBlocked) return 'blocked';
  const d = (domain || '').toLowerCase();
  if (d.includes('github.') || d.includes('gitlab.') || d.includes('vercel.') || d.includes('mongodb.') || d.includes('stackoverflow.') || d.includes('aws.') || d.includes('azure.')) return 'tech';
  if (d.includes('docs.google.') || d.includes('sheets.google.') || d.includes('mail.google.') || d.includes('translate.google.') || d.includes('razorpay.') || d.includes('slack.') || d.includes('notion.')) return 'productivity';
  if (d.includes('google.') || d.includes('bing.') || d.includes('duckduckgo.') || d.includes('yahoo.')) return 'search';
  if (d.includes('wikipedia.') || d.includes('khanacademy.') || d.includes('nationalgeographic.') || d.includes('edu') || d.includes('leetcode.') || d.includes('geeksforgeeks.') || d.includes('coursera.') || d.includes('superset')) return 'education';
  if (d.includes('youtube.') || d.includes('netflix.') || d.includes('twitch.') || d.includes('spotify.')) return 'video';
  if (d.includes('discord.') || d.includes('instagram.') || d.includes('reddit.') || d.includes('tiktok.') || d.includes('facebook.') || d.includes('twitter.') || d.includes('x.com')) return 'social';
  return 'general';
}

function getChromeUserDataDir() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'Google', 'Chrome', 'User Data');
}

function findChromeProfileDirs(userDataDir) {
  if (!fs.existsSync(userDataDir)) return [];
  const entries = fs.readdirSync(userDataDir, { withFileTypes: true });
  const profiles = [];
  for (const ent of entries) {
    if (ent.isDirectory()) {
      const historyFile = path.join(userDataDir, ent.name, 'History');
      if (fs.existsSync(historyFile)) {
        profiles.push({
          name: ent.name,
          historyPath: historyFile,
        });
      }
    }
  }
  return profiles;
}

function extractVisitsFromHistory(historyPath, minUnixSec, profileName) {
  if (!fs.existsSync(historyPath)) return [];
  const tempDb = path.resolve(`temp_history_${profileName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.db`);
  try {
    fs.copyFileSync(historyPath, tempDb);
    const sqliteDb = new DatabaseSync(tempDb, { readOnly: true });
    const query = `
      SELECT 
        u.url, 
        u.title, 
        u.visit_count, 
        cast((v.visit_time / 1000000 - 11644473600) as integer) AS unix_sec 
      FROM urls u 
      JOIN visits v ON u.id = v.url 
      WHERE (v.visit_time / 1000000 - 11644473600) >= ? 
      ORDER BY v.visit_time ASC
    `;
    const rows = sqliteDb.prepare(query).all(minUnixSec);
    sqliteDb.close();
    return rows;
  } catch (err) {
    return [];
  } finally {
    try { fs.unlinkSync(tempDb); } catch {}
  }
}

async function syncAllProfiles(db, child, device, lastSyncedTimestamps, defaultMinUnix) {
  const userDataDir = getChromeUserDataDir();
  const profiles = findChromeProfileDirs(userDataDir);
  if (profiles.length === 0) {
    return { newVisits: 0, totalIngested: 0 };
  }

  let allValidVisits = [];

  for (const prof of profiles) {
    const minSec = lastSyncedTimestamps.get(prof.name) ?? defaultMinUnix;
    const rows = extractVisitsFromHistory(prof.historyPath, minSec, prof.name);
    let maxSecInProfile = minSec;

    for (const r of rows) {
      if (!r.url || !/^https?:\/\//i.test(r.url)) continue;
      allValidVisits.push({
        url: r.url,
        title: r.title || '',
        visitedAt: new Date(r.unix_sec * 1000),
        visitCount: r.visit_count || 1,
        profile: prof.name,
        unixSec: r.unix_sec,
      });
      if (r.unix_sec > maxSecInProfile) {
        maxSecInProfile = r.unix_sec;
      }
    }

    if (maxSecInProfile > minSec) {
      lastSyncedTimestamps.set(prof.name, maxSecInProfile);
    }
  }

  if (allValidVisits.length === 0) {
    return { newVisits: 0, totalIngested: 0 };
  }

  // Deduplicate visits in this batch
  const seenKeys = new Set();
  const uniqueVisits = [];
  for (const v of allValidVisits) {
    const key = `${v.url}|${v.visitedAt.toISOString()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueVisits.push(v);
    }
  }

  const BATCH_SIZE = 100;
  let totalUpserted = 0;

  for (let i = 0; i < uniqueVisits.length; i += BATCH_SIZE) {
    const chunk = uniqueVisits.slice(i, i + BATCH_SIZE);
    const ops = chunk.map((item) => {
      const domain = extractDomain(item.url);
      const isBlocked = isAdultContentUrl(item.url, domain);
      const category = inferCategory(item.url, domain, isBlocked);
      return {
        updateOne: {
          filter: {
            familyId: device.familyId,
            childProfileId: child._id,
            url: item.url,
            visitedAt: item.visitedAt,
          },
          update: {
            $set: {
              deviceId: device._id,
              deviceName: 'Chrome Browser',
              title: item.title.slice(0, 500),
              domain: domain.slice(0, 253),
              visitCount: item.visitCount,
              isBlocked,
              category,
            },
          },
          upsert: true,
        },
      };
    });

    const res = await db.collection('webhistories').bulkWrite(ops, { ordered: false });
    totalUpserted += (res.upsertedCount || 0) + (res.modifiedCount || 0);
  }

  return { newVisits: uniqueVisits.length, totalIngested: totalUpserted };
}

async function main() {
  const isWatchMode = process.argv.includes('--watch') || process.argv.includes('-w');
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI is not configured in apps/backend/.env');
    process.exit(1);
  }

  console.log('Connecting to MongoDB Atlas cluster...');
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db('kidsguard');

  const childId = new ObjectId('6ad9d0e75ce1db6498669888');
  const child = await db.collection('childprofiles').findOne({ _id: childId });
  if (!child) {
    console.error('Child profile not found!');
    process.exit(1);
  }

  let device = await db.collection('deviceregistrations').findOne({
    childProfileId: childId,
    $or: [{ name: 'Chrome Browser' }, { deviceName: 'Chrome Browser' }, { _id: new ObjectId('6adb4207a2be45fd0590a370') }]
  });

  if (!device) {
    device = await db.collection('deviceregistrations').findOne({ childProfileId: childId });
  }

  if (!device) {
    console.error('No paired device found for child!');
    process.exit(1);
  }

  const pairedAtDate = device.pairedAt ? new Date(device.pairedAt) : new Date('2026-10-23T11:16:22.746Z');
  const pairedAtUnix = Math.floor(pairedAtDate.getTime() / 1000);

  console.log(`[BalaKavach Chrome History Sync Engine]`);
  console.log(`Child: ${child.displayName || 'Deep'} (${child._id})`);
  console.log(`Device: ${device.deviceName || device.name || 'Chrome Browser'} (${device._id})`);
  console.log(`Pairing Baseline: ${pairedAtDate.toISOString()}`);
  console.log(`Mode: ${isWatchMode ? 'Continuous Watcher (ALWAYS Auto-Syncing)' : 'Single Sync'}`);

  const lastSyncedTimestamps = new Map();

  // Initial Full Sync across all active profiles
  const initialResult = await syncAllProfiles(db, child, device, lastSyncedTimestamps, pairedAtUnix);
  const totalCount = await db.collection('webhistories').countDocuments({ childProfileId: childId });
  console.log(`Initial sync complete! Upserted ${initialResult.totalIngested} visit records.`);
  console.log(`Total live browsing records for child in MongoDB: ${totalCount}`);

  if (!isWatchMode) {
    await client.close();
    console.log('Sync finished successfully.');
    return;
  }

  console.log('\n[Continuous Daemon Active] Streaming new Chrome history visits automatically every 4 seconds...');

  const POLL_INTERVAL_MS = 4000;
  let isRunning = true;

  process.on('SIGINT', async () => {
    console.log('\nStopping Chrome history watcher gracefully...');
    isRunning = false;
    await client.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    isRunning = false;
    await client.close();
    process.exit(0);
  });

  let lastKeepalivePing = 0;

  while (isRunning) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    try {
      // Keep Render cloud backend awake (pings every 5 minutes)
      const nowMs = Date.now();
      if (nowMs - lastKeepalivePing > 5 * 60 * 1000) {
        lastKeepalivePing = nowMs;
        fetch('https://balakavach-be.onrender.com/api/v1/health').catch(() => {});
      }

      // Look back 60 seconds from current highest timestamp to catch any delayed flush from Chrome
      const syncResult = await syncAllProfiles(db, child, device, lastSyncedTimestamps, pairedAtUnix);
      if (syncResult.totalIngested > 0) {
        const nowStr = new Date().toLocaleTimeString();
        const currentTotal = await db.collection('webhistories').countDocuments({ childProfileId: childId });
        console.log(`[${nowStr}] Ingested ${syncResult.totalIngested} new Chrome visit(s). Total in dashboard: ${currentTotal}`);
      }
    } catch (err) {
      // Keep running despite temporary file locks or network blips
    }
  }
}

main().catch((err) => {
  console.error('Failed to run Chrome history sync:', err);
  process.exit(1);
});
