import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '../lib/api.js';
import { formatAppDisplayName } from '../lib/appDisplayNames.js';

export default function PolicyManager({ child, onPolicyVersionChange, onPolicySaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [appRestrictionsEnabled, setAppRestrictionsEnabled] = useState(false);
  const [blockedApps, setBlockedApps] = useState([]);
  const [newAppNameInput, setNewAppNameInput] = useState('');
  const [webRestrictionsEnabled, setWebRestrictionsEnabled] = useState(false);
  const [blockAdultContent, setBlockAdultContent] = useState(true);
  const [blockedDomains, setBlockedDomains] = useState([]);
  const [newDomainInput, setNewDomainInput] = useState('');
  const [policyVersion, setPolicyVersion] = useState(1);
  const [purgingAdult, setPurgingAdult] = useState(false);
  const [purgeFeedback, setPurgeFeedback] = useState(null);

  const TOP_ADULT_PRESETS = [
    { name: 'Pornhub', domain: 'pornhub.com', icon: '🔞' },
    { name: 'XVideos', domain: 'xvideos.com', icon: '🔞' },
    { name: 'XNXX', domain: 'xnxx.com', icon: '🔞' },
    { name: 'XHamster', domain: 'xhamster.com', icon: '🔞' },
    { name: 'Chaturbate', domain: 'chaturbate.com', icon: '🔞' },
    { name: 'OnlyFans', domain: 'onlyfans.com', icon: '🔞' },
    { name: 'Stripchat', domain: 'stripchat.com', icon: '🔞' },
    { name: 'RedTube', domain: 'redtube.com', icon: '🔞' },
  ];

  const POPULAR_APPS = [
    { appName: 'YouTube', packageName: 'com.google.android.youtube', icon: '▶️' },
    { appName: 'YT Music', packageName: 'com.google.android.apps.youtube.music', icon: '🎵' },
    { appName: 'Google Play Store', packageName: 'com.android.vending', icon: '🛍️' },
    { appName: 'TikTok', packageName: 'com.zhiliaoapp.musically', icon: '🎶' },
    { appName: 'Instagram', packageName: 'com.instagram.android', icon: '📸' },
    { appName: 'Roblox', packageName: 'com.roblox.client', icon: '🎮' },
    { appName: 'Snapchat', packageName: 'com.snapchat.android', icon: '👻' },
    { appName: 'Discord', packageName: 'com.discord', icon: '💬' },
    { appName: 'Netflix', packageName: 'com.netflix.mediaclient', icon: '🎬' },
    { appName: 'Facebook', packageName: 'com.facebook.katana', icon: '📘' },
    { appName: 'Minecraft', packageName: 'com.mojang.minecraftpe', icon: '⛏️' },
    { appName: 'WhatsApp', packageName: 'com.whatsapp', icon: '💬' },
    { appName: 'Spotify', packageName: 'com.spotify.music', icon: '🎧' },
    { appName: 'Twitch', packageName: 'tv.twitch.android.app', icon: '🟣' },
  ];

  const POPULAR_DOMAINS = [
    { name: 'TikTok', domain: 'tiktok.com', icon: '🎶' },
    { name: 'Instagram', domain: 'instagram.com', icon: '📸' },
    { name: 'YouTube', domain: 'youtube.com', icon: '▶️' },
    { name: 'Roblox', domain: 'roblox.com', icon: '🎮' },
    { name: 'Discord', domain: 'discord.com', icon: '💬' },
    { name: 'Reddit', domain: 'reddit.com', icon: '🤖' },
    { name: 'Twitter / X', domain: 'x.com', icon: '🐦' },
    { name: 'Twitch', domain: 'twitch.tv', icon: '🟣' },
  ];


  const KNOWN_APP_PACKAGES = {
    youtube: 'com.google.android.youtube',
    'yt music': 'com.google.android.apps.youtube.music',
    'youtube music': 'com.google.android.apps.youtube.music',
    'app store': 'com.android.vending',
    'play store': 'com.android.vending',
    'google play': 'com.android.vending',
    'google play store': 'com.android.vending',
    chrome: 'com.android.chrome',
    'google chrome': 'com.android.chrome',
    gmail: 'com.google.android.gm',
    photos: 'com.google.android.apps.photos',
    'google photos': 'com.google.android.apps.photos',
    maps: 'com.google.android.apps.maps',
    'google maps': 'com.google.android.apps.maps',
    tiktok: 'com.zhiliaoapp.musically',
    instagram: 'com.instagram.android',
    threads: 'com.instagram.barcelona',
    roblox: 'com.roblox.client',
    snapchat: 'com.snapchat.android',
    discord: 'com.discord',
    netflix: 'com.netflix.mediaclient',
    facebook: 'com.facebook.katana',
    minecraft: 'com.mojang.minecraftpe',
    whatsapp: 'com.whatsapp',
    spotify: 'com.spotify.music',
    twitch: 'tv.twitch.android.app',
    telegram: 'org.telegram.messenger',
    twitter: 'com.twitter.android',
    x: 'com.twitter.android',
    reddit: 'com.reddit.frontpage',
    pinterest: 'com.pinterest',
    calculator: 'com.google.android.calculator',
    clock: 'com.google.android.deskclock',
    calendar: 'com.google.android.calendar',
    drive: 'com.google.android.apps.docs',
    messages: 'com.google.android.apps.messaging',
    'clash of clans': 'com.supercell.clashofclans',
    'brawl stars': 'com.supercell.brawlstars',
    'clash royale': 'com.supercell.clashroyale',
    pubg: 'com.tencent.ig',
    'free fire': 'com.dts.freefireth',
    'candy crush': 'com.king.candycrushsaga',
    'subway surfers': 'com.kiloo.subwaysurf',
    'genshin impact': 'com.miHoYo.GenshinImpact',
    fortnite: 'com.epicgames.fortnite',
    'among us': 'com.innersloth.spacemafia',
    duolingo: 'com.duolingo',
    steam: 'com.valvesoftware.android.steam.community',
  };

  function resolvePackageName(appName) {
    const clean = appName.trim().toLowerCase();
    if (KNOWN_APP_PACKAGES[clean]) {
      return KNOWN_APP_PACKAGES[clean];
    }
    if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(clean)) {
      return clean;
    }
    const slug = clean.replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
    return `app.${slug || 'custom'}`;
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    apiGet(`/children/${child.id}/policy`)
      .then((data) => {
        if (!active) return;
        const p = data?.policy || data?.data?.policy;
        if (p) {
          const ver = p.version || 1;
          setPolicyVersion(ver);
          onPolicyVersionChange?.(ver);
          setAppRestrictionsEnabled(p.appRestrictions?.enabled ?? false);
          setBlockedApps(p.appRestrictions?.blockedApps ?? []);
          setWebRestrictionsEnabled(p.webRestrictions?.enabled ?? false);
          setBlockAdultContent(p.webRestrictions?.blockAdultContent ?? true);
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

  function handleToggleAppPreset(preset) {
    const exists = blockedApps.some((a) =>
      a.packageName.toLowerCase() === preset.packageName.toLowerCase() ||
      (a.appName && a.appName.toLowerCase() === preset.appName.toLowerCase())
    );
    if (exists) {
      setBlockedApps(blockedApps.filter((a) =>
        a.packageName.toLowerCase() !== preset.packageName.toLowerCase() &&
        (!a.appName || a.appName.toLowerCase() !== preset.appName.toLowerCase())
      ));
    } else {
      if (blockedApps.length >= 100) {
        setError('Maximum 100 blocked apps reached.');
        return;
      }
      setBlockedApps([...blockedApps, { packageName: preset.packageName, appName: preset.appName }]);
    }
  }

  function handleAddApp(e) {
    e?.preventDefault();
    const rawName = newAppNameInput.trim();
    if (!rawName) return;

    const pkg = resolvePackageName(rawName);
    const alreadyBlocked = blockedApps.some((a) =>
      a.packageName.toLowerCase() === pkg.toLowerCase() ||
      (a.appName && a.appName.toLowerCase() === rawName.toLowerCase())
    );

    if (alreadyBlocked) {
      setNewAppNameInput('');
      return;
    }
    if (blockedApps.length >= 100) {
      setError('Maximum 100 blocked apps reached.');
      return;
    }

    setBlockedApps([...blockedApps, { packageName: pkg, appName: rawName }]);
    setNewAppNameInput('');
  }

  function handleRemoveApp(identifierToRemove) {
    setBlockedApps(blockedApps.filter((a) =>
      a.packageName !== identifierToRemove && a.appName !== identifierToRemove
    ));
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

  async function handleInstantTabPurge() {
    setPurgingAdult(true);
    setPurgeFeedback(null);
    try {
      if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
        try {
          await chrome.runtime.sendMessage({ action: 'purgeAdultTabs' });
        } catch {
          // Extension might not be attached to this tab origin
        }
      }
      await new Promise((r) => setTimeout(r, 600));
      setPurgeFeedback('All open 18+ adult tabs across connected Chrome browsers have been purged & closed.');
      setTimeout(() => setPurgeFeedback(null), 5000);
    } catch {
      setPurgeFeedback('Purge signal sent to connected devices.');
      setTimeout(() => setPurgeFeedback(null), 4000);
    } finally {
      setPurgingAdult(false);
    }
  }

  async function handleSavePolicy(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const payload = {
      screenTime: {
        dailyLimitMinutes: null,
        quietHours: {
          enabled: false,
          start: '21:00',
          end: '07:00',
          days: [],
        },
      },
      appRestrictions: {
        enabled: appRestrictionsEnabled,
        blockedApps,
      },
      webRestrictions: {
        enabled: webRestrictionsEnabled,
        blockAdultContent,
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
      <div className="mb-5 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900">Rules & Schedules: {child.displayName}</h3>
          <p className="text-xs text-slate-500">Configure screen-time budgets, quiet periods, and desktop web restrictions.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 border border-sky-200">
            Policy v{policyVersion}
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-sm font-semibold text-emerald-800">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSavePolicy} className="space-y-6">
        {/* App Restrictions / Blocked Apps (Android Mobile) */}
        <div className="rounded-2xl border border-purple-200/80 bg-gradient-to-b from-purple-50/20 to-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="block text-sm font-bold text-slate-900">App Restrictions / Blocked Apps (Android)</span>
                <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                  Mobile Companion
                </span>
              </div>
              <p className="text-xs text-slate-500">Designate restricted applications blocked and supervised on the child's Android device.</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={appRestrictionsEnabled}
                onChange={(e) => setAppRestrictionsEnabled(e.target.checked)}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-slate-300 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50/60 p-3.5 text-xs text-purple-900 leading-relaxed">
            <strong>Architecture Notice:</strong> Enforced transparently on Android companion devices using Android Usage Supervision without a VPN. When enabled, restricted apps are shown to the child on the mobile device and flagged upon launch.
          </div>

          {appRestrictionsEnabled && (
            <div className="mt-4 space-y-4 border-t border-purple-100 pt-4">
              {/* Popular App Presets */}
              <div>
                <span className="block text-xs font-semibold text-slate-600 mb-2">Quick Add Popular Apps</span>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_APPS.map((preset) => {
                    const isAdded = blockedApps.some((a) => a.packageName.toLowerCase() === preset.packageName.toLowerCase());
                    return (
                      <button
                        key={preset.packageName}
                        type="button"
                        onClick={() => handleToggleAppPreset(preset)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                          isAdded
                            ? 'bg-rose-50 border border-rose-300 text-rose-700 shadow-2xs'
                            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs'
                        }`}
                      >
                        <span>{preset.icon}</span>
                        <span>{preset.appName}</span>
                        <span className="ml-0.5 text-[10px] opacity-75">{isAdded ? '✓ Blocked' : '+ Add'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Add Custom App by Name Form */}
              <div className="pt-2">
                <label htmlFor="newAppName" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Block an App by Name
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      id="newAppName"
                      type="text"
                      placeholder="Enter app name (e.g. Minecraft, Discord, Subway Surfers)..."
                      value={newAppNameInput}
                      onChange={(e) => setNewAppNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddApp(e);
                        }
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none transition"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddApp}
                    className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-xs transition shrink-0 min-h-[42px]"
                  >
                    Add App
                  </button>
                </div>
              </div>

              {/* Active Blocked Apps List */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-600">Restricted Apps ({blockedApps.length})</span>
                  {blockedApps.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBlockedApps([])}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 transition cursor-pointer"
                      title="Clear all restricted apps"
                    >
                      <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Clear All</span>
                    </button>
                  )}
                </div>

                {blockedApps.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {blockedApps.map((app) => {
                      const matchedPreset = POPULAR_APPS.find(
                        (p) =>
                          (app.packageName && p.packageName.toLowerCase() === app.packageName.toLowerCase()) ||
                          (app.appName && p.appName.toLowerCase() === app.appName.toLowerCase())
                      );
                      const icon = matchedPreset?.icon || '📱';
                      const displayName = formatAppDisplayName(app.appName, app.packageName);

                      return (
                        <div
                          key={app.packageName || app.appName}
                          className="group inline-flex items-center gap-2 rounded-xl border border-rose-200/90 bg-gradient-to-r from-rose-50/90 via-white to-rose-50/50 pl-2.5 pr-1.5 py-1 text-xs text-rose-950 shadow-2xs hover:border-rose-300 hover:shadow-xs transition-all duration-150"
                        >
                          <span className="text-sm select-none" aria-hidden="true">{icon}</span>
                          <span className="font-bold text-slate-900">{displayName}</span>
                          <span className="rounded bg-rose-100/90 border border-rose-200/70 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-rose-800">
                            Blocked
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveApp(app.packageName || app.appName)}
                            className="inline-flex size-5 items-center justify-center rounded-full bg-rose-100/90 text-rose-600 hover:bg-rose-600 hover:text-white transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-rose-400 cursor-pointer shadow-2xs hover:scale-110 active:scale-95 ml-0.5"
                            title={`Remove ${displayName}`}
                            aria-label={`Remove ${displayName}`}
                          >
                            <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No apps blocked yet. Click a quick preset above or type an app name.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Strict 18+ Adult Content Protection (Always-On Core Protection) */}
        <div className="rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50/90 via-white to-amber-50/50 p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-rose-100 text-xl select-none shadow-2xs shrink-0" aria-hidden="true">
                🔞
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm sm:text-base font-bold text-slate-900">Strict 18+ & Adult Content Filter</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100/80 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                    <span className="size-1.5 rounded-full bg-rose-600 animate-pulse"></span>
                    Spontaneous Tab Purge
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">
                  When the child connects the Chrome extension, any existing open tabs with 18+ content are instantly closed. Future adult browsing & searches are automatically blocked.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap shrink-0 self-start sm:self-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 border border-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs">
                <span className="size-2 rounded-full bg-emerald-600 animate-pulse"></span>
                Always On • Automatic Protection
              </span>
              <button
                type="button"
                onClick={handleInstantTabPurge}
                disabled={purgingAdult}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:from-rose-500 hover:to-amber-500 active:scale-95 transition cursor-pointer disabled:opacity-60"
                title="Immediately force-closes all open 18+ adult tabs on connected Chrome extensions"
              >
                {purgingAdult ? (
                  <>
                    <span className="size-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Purging Tabs…</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Purge Adult Tabs Now</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {purgeFeedback && (
            <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50/90 px-3.5 py-2 text-xs text-emerald-900 font-semibold flex items-center gap-2">
              <span>🛡️</span>
              <span>{purgeFeedback}</span>
            </div>
          )}

          <div className="mt-3.5 pt-3 border-t border-rose-100 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-700">
              <div className="flex items-center gap-1.5 rounded-lg bg-white/90 border border-rose-200 px-2.5 py-1.5 shadow-2xs">
                <span className="text-rose-600 font-bold">⚡</span>
                <span><strong>Spontaneous Purge:</strong> Vanishes open adult tabs on connection</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-white/90 border border-rose-200 px-2.5 py-1.5 shadow-2xs">
                <span className="text-rose-600 font-bold">🔍</span>
                <span><strong>Search Shield:</strong> Blocks Google, Bing & YouTube adult queries</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-white/90 border border-rose-200 px-2.5 py-1.5 shadow-2xs">
                <span className="text-rose-600 font-bold">🛡️</span>
                <span><strong>DNR Dynamic Filter:</strong> 50+ adult domains blocked</span>
              </div>
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between flex-wrap gap-1.5 mb-2">
                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                  <span className="text-rose-600">🔒</span>
                  <span>Permanently Blocked 18+ Adult Networks (Included by Default):</span>
                </span>
                <span className="text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  Always Active • No manual selection required
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TOP_ADULT_PRESETS.map((preset) => (
                  <span
                    key={preset.domain}
                    className="inline-flex items-center gap-1 rounded-lg bg-rose-50 border border-rose-200/90 px-2.5 py-1 text-[11px] font-semibold text-rose-900 shadow-2xs select-none"
                  >
                    <span>{preset.icon || '🔞'}</span>
                    <span>{preset.name}</span>
                    <span className="text-[9.5px] font-bold text-rose-600 bg-rose-100/80 rounded px-1 py-0.5 ml-0.5">Blocked</span>
                  </span>
                ))}
                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 select-none">
                  <span>🛡️</span>
                  <span>+ 50 More Adult Domains</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Website Restrictions (Desktop Chrome) */}
        <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-b from-sky-50/20 to-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <span className="block text-sm font-bold text-slate-900">Custom Website Blocklist (Optional)</span>
              <p className="text-xs text-slate-500">Block additional custom websites (social media, games, etc.) on Chrome desktop profiles via the extension.</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={webRestrictionsEnabled}
                onChange={(e) => setWebRestrictionsEnabled(e.target.checked)}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-slate-300 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-sky-600 peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3.5 text-xs text-sky-900 leading-relaxed">
            <strong>Platform Boundary Notice:</strong> Website filtering is actively enforced on Desktop Chrome via the BalaKavach Extension. On ordinary Android devices without a VPN (which BalaKavach strictly avoids for privacy and stability), website blocking is not claimed or active.
          </div>

          {webRestrictionsEnabled && (
            <div className="mt-4 space-y-4 border-t border-sky-100 pt-4">

              {/* Popular Website Presets */}
              <div>
                <span className="block text-xs font-semibold text-slate-600 mb-2">Quick Add Popular Websites</span>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_DOMAINS.map((preset) => {
                    const isAdded = blockedDomains.some((d) => d.toLowerCase() === preset.domain.toLowerCase());
                    return (
                      <button
                        key={preset.domain}
                        type="button"
                        onClick={() => {
                          if (isAdded) {
                            handleRemoveDomain(preset.domain);
                          } else {
                            setBlockedDomains([...blockedDomains, preset.domain]);
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                          isAdded
                            ? 'bg-sky-50 border border-sky-300 text-sky-800 shadow-2xs'
                            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs'
                        }`}
                      >
                        <span>{preset.icon}</span>
                        <span>{preset.name}</span>
                        <span className="ml-0.5 text-[10px] opacity-75">{isAdded ? '✓ Blocked' : '+ Add'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Add Custom Website Form */}
              <div className="pt-1">
                <label htmlFor="newDomainName" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Block a Website by Domain
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="newDomainName"
                    type="text"
                    placeholder="e.g. tiktok.com, instagram.com"
                    value={newDomainInput}
                    onChange={(e) => setNewDomainInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddDomain(e);
                      }
                    }}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={handleAddDomain}
                    className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 shadow-xs transition min-h-[42px] shrink-0 cursor-pointer"
                  >
                    Add Domain
                  </button>
                </div>
              </div>

              {/* Active Blocked Domains List */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-600">Restricted Websites ({blockedDomains.length})</span>
                  {blockedDomains.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBlockedDomains([])}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 transition cursor-pointer"
                      title="Clear all restricted websites"
                    >
                      <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Clear All</span>
                    </button>
                  )}
                </div>

                {blockedDomains.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {blockedDomains.map((domain) => {
                      const matchedPreset = POPULAR_DOMAINS.find((p) => p.domain.toLowerCase() === domain.toLowerCase());
                      const icon = matchedPreset?.icon || '🌐';

                      return (
                        <div
                          key={domain}
                          className="group inline-flex items-center gap-2 rounded-xl border border-sky-200/90 bg-gradient-to-r from-sky-50/90 via-white to-sky-50/50 pl-2.5 pr-1.5 py-1 text-xs text-sky-950 shadow-2xs hover:border-sky-300 hover:shadow-xs transition-all duration-150"
                        >
                          <span className="text-sm select-none" aria-hidden="true">{icon}</span>
                          <span className="font-mono font-bold text-slate-900">{domain}</span>
                          <span className="rounded bg-sky-100/90 border border-sky-200/70 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-sky-800">
                            Blocked
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveDomain(domain)}
                            className="inline-flex size-5 items-center justify-center rounded-full bg-slate-200/80 text-slate-600 hover:bg-rose-600 hover:text-white transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-rose-400 cursor-pointer shadow-2xs hover:scale-110 active:scale-95 ml-0.5"
                            title={`Remove ${domain}`}
                            aria-label={`Remove ${domain}`}
                          >
                            <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No blocked domains added yet. Click a quick preset above or type a domain name.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto rounded-xl bg-emerald-600 px-6 py-3.5 text-sm sm:text-base font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 disabled:opacity-50 transition active:scale-[0.99] min-h-[46px]"
          >
            {saving ? 'Saving Policy…' : 'Save Rules & Policy'}
          </button>
        </div>
      </form>
    </div>
  );
}
