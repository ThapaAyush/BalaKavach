import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '../lib/api.js';

export default function PolicyManager({ child, onPolicyVersionChange, onPolicySaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [dailyLimitMinutes, setDailyLimitMinutes] = useState('');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState('21:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('07:00');
  const [quietHoursDays, setQuietHoursDays] = useState([
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  ]);
  const [webRestrictionsEnabled, setWebRestrictionsEnabled] = useState(false);
  const [blockedDomains, setBlockedDomains] = useState([]);
  const [newDomainInput, setNewDomainInput] = useState('');
  const [policyVersion, setPolicyVersion] = useState(1);

  const ALL_DAYS = [
    { id: 'monday', label: 'Mon' },
    { id: 'tuesday', label: 'Tue' },
    { id: 'wednesday', label: 'Wed' },
    { id: 'thursday', label: 'Thu' },
    { id: 'friday', label: 'Fri' },
    { id: 'saturday', label: 'Sat' },
    { id: 'sunday', label: 'Sun' },
  ];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    apiGet(`/children/${child.id}/policy`)
      .then((data) => {
        if (!active) return;
        const p = data?.policy;
        if (p) {
          const ver = p.version || 1;
          setPolicyVersion(ver);
          onPolicyVersionChange?.(ver);
          setDailyLimitMinutes(p.screenTime?.dailyLimitMinutes ?? '');
          setQuietHoursEnabled(p.screenTime?.quietHours?.enabled ?? false);
          setQuietHoursStart(p.screenTime?.quietHours?.start ?? '21:00');
          setQuietHoursEnd(p.screenTime?.quietHours?.end ?? '07:00');
          setQuietHoursDays(p.screenTime?.quietHours?.days ?? ALL_DAYS.map((d) => d.id));
          setWebRestrictionsEnabled(p.webRestrictions?.enabled ?? false);
          setBlockedDomains(p.webRestrictions?.blockedDomains ?? []);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Failed to load policy.');
        setLoading(false);
      });

    return () => { active = false; };
  }, [child.id]);

  function toggleDay(dayId) {
    if (quietHoursDays.includes(dayId)) {
      if (quietHoursDays.length === 1) return; // Keep at least one day
      setQuietHoursDays(quietHoursDays.filter((d) => d !== dayId));
    } else {
      setQuietHoursDays([...quietHoursDays, dayId]);
    }
  }

  function handleAddDomain(e) {
    e.preventDefault();
    const trimmed = newDomainInput.trim().toLowerCase();
    if (!trimmed) return;
    if (blockedDomains.includes(trimmed)) {
      setNewDomainInput('');
      return;
    }
    if (blockedDomains.length >= 100) {
      setError('Maximum 100 blocked domains reached.');
      return;
    }
    setBlockedDomains([...blockedDomains, trimmed]);
    setNewDomainInput('');
  }

  function handleRemoveDomain(domainToRemove) {
    setBlockedDomains(blockedDomains.filter((d) => d !== domainToRemove));
  }

  async function handleSavePolicy(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const payload = {
      screenTime: {
        dailyLimitMinutes: dailyLimitMinutes === '' ? null : parseInt(dailyLimitMinutes, 10),
        quietHours: {
          enabled: quietHoursEnabled,
          start: quietHoursStart,
          end: quietHoursEnd,
          days: quietHoursDays,
        },
      },
      webRestrictions: {
        enabled: webRestrictionsEnabled,
        blockedDomains,
      },
    };

    try {
      const data = await apiPut(`/children/${child.id}/policy`, payload);
      const ver = data.policy.version;
      setPolicyVersion(ver);
      onPolicyVersionChange?.(ver);
      setSuccessMessage(`Policy saved successfully (Version ${ver}).`);
      onPolicySaved?.(data.policy);
    } catch (err) {
      setError(err.message || 'Failed to save policy.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="py-6 text-center text-sm text-zinc-400">
        Loading rules & schedules for {child.displayName}…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Rules & Schedules: {child.displayName}</h3>
          <p className="text-xs text-zinc-400">Configure screen-time budgets, quiet periods, and desktop web restrictions.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-400 border border-indigo-500/20">
            Policy v{policyVersion}
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {successMessage && (
        <div role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSavePolicy} className="space-y-6">
        {/* Daily Screen Time Budget */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-4">
          <label htmlFor="dailyLimitMinutes" className="block text-sm font-medium text-zinc-200">
            Daily Screen-Time Limit (Minutes)
          </label>
          <p className="mt-1 text-xs text-zinc-400">
            Set maximum daily screen time. Leave blank for unconstrained allowance.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <input
              id="dailyLimitMinutes"
              type="number"
              min="1"
              max="1440"
              placeholder="e.g. 120 (2 hours)"
              value={dailyLimitMinutes}
              onChange={(e) => setDailyLimitMinutes(e.target.value)}
              className="w-48 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
            {dailyLimitMinutes && (
              <span className="text-xs text-zinc-400">
                ≈ {(parseInt(dailyLimitMinutes, 10) / 60).toFixed(1)} hours/day
              </span>
            )}
          </div>
        </div>

        {/* Quiet Hours / Bedtime */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="block text-sm font-medium text-zinc-200">Quiet Hours / Bedtime</span>
              <p className="text-xs text-zinc-400">Designate quiet windows (e.g. overnight sleep or study hours).</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={quietHoursEnabled}
                onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-zinc-700 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          {quietHoursEnabled && (
            <div className="mt-4 space-y-4 border-t border-zinc-800/60 pt-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label htmlFor="quietStart" className="block text-xs font-medium text-zinc-400">Starts At</label>
                  <input
                    id="quietStart"
                    type="time"
                    value={quietHoursStart}
                    onChange={(e) => setQuietHoursStart(e.target.value)}
                    className="mt-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="quietEnd" className="block text-xs font-medium text-zinc-400">Ends At</label>
                  <input
                    id="quietEnd"
                    type="time"
                    value={quietHoursEnd}
                    onChange={(e) => setQuietHoursEnd(e.target.value)}
                    className="mt-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-zinc-400 mb-2">Active Days</span>
                <div className="flex flex-wrap gap-2">
                  {ALL_DAYS.map((day) => {
                    const active = quietHoursDays.includes(day.id);
                    return (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => toggleDay(day.id)}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                          active
                            ? 'bg-indigo-600 text-white'
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Website Restrictions (Desktop Chrome) */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="block text-sm font-medium text-zinc-200">Website Blocklist (Desktop Chrome)</span>
              <p className="text-xs text-zinc-400">Enforced top-level HTTP(S) blocklist for Chrome desktop profiles via the KidsGuard extension.</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={webRestrictionsEnabled}
                onChange={(e) => setWebRestrictionsEnabled(e.target.checked)}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-zinc-700 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
            <strong>Platform Boundary Notice:</strong> Website filtering is actively enforced on Desktop Chrome via the KidsGuard Extension. On ordinary Android devices without a VPN (which KidsGuard strictly avoids for privacy and stability), website blocking is not claimed or active.
          </div>

          {webRestrictionsEnabled && (
            <div className="mt-4 space-y-3 border-t border-zinc-800/60 pt-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. tiktok.com, instagram.com"
                  value={newDomainInput}
                  onChange={(e) => setNewDomainInput(e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddDomain}
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
                >
                  Add Domain
                </button>
              </div>

              {blockedDomains.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  {blockedDomains.map((domain) => (
                    <span
                      key={domain}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/80 px-3 py-1 text-xs text-zinc-200"
                    >
                      {domain}
                      <button
                        type="button"
                        onClick={() => handleRemoveDomain(domain)}
                        className="text-zinc-400 hover:text-rose-400"
                        title={`Remove ${domain}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 italic">No blocked domains added yet.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? 'Saving Policy…' : 'Save Rules & Policy'}
          </button>
        </div>
      </form>
    </div>
  );
}
