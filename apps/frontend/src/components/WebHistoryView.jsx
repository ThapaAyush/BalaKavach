import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiGet } from '../lib/api.js';

function formatTimestamp(isoString) {
  if (!isoString) return 'Unknown time';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return isoString;
  }
}

function getCategoryMeta(category, isBlocked) {
  if (isBlocked) {
    return {
      label: 'Blocked',
      icon: '🛡️',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200/80',
    };
  }
  switch (category) {
    case 'education':
      return {
        label: 'Education',
        icon: '📚',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      };
    case 'video':
      return {
        label: 'Video',
        icon: '🎬',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/80',
      };
    case 'search':
      return {
        label: 'Search',
        icon: '🔍',
        badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
      };
    case 'social':
      return {
        label: 'Social',
        icon: '💬',
        badgeClass: 'bg-purple-50 text-purple-700 border-purple-200/80',
      };
    default:
      return {
        label: 'General Web',
        icon: '🌐',
        badgeClass: 'bg-slate-50 text-slate-700 border-slate-200/80',
      };
  }
}

export default function WebHistoryView({ child, onNavigateToRules }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyData, setHistoryData] = useState({ visits: [], totalCount: 0 });
  const [summaryData, setSummaryData] = useState(null);
  const [devicesData, setDevicesData] = useState([]);
  const [error, setError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  // Filters
  const [dateFilter, setDateFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'safe' | 'blocked'
  const [selectedDomain, setSelectedDomain] = useState('all');

  const childId = child?.id || child?._id;

  const loadHistory = useCallback(async (isSilent = false) => {
    if (!childId) return;
    if (!isSilent) setRefreshing(true);
    try {
      const queryParams = new URLSearchParams();
      if (dateFilter) queryParams.set('date', dateFilter);
      if (selectedDomain && selectedDomain !== 'all') queryParams.set('domain', selectedDomain);
      if (searchQuery.trim()) queryParams.set('search', searchQuery.trim());
      queryParams.set('limit', '100');

      const [historyRes, summaryRes, devicesRes] = await Promise.all([
        apiGet(`/children/${childId}/web-history?${queryParams.toString()}`),
        apiGet(`/children/${childId}/web-history/summary${dateFilter ? `?date=${dateFilter}` : ''}`),
        apiGet('/devices').catch(() => ({ devices: [] })),
      ]);

      if (historyRes) {
        setHistoryData(historyRes);
      }
      if (summaryRes) {
        setSummaryData(summaryRes);
      }
      if (devicesRes) {
        setDevicesData(devicesRes?.devices || (Array.isArray(devicesRes) ? devicesRes : []));
      }
      setLastSyncedAt(new Date());
      setError(null);
    } catch (err) {
      if (!isSilent) {
        setError(err.message || 'Failed to load Chrome browsing history.');
      }
    } finally {
      if (!isSilent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [childId, dateFilter, selectedDomain, searchQuery]);

  useEffect(() => {
    setLoading(true);
    loadHistory(false);

    // Continuous auto-sync: stream incoming Chrome browsing visits every 4 seconds in the background
    const interval = setInterval(() => {
      loadHistory(true);
    }, 4000);

    return () => clearInterval(interval);
  }, [loadHistory]);

  // Identify connected Chrome extension
  const chromeDevice = useMemo(() => {
    if (!Array.isArray(devicesData)) return null;
    return devicesData.find((d) =>
      (d.childProfileId === childId || d.childId === childId) &&
      (d.platform === 'linux' || d.platform === 'windows' || d.platform === 'macos' || d.name?.toLowerCase().includes('chrome'))
    );
  }, [devicesData, childId]);

  // Filtered visits
  const displayVisits = useMemo(() => {
    let items = historyData.visits || [];
    if (statusFilter === 'safe') {
      items = items.filter((item) => !item.isBlocked);
    } else if (statusFilter === 'blocked') {
      items = items.filter((item) => item.isBlocked);
    }
    return items;
  }, [historyData.visits, statusFilter]);

  if (!child) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
        Select a child profile to view their Chrome browsing history.
      </div>
    );
  }

  return (
    <div className="space-y-5" aria-label="Chrome Browsing History View">
      {/* Permanent Retention Guarantee & Connection Banner */}
      <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50/90 via-indigo-50/50 to-emerald-50/40 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white font-bold text-lg shadow-sm shrink-0">
              🌐
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">
                  {child.displayName}&apos;s Chrome Browsing Activity
                </h3>
                <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                  Permanent Retention Guarantee
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                Browsing records are stored securely on the BalaKavach server. Data remains permanently accessible even if the child uninstalls the Chrome extension.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => loadHistory(false)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-2xs hover:bg-sky-50 hover:border-sky-300 transition active:scale-95 disabled:opacity-50"
            >
              <svg
                className={`size-3.5 ${refreshing ? 'animate-spin text-sky-600' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              <span>{refreshing ? 'Syncing…' : 'Sync Latest'}</span>
            </button>
          </div>
        </div>

        {/* Companion Extension Sync Status */}
        <div className="mt-3.5 pt-3 border-t border-sky-200/50 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              <strong>Companion Status:</strong> {chromeDevice ? `Active (${chromeDevice.name || 'Chrome Browser'})` : 'Extension Companion Paired'}
            </span>
            {chromeDevice?.lastSeenAt && (
              <span className="text-slate-400">
                • Last active {formatTimestamp(chromeDevice.lastSeenAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/90 border border-emerald-300 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 shadow-2xs">
              <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
              Live Stream Active
            </span>
            <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
              Incoming Chrome visits stream automatically
            </span>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Visits</span>
            <span className="text-lg">🌐</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {summaryData?.totalVisits ?? historyData.totalCount ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Total logged page visits</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Blocked Attempts</span>
            <span className="text-lg">🛡️</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-rose-600">
            {summaryData?.blockedCount ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-rose-500 font-medium">18+ or restricted sites prevented</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unique Domains</span>
            <span className="text-lg">🧭</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-indigo-600">
            {summaryData?.uniqueDomainsCount ?? (summaryData?.topDomains?.length || 0)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Distinct web platforms</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Protection Mode</span>
            <span className="text-lg">🔒</span>
          </div>
          <p className="mt-2 text-base font-extrabold text-emerald-700 flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" />
            Active Protection
          </p>
          <p className="mt-1 text-[11px] text-slate-400">DNR local engine blocking</p>
        </div>
      </div>

      {/* Top Domains Pill Bar */}
      {summaryData?.topDomains && summaryData.topDomains.length > 0 && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Most Visited Websites
            </h4>
            {selectedDomain !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedDomain('all')}
                className="text-xs font-semibold text-sky-600 hover:text-sky-800"
              >
                Clear domain filter
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => setSelectedDomain('all')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                selectedDomain === 'all'
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Domains
            </button>
            {summaryData.topDomains.map((item) => (
              <button
                key={item.domain}
                type="button"
                onClick={() => setSelectedDomain(item.domain === selectedDomain ? 'all' : item.domain)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition border ${
                  selectedDomain === item.domain
                    ? 'border-sky-500 bg-sky-50 text-sky-800 font-bold'
                    : 'border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{item.domain}</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                  {item.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search, Date, and Filter Controls Bar */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by page title or URL…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-3.5 py-2 text-xs font-medium text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`rounded-lg px-2.5 py-1.5 font-semibold transition ${
              statusFilter === 'all'
                ? 'bg-white text-sky-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Activity
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('safe')}
            className={`rounded-lg px-2.5 py-1.5 font-semibold transition ${
              statusFilter === 'safe'
                ? 'bg-white text-emerald-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🟢 Permitted Only
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('blocked')}
            className={`rounded-lg px-2.5 py-1.5 font-semibold transition ${
              statusFilter === 'blocked'
                ? 'bg-white text-rose-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🔴 Blocked Attempts
          </button>
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            aria-label="Filter browsing history by date"
            className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:bg-white focus:outline-none"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="text-xs font-medium text-slate-500 hover:text-slate-700 underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700" role="alert">
          {error}
        </div>
      )}

      {/* Visits List / Timeline */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h4 className="font-extrabold text-slate-900 text-sm sm:text-base">
            Browsing History Stream
          </h4>
          <span className="text-xs font-semibold text-slate-500">
            Showing {displayVisits.length} of {historyData.totalCount} recorded visits
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <div className="inline-block size-6 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
            <p className="text-xs">Loading browsing history…</p>
          </div>
        ) : displayVisits.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="text-3xl">🧭</div>
            <p className="text-sm font-bold text-slate-700">No browsing visits found</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {searchQuery || selectedDomain !== 'all' || dateFilter || statusFilter !== 'all'
                ? 'Try adjusting your search query, filters, or selected date to view more browsing history.'
                : 'Connect the BalaKavach Chrome Companion extension on your child\'s device. Browsing visits will automatically appear here in real-time.'}
            </p>
            {onNavigateToRules && (
              <button
                type="button"
                onClick={onNavigateToRules}
                className="rounded-xl border border-sky-300 bg-sky-50 px-3.5 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-100 transition shadow-2xs"
              >
                Configure Web Rules &amp; Filters →
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100" aria-label="Web history items">
            {displayVisits.map((item) => {
              const meta = getCategoryMeta(item.category, item.isBlocked);
              return (
                <li
                  key={item.id || `${item.url}-${item.visitedAt}`}
                  className="py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 rounded-xl px-2.5 transition"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`flex size-9 sm:size-10 items-center justify-center rounded-xl text-base shrink-0 border ${meta.badgeClass}`}
                      title={meta.label}
                    >
                      {meta.icon}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-xs sm:text-sm truncate max-w-md" title={item.title}>
                          {item.title || item.domain || 'Web Page'}
                        </span>

                        {item.isBlocked ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 border border-rose-300 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-800">
                            <span>🛡️</span>
                            <span>Blocked by BalaKavach</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            <span>🟢</span>
                            <span>Safe</span>
                          </span>
                        )}

                        {item.visitCount > 1 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.2 text-[10px] font-semibold text-slate-600">
                            {item.visitCount} visits
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-sky-600 hover:text-sky-800 hover:underline truncate max-w-sm sm:max-w-md"
                          title={item.url}
                        >
                          {item.url}
                        </a>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>Domain: <strong>{item.domain}</strong></span>
                        {item.deviceName && (
                          <>
                            <span>•</span>
                            <span>Device: {item.deviceName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 shrink-0 text-right">
                    <span className="text-xs font-semibold text-slate-700">
                      {formatTimestamp(item.visitedAt)}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                      {meta.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
