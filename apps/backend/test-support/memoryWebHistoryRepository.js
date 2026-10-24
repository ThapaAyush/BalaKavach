import { WebHistoryStorageUnavailableError } from '../src/services/webHistoryErrors.js';

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

export function createMemoryWebHistoryRepository({ available = true } = {}) {
  let isAvailable = available;
  const store = []; // array of records

  return {
    get store() { return store; },
    setAvailable(state) { isAvailable = Boolean(state); },
    assertAvailable() {
      if (!isAvailable) throw new WebHistoryStorageUnavailableError();
    },

    async saveVisits(familyId, childProfileId, deviceId, deviceName, rawVisits) {
      if (!isAvailable) throw new WebHistoryStorageUnavailableError();
      if (!Array.isArray(rawVisits) || rawVisits.length === 0) {
        return { insertedCount: 0 };
      }

      let count = 0;
      for (const item of rawVisits) {
        const visitedDate = item.visitedAt instanceof Date ? item.visitedAt : new Date(item.visitedAt);
        const domain = item.domain || extractDomain(item.url);
        const category = item.category && item.category !== 'general'
          ? item.category
          : inferCategory(item.url, domain, item.isBlocked);

        const existingIndex = store.findIndex((entry) =>
          entry.familyId === familyId.toString() &&
          entry.childProfileId === childProfileId.toString() &&
          entry.url === item.url &&
          Math.abs(new Date(entry.visitedAt).getTime() - visitedDate.getTime()) < 60_000
        );

        if (existingIndex >= 0) {
          store[existingIndex] = {
            ...store[existingIndex],
            title: item.title || store[existingIndex].title,
            visitCount: (store[existingIndex].visitCount || 1) + (item.visitCount || 1),
            isBlocked: Boolean(item.isBlocked),
            category,
          };
        } else {
          store.push({
            id: `wh-${store.length + 1}`,
            familyId: familyId.toString(),
            childProfileId: childProfileId.toString(),
            deviceId: deviceId.toString(),
            deviceName: deviceName || 'Chrome Browser',
            url: item.url,
            title: item.title || '',
            domain,
            visitedAt: visitedDate.toISOString(),
            visitCount: item.visitCount || 1,
            isBlocked: Boolean(item.isBlocked),
            category,
          });
        }
        count++;
      }

      return { insertedCount: count };
    },

    async findHistoryByChild(familyId, childProfileId, { date, search, domain, limit = 100, page = 1 } = {}) {
      if (!isAvailable) throw new WebHistoryStorageUnavailableError();

      let filtered = store.filter((entry) =>
        entry.familyId === familyId.toString() &&
        entry.childProfileId === childProfileId.toString()
      );

      if (date) {
        filtered = filtered.filter((entry) => entry.visitedAt.startsWith(date));
      }

      if (domain) {
        filtered = filtered.filter((entry) => entry.domain.toLowerCase() === domain.toLowerCase());
      }

      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((entry) =>
          entry.title.toLowerCase().includes(q) ||
          entry.domain.toLowerCase().includes(q) ||
          entry.url.toLowerCase().includes(q)
        );
      }

      // Sort descending by visitedAt
      filtered.sort((a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime());

      const totalCount = filtered.length;
      const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
      const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
      const start = (parsedPage - 1) * parsedLimit;
      const paginated = filtered.slice(start, start + parsedLimit);

      return {
        visits: paginated,
        totalCount,
        page: parsedPage,
        totalPages: Math.ceil(totalCount / parsedLimit) || 1,
      };
    },

    async getSummary(familyId, childProfileId, { date } = {}) {
      if (!isAvailable) throw new WebHistoryStorageUnavailableError();

      let filtered = store.filter((entry) =>
        entry.familyId === familyId.toString() &&
        entry.childProfileId === childProfileId.toString()
      );

      if (date) {
        filtered = filtered.filter((entry) => entry.visitedAt.startsWith(date));
      }

      const totalVisits = filtered.length;
      const blockedCount = filtered.filter((entry) => entry.isBlocked).length;

      const domainCounts = new Map();
      for (const entry of filtered) {
        domainCounts.set(entry.domain, (domainCounts.get(entry.domain) || 0) + 1);
      }

      const topDomains = Array.from(domainCounts.entries())
        .map(([dom, count]) => ({ domain: dom, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalVisits,
        blockedCount,
        uniqueDomainsCount: domainCounts.size,
        topDomains,
      };
    },
  };
}
