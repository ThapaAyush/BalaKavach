import { useState, useEffect } from 'react';
import { downloadMeta as staticMeta } from '../lib/downloadMeta.js';
import { apiGet } from '../lib/api.js';

export default function DownloadsView({ isStandalone = false }) {
  const [meta, setMeta] = useState(staticMeta);
  const [syncStatus, setSyncStatus] = useState('latest');

  useEffect(() => {
    let isMounted = true;
    apiGet('/app-update')
      .then((data) => {
        if (!isMounted || !data) return;
        setMeta((prev) => ({
          updatedAt: data.updatedAt || prev.updatedAt,
          android: data.android
            ? {
                ...prev.android,
                ...data.android,
                downloadUrl:
                  data.android.directApkUrl ||
                  (data.android.downloadUrl && !data.android.downloadUrl.startsWith('/api/')
                    ? data.android.downloadUrl
                    : prev.android.downloadUrl) ||
                  '/balakavach-companion.apk',
              }
            : prev.android,
          extension: data.extension
            ? {
                ...prev.extension,
                ...data.extension,
                downloadUrl:
                  data.extension.directZipUrl ||
                  (data.extension.downloadUrl && !data.extension.downloadUrl.startsWith('/api/')
                    ? data.extension.downloadUrl
                    : prev.extension.downloadUrl) ||
                  '/balakavach-chrome-extension.zip',
              }
            : prev.extension,
        }));
        setSyncStatus('synced');
      })
      .catch(() => {
        // Keep static metadata gracefully if backend is offline/unreachable
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const androidDownloadHref =
    meta.android?.directApkUrl ||
    (meta.android?.downloadUrl && !meta.android.downloadUrl.startsWith('/api/')
      ? meta.android.downloadUrl
      : '/balakavach-companion.apk');

  const extensionDownloadHref =
    meta.extension?.directZipUrl ||
    (meta.extension?.downloadUrl && !meta.extension.downloadUrl.startsWith('/api/')
      ? meta.extension.downloadUrl
      : '/balakavach-chrome-extension.zip');
  return (
    <div className={`rounded-3xl border border-slate-200/90 bg-white/95 backdrop-blur-sm p-4 sm:p-6 lg:p-8 shadow-md shadow-slate-200/50 flex flex-col justify-between transition ${isStandalone ? 'max-w-4xl mx-auto' : 'w-full'}`}>
      <div>
        {/* Top Header inside Card */}
        <div className="mb-6 border-b border-slate-100 pb-5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-emerald-700">
              <span className="size-1.5 rounded-full bg-emerald-600" />
              Companion Apps
            </span>
            <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              Free &amp; Open
            </span>
          </div>
          <h2 className="mt-2.5 text-2xl sm:text-[26px] font-extrabold tracking-tight text-slate-900 leading-tight">
            Child Device Apps
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Install on your child's phone, tablet, or desktop to enable screen-time tracking and safety protection.
          </p>
        </div>

        {/* App Download Cards */}
        <div className="space-y-3.5">
          {/* Android Card */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/70 via-emerald-50/30 to-white p-4 transition hover:shadow-md hover:shadow-emerald-500/10 hover:border-emerald-300">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100/90 text-emerald-800 text-2xl shrink-0 shadow-2xs">
                📱
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900">Android App</h3>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded-md">
                    {meta.android.sizeFormatted}
                  </span>
                  <span className="text-[10px] font-bold text-teal-800 bg-teal-100/60 px-1.5 py-0.5 rounded-md">
                    {meta.android.versionName}
                  </span>
                  {syncStatus === 'synced' && (
                    <span className="text-[9.5px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/60 hidden sm:inline-block">
                      Live
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-medium text-slate-500 truncate">Phones &amp; tablets • Always latest version</p>
                {Array.isArray(meta.android.features) && meta.android.features.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {meta.android.features.slice(0, 3).map((feat) => (
                      <span key={feat} className="text-[9.5px] font-medium text-emerald-800 bg-emerald-100/70 px-1.5 py-0.5 rounded">
                        ✓ {feat}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <a
              href={`${androidDownloadHref}?v=${meta.android.versionHash || 'latest'}`}
              download={meta.android.fileName || 'balakavach-companion.apk'}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:from-emerald-500 hover:to-teal-500 hover:shadow-md transition active:scale-95 shrink-0 min-h-[40px]"
              id="download-apk-btn"
            >
              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download
            </a>
          </div>

          {/* Chrome Extension Card */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-sky-200/80 bg-gradient-to-r from-sky-50/70 via-sky-50/30 to-white p-4 transition hover:shadow-md hover:shadow-sky-500/10 hover:border-sky-300">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex size-11 items-center justify-center rounded-xl bg-sky-100/90 text-sky-800 text-2xl shrink-0 shadow-2xs">
                🌐
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900">Chrome Extension</h3>
                  <span className="text-[10px] font-bold text-sky-700 bg-sky-100/80 px-1.5 py-0.5 rounded-md">
                    {meta.extension.sizeFormatted}
                  </span>
                  <span className="text-[10px] font-bold text-indigo-800 bg-indigo-100/60 px-1.5 py-0.5 rounded-md">
                    {meta.extension.versionName}
                  </span>
                  {syncStatus === 'synced' && (
                    <span className="text-[9.5px] font-semibold text-sky-600 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200/60 hidden sm:inline-block">
                      Live
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-medium text-slate-500 truncate">Desktop browsing • Always latest version</p>
                {Array.isArray(meta.extension.features) && meta.extension.features.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {meta.extension.features.slice(0, 3).map((feat) => (
                      <span key={feat} className="text-[9.5px] font-medium text-sky-800 bg-sky-100/70 px-1.5 py-0.5 rounded">
                        ✓ {feat}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <a
              href={`${extensionDownloadHref}?v=${meta.extension.versionHash || 'latest'}`}
              download={meta.extension.fileName || 'balakavach-chrome-extension.zip'}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-sky-600/20 hover:from-sky-500 hover:to-indigo-500 hover:shadow-md transition active:scale-95 shrink-0 min-h-[40px]"
              id="download-extension-btn"
            >
              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download
            </a>
          </div>
        </div>

        {/* Installation Guide & Play Protect Notice */}
        <details className="mt-3.5 rounded-2xl border border-amber-200/90 bg-amber-50/60 p-3.5 text-xs text-amber-900 group transition hover:border-amber-300" open={isStandalone}>
          <summary className="font-bold cursor-pointer select-none flex items-center justify-between text-slate-800">
            <span className="flex items-center gap-1.5">
              <span>🛡️</span>
              <span>Play Protect blocked APK or Extension help?</span>
            </span>
            <span className="text-amber-700 text-xs font-semibold group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="mt-2.5 pt-2 border-t border-amber-200/70 space-y-2.5 text-slate-700">
            <div className="bg-white/80 rounded-xl p-3 border border-amber-100">
              <p className="font-bold text-emerald-900 flex items-center gap-1">
                <span>📱</span> Android Play Protect Fix:
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Because BalaKavach monitors screen time and apps locally, Google Play Protect's web sideload scanner blocks installation.
              </p>
              <ol className="list-decimal list-inside space-y-1 text-[11.5px] text-slate-700 mt-1.5 ml-0.5">
                <li>Open <strong>Google Play Store</strong> app on child's phone</li>
                <li>Tap your <strong>Profile picture</strong> (top right) → <strong>Play Protect</strong></li>
                <li>Tap the <strong>⚙️ Settings gear</strong> in top right</li>
                <li>Turn OFF <strong>"Scan apps with Play Protect"</strong></li>
                <li>Open Downloads &amp; tap <strong>balakavach-companion.apk</strong> to install!</li>
              </ol>
            </div>

            <div className="bg-white/80 rounded-xl p-3 border border-amber-100">
              <p className="font-bold text-sky-900 flex items-center gap-1">
                <span>🌐</span> Chrome Extension Setup:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-[11.5px] text-slate-700 mt-1.5 ml-0.5">
                <li>Extract downloaded <strong>balakavach-chrome-extension.zip</strong></li>
                <li>Open <code>chrome://extensions</code> in Chrome browser</li>
                <li>Toggle ON <strong>Developer mode</strong> (top right)</li>
                <li>Click <strong>Load unpacked</strong> &amp; select the extracted folder</li>
                <li>Open extension popup and enter pairing code!</li>
              </ol>
            </div>
          </div>
        </details>
      </div>

      {/* Feature Highlights */}
      <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2.5 text-center">
        <div className="rounded-2xl bg-gradient-to-b from-slate-50/80 to-white p-2.5 border border-slate-200/70 shadow-2xs">
          <span className="text-lg">⏱️</span>
          <p className="mt-1 font-bold text-slate-800 text-[11px]">Screen Time</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-b from-slate-50/80 to-white p-2.5 border border-slate-200/70 shadow-2xs">
          <span className="text-lg">🚫</span>
          <p className="mt-1 font-bold text-slate-800 text-[11px]">App Blocking</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-b from-slate-50/80 to-white p-2.5 border border-slate-200/70 shadow-2xs">
          <span className="text-lg">🛡️</span>
          <p className="mt-1 font-bold text-slate-800 text-[11px]">Web Filter</p>
        </div>
      </div>
    </div>
  );
}
