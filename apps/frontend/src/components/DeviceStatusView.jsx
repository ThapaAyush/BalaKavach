import { useState } from 'react';
import { downloadMeta } from '../lib/downloadMeta.js';

export default function DeviceStatusView({
  devices,
  activeChild,
  policyVersion = 1,
  onRequestPairing,
  onRevokeDevice,
  revokingId,
}) {
  const [confirmRevokeDevice, setConfirmRevokeDevice] = useState(null);

  const childDevices = activeChild
    ? devices.filter((d) => d.childProfileId === activeChild.id)
    : devices;

  function isExtensionDevice(device) {
    const name = (device.name || '').toLowerCase();
    const plat = (device.platform || '').toLowerCase();
    return (
      plat === 'windows' ||
      plat === 'macos' ||
      plat === 'linux' ||
      name.includes('chrome') ||
      name.includes('extension') ||
      name.includes('browser')
    );
  }

  function renderSyncBadge(device) {
    if (device.pairingStatus === 'revoked' || Boolean(device.revokedAt)) {
      return (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-200">
          Revoked
        </span>
      );
    }

    if (device.pairingStatus === 'uninstalled' || Boolean(device.uninstalledAt)) {
      return (
        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
          Uninstalled (Data Retained)
        </span>
      );
    }

    const ackVer = device.acknowledgedPolicyVersion || 0;
    if (ackVer >= policyVersion) {
      return (
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
          In Sync (v{ackVer})
        </span>
      );
    }

    return (
      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
        Sync Pending (v{ackVer} / v{policyVersion})
      </span>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              Paired Devices: {activeChild ? activeChild.displayName : 'All Devices'}
            </h3>
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800">
              {childDevices.length} {childDevices.length === 1 ? 'device' : 'devices'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time companion connectivity, last heartbeats, and guaranteed historical data retention.
          </p>
        </div>
        {activeChild && (
          <button
            type="button"
            onClick={() => onRequestPairing(activeChild)}
            className="w-full sm:w-auto rounded-xl bg-sky-600 px-4 py-2.5 sm:py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 transition text-center justify-center cursor-pointer"
          >
            Pair New Device
          </button>
        )}
      </div>

      {/* Reassurance Banner */}
      <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3.5 text-xs text-sky-900 flex items-start gap-2.5">
        <span className="text-base select-none">🛡️</span>
        <div>
          <p className="font-semibold text-sky-950">Data Preservation Guarantee</p>
          <p className="text-sky-800/90 text-[11px] leading-relaxed mt-0.5">
            When a child connects an app or extension, their activity data syncs live. If they disconnect or uninstall the app or extension, <strong>their historical screen time, app launches, and browsing protection logs are permanently preserved</strong> and never removed.
          </p>
        </div>
      </div>

      {childDevices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center space-y-3">
          <p className="text-xs text-slate-500">No paired devices found for this profile.</p>
          <p className="text-[11px] text-slate-400">Install the companion app on your child&apos;s device and redeem a pairing code to begin live protection.</p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <a
              href={`${downloadMeta.android.downloadUrl}?v=${downloadMeta.android.versionHash}`}
              download={downloadMeta.android.fileName}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 transition"
            >
              <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span>Download Android App ({downloadMeta.android.sizeFormatted})</span>
            </a>
            <a
              href={`${downloadMeta.extension.downloadUrl}?v=${downloadMeta.extension.versionHash}`}
              download={downloadMeta.extension.fileName}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-sky-500 transition"
            >
              <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span>Download Chrome Extension ({downloadMeta.extension.sizeFormatted})</span>
            </a>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
          {childDevices.map((device) => {
            const isRevoked = device.pairingStatus === 'revoked' || Boolean(device.revokedAt);
            const isUninstalled = device.pairingStatus === 'uninstalled' || Boolean(device.uninstalledAt);
            const isInactive = isRevoked || isUninstalled;

            const lastSeenTime = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
            const isOnline = !isInactive && lastSeenTime > 0 && (Date.now() - lastSeenTime) < (30 * 60 * 1000);
            const isStale = !isInactive && !isOnline;

            const isExt = isExtensionDevice(device);

            return (
              <div
                key={device.id}
                className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between space-y-3.5 shadow-xs transition ${
                  isInactive
                    ? 'border-slate-200/70 bg-slate-50/40 opacity-95'
                    : isOnline
                    ? 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/30 via-white to-slate-50/40 shadow-sm'
                    : 'border-slate-200/90 bg-slate-50/50 hover:bg-slate-50/90'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-base select-none">{isExt ? '🌐' : '📱'}</span>
                        <h4 className="text-sm font-bold text-slate-900 break-words">{device.name}</h4>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="inline-block rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] uppercase font-mono text-slate-600 shadow-2xs">
                          {isExt ? 'Chrome Extension' : `${device.platform} App`}
                        </span>
                        {isOnline ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live &amp; Online
                          </span>
                        ) : isUninstalled ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md">
                            Uninstalled
                          </span>
                        ) : isRevoked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-200/80 px-2 py-0.5 rounded-md">
                            Revoked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            Offline
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {renderSyncBadge(device)}
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                    <p>
                      Paired: <span className="font-medium text-slate-800">{new Date(device.pairedAt).toLocaleDateString()}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${isOnline ? 'bg-emerald-500 ring-2 ring-emerald-100' : isStale ? 'bg-amber-400' : 'bg-slate-400'}`} />
                      Last Heartbeat: <span className="font-medium text-slate-800">{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never'}</span>
                    </p>
                    {device.lastPolicyAckAt && (
                      <p className="text-[11px] text-slate-500">
                        Last Rules Sync: {new Date(device.lastPolicyAckAt).toLocaleTimeString()}
                      </p>
                    )}
                    {device.lastScreenTimeReportAt && (
                      <p className="text-[11px] text-slate-500">
                        Last Screen Time Report: {new Date(device.lastScreenTimeReportAt).toLocaleTimeString()}
                      </p>
                    )}
                  </div>

                  {/* Informational Callout for Preserved Data */}
                  {isInactive ? (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white/90 p-2.5 text-[11px] text-slate-600 space-y-1">
                      <div className="flex items-center gap-1 text-slate-800 font-bold">
                        <span>🛡️</span>
                        <span>Historical Activity Preserved</span>
                      </div>
                      <p className="text-slate-500 leading-normal">
                        This companion {isExt ? 'extension' : 'app'} is {isUninstalled ? 'uninstalled' : 'revoked'}. All previously reported Chrome browsing history, daily screen time, app open counts, and enforced web rules remain completely preserved on your parent dashboard.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-100/60 p-2 text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-800">
                        {isExt ? '🌐 Web Protection:' : '⏱️ Screen Time Reporting:'}
                      </span>{' '}
                      {isExt ? 'Enforcing domain rules and safe browsing.' : 'Logging foreground usage, launches, and pickups.'}
                    </div>
                  )}
                </div>

                {!isRevoked && (
                  <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">
                      {isUninstalled ? 'Uninstalled by user' : 'Active companion enrollment'}
                    </span>
                    <button
                      type="button"
                      disabled={revokingId === device.id}
                      onClick={() => setConfirmRevokeDevice(device)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 hover:border-rose-300 shadow-2xs transition disabled:opacity-50 min-h-[36px] text-center cursor-pointer"
                    >
                      <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      <span>{revokingId === device.id ? 'Revoking…' : 'Revoke Device'}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal when revoking device */}
      {confirmRevokeDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <span className="flex size-10 items-center justify-center rounded-xl bg-rose-100 text-lg">⚠️</span>
              <div>
                <h4 className="text-base font-bold text-slate-900">Revoke Companion Access?</h4>
                <p className="text-xs text-slate-500">Device: {confirmRevokeDevice.name}</p>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-3 text-xs text-emerald-900">
              <p className="font-semibold text-emerald-950">✓ Your Data is Never Deleted</p>
              <p className="mt-0.5 text-emerald-800 text-[11px] leading-relaxed">
                Revoking access stops this companion from synchronizing rules or reporting new data. <strong>All past screen time reports, app launches, and activity logs remain permanently accessible in your dashboard.</strong>
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRevokeDevice(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Keep Active
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = confirmRevokeDevice;
                  setConfirmRevokeDevice(null);
                  onRevokeDevice(target);
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition shadow-xs cursor-pointer"
              >
                Confirm Revoke (Preserve Data)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
