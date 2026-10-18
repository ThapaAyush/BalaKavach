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

  // Metrics: mobile unlock / open count and total app open count
  const deviceOpens = data?.deviceUnlockCount ?? 0;
  const totalAppOpens = data?.totalAppOpens ?? (data?.appUsage?.reduce((acc, app) => acc + (app.openCount || 0), 0) || 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-6">
      {/* Header and Date Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900">Daily Screen Time: {child.displayName}</h3>
          <p className="text-xs text-slate-500">Aggregated foreground device usage, mobile opens, and app launches measured on-device.</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
          <label htmlFor="screenTimeDate" className="text-xs font-semibold text-slate-600">Date:</label>
          <input
            id="screenTimeDate"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none transition"
          />
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

      {/* 4-Card Summary Metrics Grid */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Total Screen Time */}
        <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50/70 via-white to-indigo-50/30 p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800">Total Screen Time</span>
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
            <p className="mt-2 text-[11px] text-slate-400">No daily budget limit configured</p>
          )}
        </div>

        {/* Metric 2: Mobile Device Opens / Pickups */}
        <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/70 via-white to-purple-50/30 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-violet-800">Mobile Pickups & Opens</span>
              <span className="text-lg" aria-hidden="true">📱</span>
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
          <p className="mt-3 text-[11px] text-slate-500">
            Number of times the phone was unlocked &amp; active today.
          </p>
        </div>

        {/* Metric 3: Total App Launches */}
        <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/70 via-white to-orange-50/30 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Total App Launches</span>
              <span className="text-lg" aria-hidden="true">🚀</span>
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
          <p className="mt-3 text-[11px] text-slate-500">
            Total times applications were opened or switched into today.
          </p>
        </div>

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

      {/* App Breakdown Table with Per-App Open Frequency */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Application Usage &amp; Launch Frequency</h4>
            <p className="text-xs text-slate-500">Foreground duration and open count per application.</p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {data?.appUsage?.length || 0} active {data?.appUsage?.length === 1 ? 'app' : 'apps'}
          </span>
        </div>

        {data?.appUsage && data.appUsage.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {data.appUsage.map((app) => {
              const appPercent = totalSecs ? Math.round((app.durationSeconds / totalSecs) * 100) : 0;
              const opens = app.openCount ?? 0;
              return (
                <div key={app.packageName} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-slate-800 truncate">{app.appName}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 px-2 py-0.5 text-[10.5px] font-bold border border-violet-200/60">
                          📱 {opens} {opens === 1 ? 'open' : 'opens'}
                        </span>
                      </div>
                      <span className="text-slate-600 font-mono font-medium">
                        {formatDuration(app.durationSeconds)} ({appPercent}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-600 rounded-full transition-all duration-300"
                        style={{ width: `${appPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic py-2">No application usage details reported for this day.</p>
        )}
      </div>
    </div>
  );
}
