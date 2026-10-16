import { mongoScreenTimeRepository } from './screenTimeRepository.js';
import { mongoFamilyChildRepository } from './familyChildRepository.js';
import { mongoDevicePairingRepository } from './devicePairingRepository.js';
import { mongoPolicyRepository } from './policyRepository.js';
import { childProfileNotFoundError } from './familyChildErrors.js';

export function createScreenTimeService({
  repository = mongoScreenTimeRepository,
  familyChildRepository = mongoFamilyChildRepository,
  devicePairingRepository = mongoDevicePairingRepository,
  policyRepository = mongoPolicyRepository,
  now = () => new Date(),
} = {}) {
  async function resolveFamilyAndChild(parentId, childId) {
    repository.assertAvailable?.();
    familyChildRepository.assertAvailable?.();
    const family = await familyChildRepository.findFamilyForParent(parentId);
    const familyId = family?._id?.toString() ?? family?.id?.toString();
    if (!familyId) return null;

    const child = await familyChildRepository.findChildInFamily(childId, familyId);
    if (!child) return null;

    return { familyId, childId };
  }

  return Object.freeze({
    async recordScreenTime(device, payload) {
      repository.assertAvailable?.();
      devicePairingRepository.assertAvailable?.();

      const reportedAt = now();
      const permissionGranted = Boolean(payload.permissionGranted);

      // Strict enforcement: if permission is not granted, duration is null and apps empty
      const totalScreenTimeSeconds = permissionGranted ? payload.totalScreenTimeSeconds : null;
      const appUsage = permissionGranted ? (payload.appUsage ?? []) : [];
      const source = permissionGranted ? (payload.source ?? 'measured') : 'unavailable';

      const record = await repository.recordScreenTime({
        familyId: device.familyId,
        childProfileId: device.childProfileId,
        deviceId: device.id,
        date: payload.date,
        totalScreenTimeSeconds,
        reportingPeriod: {
          start: new Date(payload.reportingPeriod.start),
          end: new Date(payload.reportingPeriod.end),
        },
        permissionGranted,
        source,
        appUsage,
        reportedAt,
      });

      if (devicePairingRepository.recordScreenTimeReport) {
        await devicePairingRepository.recordScreenTimeReport({
          deviceId: device.id,
          lastScreenTimeReportAt: reportedAt,
        });
      }

      return {
        recorded: true,
        date: record.date,
        reportedAt,
      };
    },

    async getChildScreenTime(parentId, childId, queryDate) {
      const scope = await resolveFamilyAndChild(parentId, childId);
      if (!scope) throw childProfileNotFoundError();

      const targetDate = queryDate || now().toISOString().slice(0, 10);
      const summaries = await repository.findSummariesByChildAndDate(scope.familyId, scope.childId, targetDate);

      let policy = null;
      if (policyRepository) {
        try {
          policy = await policyRepository.findPolicyByChildId(scope.familyId, scope.childId);
        } catch {
          policy = null;
        }
      }

      const dailyLimitMinutes = policy?.screenTime?.dailyLimitMinutes ?? null;

      if (!summaries || summaries.length === 0) {
        return {
          date: targetDate,
          totalScreenTimeSeconds: null,
          dailyLimitMinutes,
          limitExceeded: false,
          permissionStatus: 'no_data',
          dataFreshness: null,
          appUsage: [],
          source: 'unavailable',
        };
      }

      // Aggregate across devices for this child on this date
      let hasPermission = false;
      let totalSeconds = 0;
      let hasMeasuredData = false;
      let latestReportedAt = new Date(0);
      let reportingDeviceName = null;
      const appMap = new Map();

      for (const summary of summaries) {
        if (summary.permissionGranted) {
          hasPermission = true;
          if (typeof summary.totalScreenTimeSeconds === 'number') {
            hasMeasuredData = true;
            totalSeconds += summary.totalScreenTimeSeconds;
          }
        }
        const repAt = new Date(summary.reportedAt || summary.updatedAt || 0);
        if (repAt > latestReportedAt) {
          latestReportedAt = repAt;
          reportingDeviceName = summary.deviceId?.name ?? summary.deviceName ?? null;
        }

        for (const app of (summary.appUsage || [])) {
          const current = appMap.get(app.packageName) || {
            packageName: app.packageName,
            appName: app.appName,
            durationSeconds: 0,
          };
          current.durationSeconds += app.durationSeconds;
          appMap.set(app.packageName, current);
        }
      }

      const limitExceeded = dailyLimitMinutes !== null && hasMeasuredData
        ? totalSeconds > (dailyLimitMinutes * 60)
        : false;

      const isStale = (now().getTime() - latestReportedAt.getTime()) > (24 * 60 * 60 * 1000);

      const appUsageList = [...appMap.values()]
        .sort((a, b) => b.durationSeconds - a.durationSeconds)
        .slice(0, 30);

      return {
        date: targetDate,
        totalScreenTimeSeconds: hasMeasuredData ? totalSeconds : null,
        dailyLimitMinutes,
        limitExceeded,
        permissionStatus: hasPermission ? 'granted' : 'denied',
        source: hasMeasuredData ? 'measured' : 'unavailable',
        dataFreshness: {
          lastReportedAt: latestReportedAt.getTime() > 0 ? latestReportedAt : null,
          reportingDeviceName,
          isStale,
        },
        appUsage: appUsageList,
      };
    },

    async getChildScreenTimeHistory(parentId, childId, limit = 7) {
      const scope = await resolveFamilyAndChild(parentId, childId);
      if (!scope) throw childProfileNotFoundError();

      const summaries = await repository.findRecentSummariesByChild(scope.familyId, scope.childId, limit);
      return summaries.map((s) => ({
        date: s.date,
        totalScreenTimeSeconds: s.totalScreenTimeSeconds,
        permissionGranted: s.permissionGranted,
        source: s.source,
        reportedAt: s.reportedAt,
      }));
    },
  });
}

export const screenTimeService = createScreenTimeService();
