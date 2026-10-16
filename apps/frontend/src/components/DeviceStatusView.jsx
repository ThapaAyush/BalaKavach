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
        <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-400 border border-rose-500/20">
          Revoked
        </span>
      );
    }

    const ackVer = device.acknowledgedPolicyVersion || 0;
    if (ackVer >= policyVersion) {
      return (
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
          In Sync (v{ackVer})
        </span>
      );
    }

    return (
      <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-400 border border-amber-500/20">
        Sync Pending (v{ackVer} / v{policyVersion})
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Paired Devices: {activeChild ? activeChild.displayName : 'All Devices'}
          </h3>
          <p className="text-xs text-zinc-400">
            Track device connectivity, last heartbeats, and policy sync states.
          </p>
        </div>
        {activeChild && (
          <button
            type="button"
            onClick={() => onRequestPairing(activeChild)}
            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition"
          >
            Pair New Device
          </button>
        )}
      </div>

      {childDevices.length === 0 ? (
        <p className="text-xs text-zinc-400 italic py-4">No paired devices found for this profile.</p>
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
                className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-white">{device.name}</h4>
                      <span className="inline-block rounded bg-zinc-800 px-2 py-0.5 text-[10px] uppercase font-mono text-zinc-400 mt-1">
                        {device.platform}
                      </span>
                    </div>
                    {renderSyncBadge(device)}
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-zinc-400">
                    <p>
                      Paired: {new Date(device.pairedAt).toLocaleDateString()}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${!isRevoked && !isStale && device.lastSeenAt ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                      Last Heartbeat: {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never'}
                    </p>
                    {device.lastPolicyAckAt && (
                      <p className="text-[11px] text-zinc-500">
                        Last Policy Ack: {new Date(device.lastPolicyAckAt).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>

                {!isRevoked && (
                  <div className="pt-2 border-t border-zinc-800/60 flex justify-end">
                    <button
                      type="button"
                      disabled={revokingId === device.id}
                      onClick={() => onRevokeDevice(device)}
                      className="rounded px-2.5 py-1 text-xs font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition disabled:opacity-50"
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
