import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';
import { formatAppDisplayName } from '../lib/appDisplayNames.js';

export default function ScreenTimeView({ child }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [date, setDate] = useState(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.sessionStorage?.getItem(`balakavach_screentime_date_${child?.id || 'default'}`) : null;
      if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
    } catch (_) {}
    return new Date().toISOString().slice(0, 10);
  });

  const [activeMetric, setActiveMetric] = useState(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.sessionStorage?.getItem('balakavach_screentime_metric') : null;
      if (stored === 'appOpens' || stored === 'screenTime') return stored;
    } catch (_) {}
    return 'screenTime';
  });

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        if (child?.id) {
          window.sessionStorage?.setItem(`balakavach_screentime_date_${child.id}`, date);
        }
        window.sessionStorage?.setItem('balakavach_screentime_metric', activeMetric);
      }
    } catch (_) {}
  }, [date, activeMetric, child?.id]);

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
    if (percent >= 100) return 'bg-gradient-to-r from-rose-500 via-rose-600 to-pink-600';
    if (percent >= 75) return 'bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500';
    return 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500';
  }

  function formatHistoryDate(dateStr) {
    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dateStr === today) return 'Today';
    if (dateStr === yesterdayDate) return 'Yesterday';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
    } catch (_) {}
    return dateStr;
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

  const recentHistory = data?.recentHistory || [];
  const latestDate = data?.latestAvailableDate;
  const hasNoDataToday = totalSecs === null && appsToShow.length === 0;

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
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-100 transition disabled:opacity-50 min-h-[36px] shrink-0 cursor-pointer"
            title="Refresh latest screen time reported from child device"
          >
            <span className={refreshing ? 'animate-spin inline-block' : 'inline-block'}>🔄</span>
            <span>{refreshing ? 'Syncing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Preserved History Timeline Bar */}
      {recentHistory.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
              <span>📅</span>
              <span>Preserved Activity Timeline (Click day to inspect):</span>
            </span>
            <span className="text-[10px] text-slate-400">
              {recentHistory.length} recorded {recentHistory.length === 1 ? 'day' : 'days'} safely retained
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {recentHistory.map((item) => {
              const isSelected = item.date === date;
              const hasUsage = item.totalScreenTimeSeconds && item.totalScreenTimeSeconds > 0;
              return (
                <button
                  key={item.date}
                  type="button"
                  onClick={() => setDate(item.date)}
                  className={`shrink-0 flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition cursor-pointer border ${
                    isSelected
                      ? 'border-sky-500 bg-sky-600 text-white shadow-xs font-bold'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50/60'
                  }`}
                  title={`View screen time report for ${item.date}`}
                >
                  <span>{formatHistoryDate(item.date)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                    isSelected
                      ? 'bg-white/20 text-white font-bold'
                      : hasUsage
                      ? 'bg-sky-100 text-sky-800 font-bold'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {hasUsage ? formatDuration(item.totalScreenTimeSeconds) : 'No data'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Smart Empty-State Banner: If selected date is empty because app was uninstalled or offline */}
      {hasNoDataToday && latestDate && latestDate !== date && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/90 p-4 text-xs text-indigo-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <span className="text-xl select-none">🛡️</span>
            <div>
              <p className="font-bold text-indigo-950 text-sm">No new reports for {formatHistoryDate(date)}</p>
              <p className="text-indigo-800/90 text-xs mt-0.5 leading-relaxed">
                If the companion app or extension was uninstalled or is offline, <strong>all previous screen time and app usage records remain permanently preserved</strong> in your dashboard.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDate(latestDate)}
            className="shrink-0 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition shadow-xs cursor-pointer whitespace-nowrap"
          >
            Jump to Latest Preserved Activity ({formatHistoryDate(latestDate)}) →
          </button>
        </div>
      )}

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
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Total Screen Time (Clickable to switch to Timing mode) */}
        <button
          type="button"
          onClick={() => setActiveMetric('screenTime')}
          aria-expanded={isTimingMode}
          aria-label="Total Screen Time summary card"
          aria-controls="app-breakdown-section"
          className={`group relative text-left rounded-2xl border transition-all duration-300 p-4 sm:p-5 flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 overflow-hidden ${
            isTimingMode
              ? 'border-sky-500 bg-gradient-to-br from-white via-sky-50/50 to-indigo-50/40 shadow-md ring-2 ring-sky-300/70 scale-[1.01]'
              : 'border-slate-200/90 bg-white hover:border-sky-300 hover:bg-sky-50/20 hover:shadow-md hover:-translate-y-0.5'
          }`}
          title="Click to view all applications run during this timing"
        >
          {/* Top accent glow line when active */}
          {isTimingMode && (
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-400 via-indigo-500 to-sky-600" />
          )}

          <div>
            {/* Header: Icon + Title + Status Pill */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105 ${
                  isTimingMode
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-sky-50 text-sky-600 border border-sky-200/60'
                }`}>
                  <svg className="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-900 truncate">
                  Total Screen Time
                </span>
              </div>

              <span className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1 transition-all ${
                isTimingMode
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-sky-50 text-sky-700 border border-sky-200/60 group-hover:bg-sky-100 group-hover:border-sky-300'
              }`}>
                {isTimingMode && <span className="size-1.5 rounded-full bg-white animate-pulse" />}
                <span>{isTimingMode ? '✓ Active View' : 'Tap for Timing →'}</span>
              </span>
            </div>

            {/* Metric Value */}
            <div className="mt-3.5 flex items-baseline gap-2 flex-wrap">
              <span className="text-3xl sm:text-[32px] font-extrabold tracking-tight text-slate-900">
                {formatDuration(totalSecs)}
              </span>
              {limitMins && (
                <span className="text-xs font-semibold text-slate-500 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200/60">
                  / {Math.floor(limitMins / 60)}h {limitMins % 60 ? `${limitMins % 60}m` : ''}
                </span>
              )}
            </div>
          </div>

          {/* Progress Bar & Budget */}
          {limitSecs && totalSecs !== null ? (
            <div className="mt-3.5">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100/90 p-0.5 border border-slate-200/70 shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-500 shadow-xs ${getProgressColor(percentUsed)}`}
                  style={{ width: `${percentUsed}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-600">
                <span>{percentUsed}% budget</span>
                {isOverLimit && (
                  <span className="inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200/80 text-[10px]">
                    Limit reached
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3.5 flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="size-1.5 rounded-full bg-slate-300" />
              <span>No daily budget limit configured</span>
            </div>
          )}

          {/* Bottom Footer Info */}
          <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-sky-700">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="size-1.5 rounded-full bg-sky-500" />
              {(data?.appUsage || []).filter((a) => (a.durationSeconds || 0) > 0).length} apps run
            </span>
            <span className="group-hover:underline flex items-center gap-0.5">
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
          className={`group relative text-left rounded-2xl border transition-all duration-300 p-4 sm:p-5 flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 overflow-hidden ${
            !isTimingMode
              ? 'border-violet-500 bg-gradient-to-br from-white via-violet-50/50 to-purple-50/40 shadow-md ring-2 ring-violet-300/70 scale-[1.01]'
              : 'border-slate-200/90 bg-white hover:border-violet-300 hover:bg-violet-50/20 hover:shadow-md hover:-translate-y-0.5'
          }`}
          title="Click to inspect how many times each app was opened"
        >
          {/* Top accent glow line when active */}
          {!isTimingMode && (
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-violet-400 via-purple-500 to-indigo-600" />
          )}

          <div>
            {/* Header: Icon + Title + Status Pill */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105 ${
                  !isTimingMode
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'bg-violet-50 text-violet-600 border border-violet-200/60'
                }`}>
                  <svg className="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="3" />
                    <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" />
                    <path d="M9 7h6" />
                  </svg>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-violet-900 truncate">
                  Mobile Pickups &amp; Opens
                </span>
              </div>

              <span className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1 transition-all ${
                !isTimingMode
                  ? 'bg-violet-600 text-white shadow-xs'
                  : 'bg-violet-50 text-violet-700 border border-violet-200/60 group-hover:bg-violet-100 group-hover:border-violet-300'
              }`}>
                {!isTimingMode && <span className="size-1.5 rounded-full bg-white animate-pulse" />}
                <span>{!isTimingMode ? '✓ Active View' : 'Tap for Opens →'}</span>
              </span>
            </div>

            {/* Metric Value */}
            <div className="mt-3.5 flex items-baseline gap-2">
              <span className="text-3xl sm:text-[32px] font-extrabold tracking-tight text-slate-900">
                {deviceOpens}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                times opened
              </span>
            </div>
          </div>

          <div className="mt-3">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Number of times the phone was unlocked &amp; active today.
            </p>
            <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-violet-700">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="size-1.5 rounded-full bg-violet-500" />
                {totalAppOpens} app opens
              </span>
              <span className="group-hover:underline flex items-center gap-0.5">
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
          className={`group relative text-left rounded-2xl border transition-all duration-300 p-4 sm:p-5 flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 overflow-hidden ${
            !isTimingMode
              ? 'border-amber-500 bg-gradient-to-br from-white via-amber-50/50 to-orange-50/40 shadow-md ring-2 ring-amber-300/70 scale-[1.01]'
              : 'border-slate-200/90 bg-white hover:border-amber-300 hover:bg-amber-50/20 hover:shadow-md hover:-translate-y-0.5'
          }`}
          title="Click to view app launch frequencies"
        >
          {/* Top accent glow line when active */}
          {!isTimingMode && (
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-600" />
          )}

          <div>
            {/* Header: Icon + Title + Status Pill */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105 ${
                  !isTimingMode
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-600 border border-amber-200/60'
                }`}>
                  <svg className="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="2" />
                    <rect x="14" y="3" width="7" height="7" rx="2" />
                    <rect x="14" y="14" width="7" height="7" rx="2" />
                    <rect x="3" y="14" width="7" height="7" rx="2" />
                  </svg>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 truncate">
                  Total App Launches
                </span>
              </div>

              <span className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1 transition-all ${
                !isTimingMode
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-700 border border-amber-200/60 group-hover:bg-amber-100 group-hover:border-amber-300'
              }`}>
                {!isTimingMode && <span className="size-1.5 rounded-full bg-white animate-pulse" />}
                <span>{!isTimingMode ? '✓ Active View' : 'Tap for Opens →'}</span>
              </span>
            </div>

            {/* Metric Value */}
            <div className="mt-3.5 flex items-baseline gap-2">
              <span className="text-3xl sm:text-[32px] font-extrabold tracking-tight text-slate-900">
                {totalAppOpens}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                app opens
              </span>
            </div>
          </div>

          <div className="mt-3">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Total times applications were opened or switched into today.
            </p>
            <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-amber-700">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="size-1.5 rounded-full bg-amber-500" />
                {(data?.appUsage || []).filter((a) => (a.openCount || 0) > 0).length} apps opened
              </span>
              <span className="group-hover:underline flex items-center gap-0.5">
                {!isTimingMode ? 'Showing frequencies' : 'Tap to show frequencies →'}
              </span>
            </div>
          </div>
        </button>

        {/* Metric 4: Data Freshness & Sync */}
        <div className="relative rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs flex flex-col justify-between overflow-hidden hover:border-slate-300 hover:shadow-md transition-all duration-300">
          {/* Subtle top accent */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-sky-500" />

          <div>
            {/* Header: Icon + Title */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 shadow-xs">
                <svg className="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
                </svg>
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 truncate">
                Device Sync &amp; Freshness
              </span>
            </div>

            <div className="mt-3.5 text-xs space-y-2 text-slate-700">
              {data?.dataFreshness ? (
                <>
                  <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50/90 border border-emerald-200/70 px-2.5 py-1.5 text-xs">
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        data.dataFreshness.isStale ? 'bg-amber-400' : 'bg-emerald-400'
                      }`} />
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${
                        data.dataFreshness.isStale ? 'bg-amber-500' : 'bg-emerald-500'
                      }`} />
                    </span>
                    <span className="font-bold text-slate-800">
                      {data.dataFreshness.isStale ? 'Stale' : 'Live & Fresh'} • {data.dataFreshness.reportingDeviceName || 'Paired Device'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <svg className="size-3 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 15 13" />
                    </svg>
                    <span>Timestamp: {new Date(data.dataFreshness.lastReportedAt).toLocaleTimeString()}</span>
                  </p>
                </>
              ) : (
                <p className="text-slate-400 italic text-xs py-1">No device reports received for this date.</p>
              )}
            </div>
          </div>

          <div className="mt-3.5 pt-2.5 border-t border-slate-100 text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
            <svg className="size-3.5 text-emerald-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <span className="truncate">
              Source: {data?.source === 'measured' ? 'Measured on-device via Android UsageStats' : 'Awaiting device sync'}
            </span>
          </div>
        </div>
      </div>

      {/* App Breakdown Section */}
      <div id="app-breakdown-section" className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-6 shadow-xs transition-all duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              isTimingMode
                ? 'bg-sky-50 text-sky-600 border border-sky-200/60'
                : 'bg-violet-50 text-violet-600 border border-violet-200/60'
            }`}>
              {isTimingMode ? (
                <svg className="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              ) : (
                <svg className="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="3" />
                  <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" />
                  <path d="M9 7h6" />
                </svg>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm sm:text-base font-bold text-slate-900">
                  {isTimingMode
                    ? 'Application Usage & Screen Time Breakdown'
                    : 'Application Launch Frequency & Open Counts'}
                </h4>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  isTimingMode
                    ? 'bg-sky-100 text-sky-800 border border-sky-200/70'
                    : 'bg-violet-100 text-violet-800 border border-violet-200/70'
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
          </div>

          {/* Setting Switcher: Timing vs App Open */}
          <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 text-xs self-start sm:self-auto shadow-inner">
            <button
              type="button"
              onClick={() => setActiveMetric('screenTime')}
              aria-label="Switch to Timing view"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                isTimingMode
                  ? 'bg-white text-sky-700 shadow-xs border border-slate-200/60'
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
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                !isTimingMode
                  ? 'bg-white text-violet-700 shadow-xs border border-slate-200/60'
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

              const cleanName = formatAppDisplayName(app.appName, app.packageName);

              return (
                <div key={app.packageName || cleanName} className="py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 -mx-2 px-2.5 rounded-xl transition-colors">
                  {/* App Monogram Icon */}
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-2xs border ${
                    isTimingMode
                      ? 'bg-gradient-to-br from-sky-50 to-indigo-50/60 text-sky-700 border-sky-200/60'
                      : 'bg-gradient-to-br from-violet-50 to-purple-50/60 text-violet-700 border-violet-200/60'
                  }`}>
                    {cleanName.charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-slate-900 truncate text-[13px]">{cleanName}</span>
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

                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100/90 border border-slate-200/60 p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
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

      {/* Permanent Historical Data Retention Guarantee Banner */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50/80 via-white to-sky-50/40 p-4 text-xs text-slate-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <span className="text-xl select-none">💾</span>
          <div>
            <p className="font-bold text-slate-900">Permanent Historical Record Guarantee</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Uninstalling or disconnecting the companion Android app or Chrome extension never deletes historical usage or activity logs. All past metrics remain permanently accessible.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span>History Retained</span>
        </div>
      </div>
    </div>
  );
}
