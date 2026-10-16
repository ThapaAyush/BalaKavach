import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';

export default function ScreenTimeView({ child }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

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

    return () => { active = false; };
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

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur space-y-6">
      {/* Header and Date Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Daily Screen Time: {child.displayName}</h3>
          <p className="text-xs text-zinc-400">Aggregated foreground device usage measured on-device.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="screenTimeDate" className="text-xs text-zinc-400">Date:</label>
          <input
            id="screenTimeDate"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Permission Denied Notice */}
      {isPermissionDenied && (
        <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <div className="flex items-center gap-2 font-medium text-amber-300">
            <span>⚠️ Usage Access Not Granted on Device</span>
          </div>
          <p className="mt-1 text-xs text-amber-200/80">
            The child device reported that the required Android <code className="font-mono">Usage Access</code> permission is not granted. KidsGuard does not fabricate synthetic values when access is unavailable. Please grant usage access on the child device.
          </p>
        </div>
      )}

      {/* Daily Usage Summary Card */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
          <span className="text-xs font-medium text-zinc-400">Total Screen Time Today</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-white">
              {formatDuration(totalSecs)}
            </span>
            {limitMins && (
              <span className="text-xs text-zinc-500">
                / {Math.floor(limitMins / 60)}h {limitMins % 60 ? `${limitMins % 60}m` : ''} limit
              </span>
            )}
          </div>

          {limitSecs && totalSecs !== null && (
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full transition-all duration-300 ${getProgressColor(percentUsed)}`}
                  style={{ width: `${percentUsed}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-zinc-400">
                <span>{percentUsed}% of budget</span>
                {isOverLimit && <span className="font-medium text-rose-400">Daily limit reached</span>}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 flex flex-col justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-400">Data Freshness & Provenance</span>
            <div className="mt-2 text-xs space-y-1.5 text-zinc-300">
              {data?.dataFreshness ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${data.dataFreshness.isStale ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                    <span>
                      {data.dataFreshness.isStale ? 'Stale' : 'Fresh'} • Reported from {data.dataFreshness.reportingDeviceName || 'Paired Device'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Timestamp: {new Date(data.dataFreshness.lastReportedAt).toLocaleTimeString()}
                  </p>
                </>
              ) : (
                <p className="text-zinc-500 italic">No device reports received for this date.</p>
              )}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-zinc-800/60 text-[11px] text-zinc-500">
            Source: {data?.source === 'measured' ? 'Measured on-device via UsageStats' : 'Awaiting device sync'}
          </div>
        </div>
      </div>

      {/* App Breakdown Table */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
        <h4 className="text-sm font-medium text-white mb-3">Application Usage Breakdown</h4>
        {data?.appUsage && data.appUsage.length > 0 ? (
          <div className="divide-y divide-zinc-800/60">
            {data.appUsage.map((app) => {
              const appPercent = totalSecs ? Math.round((app.durationSeconds / totalSecs) * 100) : 0;
              return (
                <div key={app.packageName} className="py-2.5 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-zinc-200 truncate">{app.appName}</span>
                      <span className="text-zinc-400 font-mono">{formatDuration(app.durationSeconds)} ({appPercent}%)</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full bg-indigo-500 transition-all duration-300"
                        style={{ width: `${appPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 italic py-2">No application usage details reported for this day.</p>
        )}
      </div>
    </div>
  );
}
