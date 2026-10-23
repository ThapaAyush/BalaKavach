import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';

export default function ScreenTimeView({ child }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activeMetric, setActiveMetric] = useState('screenTime'); // 'screenTime' | 'appOpens'

  const loadData = (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    return apiGet(`/children/${child.id}/screen-time?date=${date}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        if (!isSilent) {
          setError(err.message || 'Failed to load screen-time report.');
        }
      })
      .finally(() => {
        if (!isSilent) {
          setLoading(false);
          setRefreshing(false);
        }
      });
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    apiGet(`/children/${child.id}/screen-time?date=${date}`)
      .then((res) => {
        if (!active) return;
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Failed to load screen-time report.');
        setLoading(false);
      });

    // Auto-refresh periodically (every 20s) while parent has this view open
    const interval = setInterval(() => {
      if (active) {
        apiGet(`/children/${child.id}/screen-time?date=${date}`)
          .then((res) => {
            if (!active) return;
            setData(res);
          })
          .catch(() => {});
      }
    }, 20000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [child.id, date]);

  function formatDuration(totalSeconds) {
    if (totalSeconds === null || totalSeconds === undefined) return 'None recorded';
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    if (hours === 0 && mins === 0) return '< 1 min';
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  }

  function getProgressColor(percent) {
    if (percent >= 100) return 'bg-rose-500';
    if (percent >= 75) return 'bg-amber-500';
    return 'bg-emerald-500';
  }

  if (loading) {
    return (
      <div className="py-6 text-center text-sm text-zinc-400">
        Loading screen-time report for {child.displayName}…
      </div>
    );
  }

  const totalSecs = data?.totalScreenTimeSeconds;
  const limitMins = data?.dailyLimitMinutes;
  const limitSecs = limitMins ? limitMins * 60 : null;
  const percentUsed = limitSecs && totalSecs !== null
    ? Math.min(Math.round((totalSecs / limitSecs) * 100), 100)
    : 0;
  const isOverLimit = data?.limitExceeded;
  const isPermissionDenied = data?.permissionStatus === 'denied';

  // Metrics: mobile unlock / open count and total app open count
  const deviceOpens = data?.deviceUnlockCount ?? 0;
  const totalAppOpens = data?.totalAppOpens ?? (data?.appUsage?.reduce((acc, app) => acc + (app.openCount || 0), 0) || 0);

  // Filter and sort apps strictly according to the active setting:
  // - 'screenTime' (Timing): only show apps run in this timing (duration > 0)
  // - 'appOpens' (App Open): only show apps that were opened (openCount > 0)
  const isTimingMode = activeMetric === 'screenTime';
  const appsToShow = (data?.appUsage || [])
    .filter((app) => {
      if (isTimingMode) {
        return (app.durationSeconds || 0) > 0;
      }
      return (app.openCount || 0) > 0;
    })
    .sort((a, b) => {
      if (isTimingMode) {
        return (b.durationSeconds || 0) - (a.durationSeconds || 0) || (b.openCount || 0) - (a.openCount || 0);
      }
      return (b.openCount || 0) - (a.openCount || 0) || (b.durationSeconds || 0) - (a.durationSeconds || 0);
    });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-6">
      {/* Header and Date Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900">Daily Screen Time: {child.displayName}</h3>
          <p className="text-xs text-slate-500">Aggregated foreground device usage, mobile opens, and app launches measured on-device.</p>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
            <label htmlFor="screenTimeDate" className="text-xs font-semibold text-slate-600 shrink-0">Date:</label>
            <input
              id="screenTimeDate"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none transition min-h-[36px]"
            />
          </div>
          <button
            type="button"
            onClick={() => loadData(false)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-100 transition disabled:opacity-50 min-h-[36px] shrink-0"
            title="Refresh latest screen time reported from child device"
          >
            <span className={refreshing ? 'animate-spin inline-block' : 'inline-block'}>🔄</span>
            <span>{refreshing ? 'Syncing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      {/* Permission Denied Notice */}
      {isPermissionDenied && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
          <div className="flex items-center gap-2 font-bold text-amber-900">
            <span>⚠️ Usage Access Not Granted on Device</span>
          </div>
          <p className="mt-1 text-xs text-amber-800/90 leading-relaxed">
            The child device reported that the required Android <code className="font-mono bg-amber-100/80 px-1 py-0.5 rounded">Usage Access</code> permission is not granted. BalaKavach does not fabricate synthetic values when access is unavailable. Please grant usage access on the child device.
          </p>
        </div>
      )}

      {/* 4-Card Summary Metrics Grid: Clicking switches between Timing and App Open frequency */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Total Screen Time (Clickable to switch to Timing mode) */}
        <button
          type="button"
          onClick={() => setActiveMetric('screenTime')}
          aria-expanded={isTimingMode}
          aria-label="Total Screen Time summary card"
          aria-controls="app-breakdown-section"
          className={`group text-left rounded-2xl border transition-all duration-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-400 ${
            isTimingMode
              ? 'border-sky-500 bg-gradient-to-br from-sky-100/90 via-sky-50/60 to-indigo-50/50 ring-2 ring-sky-300 shadow-md scale-[1.01]'
              : 'border-sky-200/80 bg-gradient-to-br from-sky-50/70 via-white to-indigo-50/30 hover:border-sky-400 hover:shadow-md hover:bg-sky-50/90'
          }`}
          title="Click to view all applications run during this timing"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800">
                Total Screen Time
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-0.5 transition-colors ${
                isTimingMode
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-sky-100 text-sky-700 group-hover:bg-sky-200'
              }`}>
                <span>{isTimingMode ? '✓ Active View' : 'Tap for Timing →'}</span>
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                {formatDuration(totalSecs)}
              </span>
              {limitMins && (
                <span className="text-xs font-semibold text-slate-500">
                  / {Math.floor(limitMins / 60)}h {limitMins % 60 ? `${limitMins % 60}m` : ''}
                </span>
              )}
            </div>
          </div>

          {limitSecs && totalSecs !== null ? (
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200/60">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${getProgressColor(percentUsed)}`}
                  style={{ width: `${percentUsed}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-slate-600">
                <span>{percentUsed}% budget</span>
                {isOverLimit && <span className="font-bold text-rose-600">Limit reached</span>}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-slate-400">
              No daily budget limit configured
            </p>
          )}

          <div className="mt-2 pt-2 border-t border-sky-100/80 flex items-center justify-between text-[11px] text-sky-700 font-semibold">
            <span>{(data?.appUsage || []).filter((a) => (a.durationSeconds || 0) > 0).length} apps run</span>
            <span className="group-hover:underline">
              {isTimingMode ? 'Showing run times' : 'Tap to show times →'}
            </span>
          </div>
        </button>

        {/* Metric 2: Mobile Device Opens / Pickups (Clickable to switch to App Opens mode) */}
        <button
          type="button"
          onClick={() => setActiveMetric('appOpens')}
          aria-expanded={!isTimingMode}
          aria-label="Mobile Pickups & Opens summary card"
          aria-controls="app-breakdown-section"
          className={`group text-left rounded-2xl border transition-all duration-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-400 ${
            !isTimingMode
              ? 'border-violet-500 bg-gradient-to-br from-violet-100/90 via-violet-50/60 to-purple-50/50 ring-2 ring-violet-300 shadow-md scale-[1.01]'
              : 'border-violet-200/80 bg-gradient-to-br from-violet-50/70 via-white to-purple-50/30 hover:border-violet-400 hover:shadow-md hover:bg-violet-50/90'
          }`}
          title="Click to inspect how many times each app was opened"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-violet-800">
                Mobile Pickups &amp; Opens
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-0.5 transition-colors ${
                !isTimingMode
                  ? 'bg-violet-600 text-white shadow-xs'
                  : 'bg-violet-100 text-violet-700 group-hover:bg-violet-200'
              }`}>
                <span>{!isTimingMode ? '✓ Active View' : 'Tap for Opens →'}</span>
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                {deviceOpens}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                times opened
              </span>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[11px] text-slate-500">
              Number of times the phone was unlocked &amp; active today.
            </p>
            <div className="mt-2 pt-2 border-t border-violet-100/80 flex items-center justify-between text-[11px] text-violet-700 font-semibold">
              <span>{totalAppOpens} app opens</span>
              <span className="group-hover:underline">
                {!isTimingMode ? 'Showing frequencies' : 'Tap to show frequencies →'}
              </span>
            </div>
          </div>
        </button>

        {/* Metric 3: Total App Launches (Clickable to switch to App Opens mode) */}
        <button
          type="button"
          onClick={() => setActiveMetric('appOpens')}
          aria-expanded={!isTimingMode}
          aria-label="Total App Launches summary card"
          aria-controls="app-breakdown-section"
          className={`group text-left rounded-2xl border transition-all duration-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400 ${
            !isTimingMode
              ? 'border-amber-500 bg-gradient-to-br from-amber-100/90 via-amber-50/60 to-orange-50/50 ring-2 ring-amber-300 shadow-md scale-[1.01]'
              : 'border-amber-200/80 bg-gradient-to-br from-amber-50/70 via-white to-orange-50/30 hover:border-amber-400 hover:shadow-md hover:bg-amber-50/90'
          }`}
          title="Click to view app launch frequencies"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Total App Launches
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-0.5 transition-colors ${
                !isTimingMode
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-100 text-amber-700 group-hover:bg-amber-200'
              }`}>
                <span>{!isTimingMode ? '✓ Active View' : 'Tap for Opens →'}</span>
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                {totalAppOpens}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                app opens
              </span>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[11px] text-slate-500">
              Total times applications were opened or switched into today.
            </p>
            <div className="mt-2 pt-2 border-t border-amber-100/80 flex items-center justify-between text-[11px] text-amber-700 font-semibold">
              <span>{(data?.appUsage || []).filter((a) => (a.openCount || 0) > 0).length} apps opened</span>
              <span className="group-hover:underline">
                {!isTimingMode ? 'Showing frequencies' : 'Tap to show frequencies →'}
              </span>
            </div>
          </div>
        </button>

        {/* Metric 4: Data Freshness & Sync */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Device Sync &amp; Freshness</span>
            <div className="mt-2 text-xs space-y-1.5 text-slate-700">
              {data?.dataFreshness ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${data.dataFreshness.isStale ? 'bg-amber-400' : 'bg-emerald-500 ring-2 ring-emerald-100'}`} />
                    <span className="font-semibold text-slate-800">
                      {data.dataFreshness.isStale ? 'Stale' : 'Live & Fresh'} • {data.dataFreshness.reportingDeviceName || 'Paired Device'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Timestamp: {new Date(data.dataFreshness.lastReportedAt).toLocaleTimeString()}
                  </p>
                </>
              ) : (
                <p className="text-slate-500 italic">No device reports received for this date.</p>
              )}
            </div>
          </div>
          <div className="mt-2 pt-2.5 border-t border-slate-200 text-[11px] font-medium text-slate-500">
            Source: {data?.source === 'measured' ? 'Measured on-device via Android UsageStats' : 'Awaiting device sync'}
          </div>
        </div>
      </div>

      {/* App Breakdown Section */}
      <div id="app-breakdown-section" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs transition-all duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-900">
                {isTimingMode
                  ? 'Application Usage & Screen Time Breakdown'
                  : 'Application Launch Frequency & Open Counts'}
              </h4>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                isTimingMode
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-violet-100 text-violet-800'
              }`}>
                {appsToShow.length} {appsToShow.length === 1 ? (isTimingMode ? 'app run' : 'app opened') : (isTimingMode ? 'apps run' : 'apps opened')}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isTimingMode
                ? `Showing only apps run in this timing (${formatDuration(totalSecs)}) with foreground screen time.`
                : `Showing only application open frequency (${totalAppOpens} total app opens across ${deviceOpens} phone unlocks).`}
            </p>
          </div>

          {/* Setting Switcher: Timing vs App Open */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveMetric('screenTime')}
              aria-label="Switch to Timing view"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                isTimingMode
                  ? 'bg-white text-sky-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Show only apps run during this timing"
            >
              <span>⏱️ Timing (Screen Time)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMetric('appOpens')}
              aria-label="Switch to App Open frequency view"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                !isTimingMode
                  ? 'bg-white text-violet-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Show only how many times each app was opened (frequency)"
            >
              <span>📱 App Open (Frequency)</span>
            </button>
          </div>
        </div>

        {appsToShow.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {appsToShow.map((app) => {
              const appPercent = totalSecs ? Math.round(((app.durationSeconds || 0) / totalSecs) * 100) : 0;
              const opens = app.openCount ?? 0;
              const openPercent = totalAppOpens ? Math.round((opens / totalAppOpens) * 100) : 0;

              return (
                <div key={app.packageName} className="py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/60 -mx-2 px-2 rounded-xl transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-slate-900 truncate text-[13px]">{app.appName}</span>
                        {app.packageName && app.packageName !== app.appName && (
                          <span className="text-[11px] text-slate-400 font-mono hidden md:inline truncate max-w-[200px]">
                            ({app.packageName})
                          </span>
                        )}
                      </div>

                      {isTimingMode ? (
                        <span className="text-sky-900 font-mono font-bold text-xs bg-sky-50 border border-sky-200/80 px-2.5 py-0.5 rounded-md">
                          ⏱️ {formatDuration(app.durationSeconds)} <span className="text-sky-600 font-normal">({appPercent}%)</span>
                        </span>
                      ) : (
                        <span className="text-violet-800 font-mono font-bold text-xs bg-violet-50 border border-violet-200/80 px-2.5 py-0.5 rounded-md">
                          📱 {opens} {opens === 1 ? 'time opened' : 'times opened'} <span className="text-violet-500 font-normal">({openPercent}%)</span>
                        </span>
                      )}
                    </div>

                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200/40">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isTimingMode
                            ? 'bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-600'
                            : 'bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-600'
                        }`}
                        style={{
                          width: `${Math.max(isTimingMode ? appPercent : openPercent, 2)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic py-6 text-center">
            {isTimingMode
              ? 'No applications recorded active screen time or running usage on this date.'
              : 'No application launches or open events recorded on this date.'}
          </p>
        )}
      </div>
    </div>
  );
}
