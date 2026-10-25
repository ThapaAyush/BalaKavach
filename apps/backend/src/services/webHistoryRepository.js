import mongoose from 'mongoose';
import WebHistory from '../models/WebHistory.js';
import { WebHistoryStorageUnavailableError } from './webHistoryErrors.js';

const DATABASE_OPERATION_TIMEOUT_MS = 10_000;
let webHistoryIndexesReady = false;

function assertDatabaseAvailable(requireIndexes = true) {
  if (mongoose.connection.readyState !== 1 || (requireIndexes && !webHistoryIndexesReady)) {
    throw new WebHistoryStorageUnavailableError();
  }
}

async function runWithTimeout(operation) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new WebHistoryStorageUnavailableError()), DATABASE_OPERATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureWebHistoryIndexes() {
  assertDatabaseAvailable(false);
  await runWithTimeout(() => WebHistory.createIndexes());
  webHistoryIndexesReady = true;
}

function extractDomain(urlStr) {
  try {
    const parsed = new URL(urlStr);
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    return hostname;
  } catch {
    return 'unknown';
  }
}

function inferCategory(urlStr, domain, isBlocked) {
  if (isBlocked) return 'blocked';
  const lower = (urlStr || '').toLowerCase();
  if (domain.includes('google.') || domain.includes('bing.') || domain.includes('duckduckgo.') || domain.includes('yahoo.')) {
    return 'search';
  }
  if (domain.includes('wikipedia.') || domain.includes('khanacademy.') || domain.includes('nationalgeographic.') || domain.includes('edu')) {
    return 'education';
  }
  if (domain.includes('youtube.') || domain.includes('netflix.') || domain.includes('twitch.')) {
    return 'video';
  }
  if (domain.includes('discord.') || domain.includes('instagram.') || domain.includes('reddit.') || domain.includes('tiktok.')) {
    return 'social';
  }
  return 'general';
}

function toObjectId(id) {
  if (id && typeof id === 'string' && mongoose.isValidObjectId(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  return id;
}

export const mongoWebHistoryRepository = Object.freeze({
  assertAvailable() {
    assertDatabaseAvailable();
  },

  async saveVisits(familyId, childProfileId, deviceId, deviceName, rawVisits) {
    return runWithTimeout(async () => {
      if (!Array.isArray(rawVisits) || rawVisits.length === 0) {
        return { insertedCount: 0 };
      }

      const targetFamilyId = toObjectId(familyId);
      const targetChildId = toObjectId(childProfileId);
      const targetDeviceId = toObjectId(deviceId);

      const operations = rawVisits.map((item) => {
        const visitedDate = item.visitedAt instanceof Date ? item.visitedAt : new Date(item.visitedAt);
        const domain = item.domain || extractDomain(item.url);
        const category = item.category && item.category !== 'general'
          ? item.category
          : inferCategory(item.url, domain, item.isBlocked);

        return {
          updateOne: {
            filter: {
              familyId: targetFamilyId,
              childProfileId: targetChildId,
              url: item.url,
              visitedAt: visitedDate,
            },
            update: {
              $set: {
                deviceId: targetDeviceId,
                deviceName: deviceName || 'Chrome Browser',
                title: (item.title || '').slice(0, 500),
                domain: domain.slice(0, 253),
                visitCount: item.visitCount || 1,
                isBlocked: Boolean(item.isBlocked),
                category,
              },
            },
            upsert: true,
          },
        };
      });

      const result = await WebHistory.bulkWrite(operations, { ordered: false });
      return {
        insertedCount: (result.upsertedCount || 0) + (result.modifiedCount || 0),
      };
    });
  },

  async findHistoryByChild(familyId, childProfileId, { date, search, domain, limit = 100, page = 1 } = {}) {
    return runWithTimeout(async () => {
      const targetFamilyId = toObjectId(familyId);
      const targetChildId = toObjectId(childProfileId);
      const filter = { familyId: targetFamilyId, childProfileId: targetChildId };

      if (date) {
        const start = new Date(`${date}T00:00:00.000Z`);
        const end = new Date(`${date}T23:59:59.999Z`);
        filter.visitedAt = { $gte: start, $lte: end };
      }

      if (domain) {
        filter.domain = domain.toLowerCase();
      }

      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { title: { $regex: escaped, $options: 'i' } },
          { domain: { $regex: escaped, $options: 'i' } },
          { url: { $regex: escaped, $options: 'i' } },
        ];
      }

      const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
      const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
      const skip = (parsedPage - 1) * parsedLimit;

      const [docs, totalCount] = await Promise.all([
        WebHistory.find(filter)
          .sort({ visitedAt: -1 })
          .skip(skip)
          .limit(parsedLimit)
          .lean(),
        WebHistory.countDocuments(filter),
      ]);

      return {
        visits: docs.map((doc) => ({
          id: doc._id.toString(),
          url: doc.url,
          title: doc.title,
          domain: doc.domain,
          visitedAt: doc.visitedAt.toISOString(),
          visitCount: doc.visitCount,
          isBlocked: doc.isBlocked,
          category: doc.category,
          deviceName: doc.deviceName,
        })),
        totalCount,
        page: parsedPage,
        totalPages: Math.ceil(totalCount / parsedLimit) || 1,
      };
    });
  },

  async getSummary(familyId, childProfileId, { date } = {}) {
    return runWithTimeout(async () => {
      const targetFamilyId = toObjectId(familyId);
      const targetChildId = toObjectId(childProfileId);
      const filter = { familyId: targetFamilyId, childProfileId: targetChildId };
      if (date) {
        const start = new Date(`${date}T00:00:00.000Z`);
        const end = new Date(`${date}T23:59:59.999Z`);
        filter.visitedAt = { $gte: start, $lte: end };
      }

      const [totalVisits, blockedCount, topDomains] = await Promise.all([
        WebHistory.countDocuments(filter),
        WebHistory.countDocuments({ ...filter, isBlocked: true }),
        WebHistory.aggregate([
          { $match: filter },
          { $group: { _id: '$domain', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
      ]);

      return {
        totalVisits,
        blockedCount,
        uniqueDomainsCount: topDomains.length,
        topDomains: topDomains.map((item) => ({ domain: item._id, count: item.count })),
      };
    });
  },
});
