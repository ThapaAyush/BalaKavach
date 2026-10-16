import test from 'node:test';
import assert from 'node:assert/strict';

// Mirror of Android UsageStatsHelper event aggregation contract
function aggregateEvents(events, startTimeMs, endTimeMs) {
  const appDurationsMs = new Map();
  let activePackage = null;
  let activeStartTimeMs = startTimeMs;

  const sortedEvents = [...events].sort((a, b) => a.timeStamp - b.timeStamp);

  for (const event of sortedEvents) {
    if (event.timeStamp < startTimeMs || event.timeStamp > endTimeMs) {
      continue;
    }

    if (event.eventType === 1 /* ACTIVITY_RESUMED */) {
      if (activePackage !== null) {
        const duration = Math.max(0, event.timeStamp - activeStartTimeMs);
        appDurationsMs.set(activePackage, (appDurationsMs.get(activePackage) || 0) + duration);
      }
      activePackage = event.packageName;
      activeStartTimeMs = event.timeStamp;
    } else if (event.eventType === 2 /* ACTIVITY_PAUSED */ || event.eventType === 23 /* ACTIVITY_STOPPED */) {
      if (activePackage === event.packageName) {
        const duration = Math.max(0, event.timeStamp - activeStartTimeMs);
        appDurationsMs.set(activePackage, (appDurationsMs.get(activePackage) || 0) + duration);
        activePackage = null;
      }
    }
  }

  if (activePackage !== null && endTimeMs > activeStartTimeMs) {
    const duration = Math.max(0, endTimeMs - activeStartTimeMs);
    appDurationsMs.set(activePackage, (appDurationsMs.get(activePackage) || 0) + duration);
  }

  const result = {};
  for (const [pkg, ms] of appDurationsMs.entries()) {
    const sec = Math.floor(ms / 1000);
    if (sec > 0) result[pkg] = sec;
  }
  return result;
}

function buildReportPayload({ date, permissionGranted, totalScreenTimeSeconds, appUsage = [] }) {
  // Zero-fabrication validation
  if (!permissionGranted && totalScreenTimeSeconds !== null) {
    throw new TypeError('totalScreenTimeSeconds must be null when permission is false');
  }

  return {
    date,
    totalScreenTimeSeconds: permissionGranted ? totalScreenTimeSeconds : null,
    reportingPeriod: {
      start: `${date}T00:00:00.000Z`,
      end: `${date}T12:00:00.000Z`,
    },
    permissionGranted,
    source: permissionGranted ? 'measured' : 'unavailable',
    appUsage: permissionGranted ? appUsage : [],
  };
}

test('Android contract: aggregateEvents avoids double-counting with single-foreground tracking', () => {
  const events = [
    { packageName: 'app.one', timeStamp: 1000, eventType: 1 },
    { packageName: 'app.one', timeStamp: 4000, eventType: 2 },
    { packageName: 'app.two', timeStamp: 5000, eventType: 1 },
    { packageName: 'app.one', timeStamp: 8000, eventType: 1 },
    { packageName: 'app.one', timeStamp: 10000, eventType: 23 },
  ];

  const result = aggregateEvents(events, 0, 12000);
  // app.one: (4000-1000) + (10000-8000) = 3000ms + 2000ms = 5s
  // app.two: (8000-5000) = 3000ms = 3s
  assert.equal(result['app.one'], 5);
  assert.equal(result['app.two'], 3);

  const totalSec = Object.values(result).reduce((a, b) => a + b, 0);
  assert.equal(totalSec, 8);
});

test('Android contract: zero-fabrication requires null totalScreenTimeSeconds when permission is denied', () => {
  const deniedReport = buildReportPayload({
    date: '2026-10-15',
    permissionGranted: false,
    totalScreenTimeSeconds: null,
  });

  assert.equal(deniedReport.totalScreenTimeSeconds, null);
  assert.equal(deniedReport.permissionGranted, false);
  assert.equal(deniedReport.source, 'unavailable');
  assert.deepEqual(deniedReport.appUsage, []);

  // Reject fabrication of screen-time duration when permission is false
  assert.throws(
    () => buildReportPayload({ date: '2026-10-15', permissionGranted: false, totalScreenTimeSeconds: 1200 }),
    /totalScreenTimeSeconds must be null/
  );
});

test('Android contract: granted report correctly passes measured total and app usage breakdown', () => {
  const grantedReport = buildReportPayload({
    date: '2026-10-15',
    permissionGranted: true,
    totalScreenTimeSeconds: 3600,
    appUsage: [
      { packageName: 'com.browser', appName: 'Browser', durationSeconds: 2400 },
      { packageName: 'com.game', appName: 'Game', durationSeconds: 1200 },
    ],
  });

  assert.equal(grantedReport.totalScreenTimeSeconds, 3600);
  assert.equal(grantedReport.permissionGranted, true);
  assert.equal(grantedReport.source, 'measured');
  assert.equal(grantedReport.appUsage.length, 2);
});
