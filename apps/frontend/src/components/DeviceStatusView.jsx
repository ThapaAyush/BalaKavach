export default function DeviceStatusView({
  devices,
  activeChild,
  policyVersion = 1,
  onRequestPairing,
  onRevokeDevice,
  revokingId,
}) {
  const childDevices = activeChild
    ? devices.filter((d) => d.childProfileId === activeChild.id)
    : devices;

  function renderSyncBadge(device) {
    if (device.pairingStatus === 'revoked') {
      return (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-200">
          Revoked
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
          <h3 className="text-base sm:text-lg font-bold text-slate-900">
            Paired Devices: {activeChild ? activeChild.displayName : 'All Devices'}
          </h3>
          <p className="text-xs text-slate-500">
            Track device connectivity, last heartbeats, and policy sync states.
          </p>
        </div>
        {activeChild && (
          <button
            type="button"
            onClick={() => onRequestPairing(activeChild)}
            className="w-full sm:w-auto rounded-xl bg-sky-600 px-4 py-2.5 sm:py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 transition text-center justify-center"
          >
            Pair New Device
          </button>
        )}
      </div>

      {childDevices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center space-y-3">
          <p className="text-xs text-slate-500">No paired devices found for this profile.</p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <a
              href="/balakavach-companion.apk"
              download="balakavach-companion.apk"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 transition"
            >
              <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span>Download Android App (8.6 MB)</span>
            </a>
            <a
              href="/balakavach-chrome-extension.zip"
              download="balakavach-chrome-extension.zip"
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-sky-500 transition"
            >
              <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span>Download Chrome Extension (ZIP)</span>
            </a>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {childDevices.map((device) => {
            const isRevoked = device.pairingStatus === 'revoked';
            const isStale = device.lastSeenAt
              ? (Date.now() - new Date(device.lastSeenAt).getTime()) > (24 * 60 * 60 * 1000)
              : true;

            return (
              <div
                key={device.id}
                className="rounded-2xl border border-slate-200/90 bg-slate-50/50 hover:bg-slate-50/90 p-5 flex flex-col justify-between space-y-3.5 shadow-xs transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{device.name}</h4>
                      <span className="inline-block rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] uppercase font-mono text-slate-600 mt-1 shadow-2xs">
                        {device.platform}
                      </span>
                    </div>
                    {renderSyncBadge(device)}
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                    <p>
                      Paired: <span className="font-medium text-slate-800">{new Date(device.pairedAt).toLocaleDateString()}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${!isRevoked && !isStale && device.lastSeenAt ? 'bg-emerald-500 ring-2 ring-emerald-100' : 'bg-slate-400'}`} />
                      Last Heartbeat: <span className="font-medium text-slate-800">{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never'}</span>
                    </p>
                    {device.lastPolicyAckAt && (
                      <p className="text-[11px] text-slate-500">
                        Last Policy Ack: {new Date(device.lastPolicyAckAt).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>

                {!isRevoked && (
                  <div className="pt-3 border-t border-slate-200/80 flex justify-end">
                    <button
                      type="button"
                      disabled={revokingId === device.id}
                      onClick={() => onRevokeDevice(device)}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 shadow-2xs transition disabled:opacity-50"
                    >
                      {revokingId === device.id ? 'Revoking…' : 'Revoke Device'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
