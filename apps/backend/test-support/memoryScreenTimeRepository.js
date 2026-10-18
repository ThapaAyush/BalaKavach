import { randomBytes } from 'node:crypto';

function createId() {
  return randomBytes(12).toString('hex');
}

function copy(record) {
  return record ? JSON.parse(JSON.stringify(record)) : null;
}

export function createMemoryScreenTimeRepository() {
  const summariesByDeviceAndDate = new Map();

  return {
    assertAvailable() {},

    async recordScreenTime(data) {
      const key = `${data.deviceId}_${data.date}`;
      const existing = summariesByDeviceAndDate.get(key);
      const record = {
        _id: existing?._id ?? createId(),
        familyId: data.familyId.toString(),
        childProfileId: data.childProfileId.toString(),
        deviceId: data.deviceId.toString(),
        date: data.date,
        totalScreenTimeSeconds: data.totalScreenTimeSeconds,
        deviceUnlockCount: data.deviceUnlockCount ?? 0,
        reportingPeriod: data.reportingPeriod,
        permissionGranted: data.permissionGranted,
        source: data.source,
        appUsage: data.appUsage ?? [],
        reportedAt: data.reportedAt,
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      };
      summariesByDeviceAndDate.set(key, record);
      return copy(record);
    },

    async findSummariesByChildAndDate(familyId, childProfileId, date) {
      return [...summariesByDeviceAndDate.values()]
        .filter((s) => s.familyId === familyId.toString() && s.childProfileId === childProfileId.toString() && s.date === date)
        .map(copy);
    },

    async findRecentSummariesByChild(familyId, childProfileId, limit = 7) {
      return [...summariesByDeviceAndDate.values()]
        .filter((s) => s.familyId === familyId.toString() && s.childProfileId === childProfileId.toString())
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit)
        .map(copy);
    },

    clear() {
      summariesByDeviceAndDate.clear();
    },
  };
}
