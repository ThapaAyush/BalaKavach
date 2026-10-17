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
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
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
            className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 transition"
          >
            Pair New Device
          </button>
        )}
      </div>

      {childDevices.length === 0 ? (
        <p className="text-xs text-slate-500 italic py-4">No paired devices found for this profile.</p>
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
