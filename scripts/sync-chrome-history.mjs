#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve('apps/backend/.env') });

async function main() {
  const chromeHistoryPath = 'C:\\Users\\Ayush Thapa\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 2\\History';
  if (!fs.existsSync(chromeHistoryPath)) {
    console.error('Chrome history file not found at:', chromeHistoryPath);
    process.exit(1);
  }

  const tempDb = path.resolve('temp_history.db');
  fs.copyFileSync(chromeHistoryPath, tempDb);

  const sqliteDb = new DatabaseSync(tempDb, { readOnly: true });

  const pairedAtDate = new Date('2026-10-23T11:16:22.746Z');
  const pairedAtUnix = Math.floor(pairedAtDate.getTime() / 1000);

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
  const rows = sqliteDb.prepare(query).all(pairedAtUnix);
  sqliteDb.close();
  try { fs.unlinkSync(tempDb); } catch {}

  console.log(`Found ${rows.length} visits in Chrome history after pairing (${pairedAtDate.toISOString()})`);

  const validVisits = [];
  for (const r of rows) {
    if (!r.url || !/^https?:\/\//i.test(r.url)) continue;
    validVisits.push({
      url: r.url,
      title: r.title || '',
      visitedAt: new Date(r.unix_sec * 1000).toISOString(),
      visitCount: r.visit_count || 1,
    });
  }

  console.log(`Ingesting ${validVisits.length} valid HTTP(S) visits to MongoDB Atlas...`);

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('kidsguard');

  const childId = new ObjectId('6ad9d0e75ce1db6498669888');
  const device = await db.collection('deviceregistrations').findOne({ _id: new ObjectId('6adb4207a2be45fd0590a370') });
  if (!device) {
    console.error('Device 6adb4207a2be45fd0590a370 not found!');
    process.exit(1);
  }

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

  function inferCategory(urlStr, domain) {
    const d = (domain || '').toLowerCase();
    if (d.includes('github.') || d.includes('gitlab.') || d.includes('vercel.') || d.includes('mongodb.') || d.includes('stackoverflow.') || d.includes('aws.') || d.includes('azure.')) return 'tech';
    if (d.includes('docs.google.') || d.includes('sheets.google.') || d.includes('mail.google.') || d.includes('translate.google.') || d.includes('razorpay.') || d.includes('slack.') || d.includes('notion.')) return 'productivity';
    if (d.includes('google.') || d.includes('bing.') || d.includes('duckduckgo.') || d.includes('yahoo.')) return 'search';
    if (d.includes('wikipedia.') || d.includes('khanacademy.') || d.includes('nationalgeographic.') || d.includes('edu') || d.includes('leetcode.') || d.includes('geeksforgeeks.') || d.includes('coursera.') || d.includes('superset')) return 'education';
    if (d.includes('youtube.') || d.includes('netflix.') || d.includes('twitch.') || d.includes('spotify.')) return 'video';
    if (d.includes('discord.') || d.includes('instagram.') || d.includes('reddit.') || d.includes('tiktok.') || d.includes('facebook.') || d.includes('twitter.') || d.includes('x.com')) return 'social';
    return 'general';
  }

  const BATCH_SIZE = 100;
  let totalUpserted = 0;

  for (let i = 0; i < validVisits.length; i += BATCH_SIZE) {
    const chunk = validVisits.slice(i, i + BATCH_SIZE);
    const ops = chunk.map((item) => {
      const domain = extractDomain(item.url);
      const category = inferCategory(item.url, domain);
      return {
        updateOne: {
          filter: {
            familyId: device.familyId,
            childProfileId: childId,
            url: item.url,
            visitedAt: new Date(item.visitedAt),
          },
          update: {
            $set: {
              deviceId: device._id,
              deviceName: 'Chrome Browser',
              title: item.title.slice(0, 500),
              domain: domain.slice(0, 253),
              visitCount: item.visitCount,
              isBlocked: false,
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

  const finalCount = await db.collection('webhistories').countDocuments({ childProfileId: childId });
  console.log(`Success! Total web history visits for child Deep in MongoDB Atlas: ${finalCount}`);
  await client.close();
}

main().catch(err => {
  console.error('Failed to sync Chrome history:', err);
  process.exit(1);
});
