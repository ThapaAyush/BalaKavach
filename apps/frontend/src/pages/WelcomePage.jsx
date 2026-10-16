import { useEffect, useRef, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../lib/api.js';
import PolicyManager from '../components/PolicyManager.jsx';
import ScreenTimeView from '../components/ScreenTimeView.jsx';
import DeviceStatusView from '../components/DeviceStatusView.jsx';

export default function WelcomePage() {
  const [health, setHealth] = useState({ state: 'loading', data: null });
  const [auth, setAuth] = useState({ state: 'checking', parent: null });
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formMessage, setFormMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [children, setChildren] = useState({ state: 'idle', items: [] });
  const [childDisplayName, setChildDisplayName] = useState('');
  const [childDateOfBirth, setChildDateOfBirth] = useState('');
  const [childMessage, setChildMessage] = useState(null);
  const [creatingChild, setCreatingChild] = useState(false);
  const [devices, setDevices] = useState({ state: 'idle', items: [] });
  const [pairingCode, setPairingCode] = useState(null);
  const [pairingAction, setPairingAction] = useState({ busyChildId: null, cancelling: false, message: null });
  const [deviceAction, setDeviceAction] = useState({ busyId: null, message: null });

  // Stage C Dashboard Tab and Child Selection States
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [activeTab, setActiveTab] = useState('screentime'); // 'screentime' | 'policy' | 'devices'
  const [confirmDeleteChildId, setConfirmDeleteChildId] = useState(null);
  const [deletingChild, setDeletingChild] = useState(false);

  const pairingAbortRef = useRef(null);
  const activePairingChildRef = useRef(null);
  const authStateRef = useRef(auth.state);
  authStateRef.current = auth.state;

  useEffect(() => {
    return () => {
      if (pairingAbortRef.current) {
        pairingAbortRef.current.abort();
        pairingAbortRef.current = null;
      }
      activePairingChildRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    apiGet('/health', { signal: controller.signal })
      .then((data) => setHealth({ state: 'available', data }))
      .catch((error) => {
        if (error.name !== 'AbortError') setHealth({ state: 'unavailable', data: null });
      });

    apiGet('/auth/me', { signal: controller.signal })
      .then((data) => setAuth({ state: 'authenticated', parent: data.parent }))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setAuth({ state: error.status === 401 ? 'signed-out' : 'unavailable', parent: null });
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (auth.state !== 'authenticated') {
      if (pairingAbortRef.current) {
        pairingAbortRef.current.abort();
        pairingAbortRef.current = null;
      }
      activePairingChildRef.current = null;
      setChildren({ state: 'idle', items: [] });
      setDevices({ state: 'idle', items: [] });
      setPairingCode(null);
      setPairingAction({ busyChildId: null, cancelling: false, message: null });
      setDeviceAction({ busyId: null, message: null });
      setSelectedChildId(null);
      return undefined;
    }

    const controller = new AbortController();
    setChildren({ state: 'loading', items: [] });
    setDevices({ state: 'loading', items: [] });

    apiGet('/children', { signal: controller.signal })
      .then((data) => {
        setChildren({ state: 'ready', items: data.children });
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        if (error.status === 401) {
          setAuth({ state: 'signed-out', parent: null });
          return;
        }
        setChildren({ state: 'error', items: [] });
      });

    apiGet('/devices', { signal: controller.signal })
      .then((data) => setDevices({ state: 'ready', items: data.devices }))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        if (error.status === 401) {
          setAuth({ state: 'signed-out', parent: null });
          return;
        }
        setDevices({ state: 'error', items: [] });
      });

    return () => controller.abort();
  }, [auth.state, auth.parent?.id]);

  useEffect(() => {
    if (!pairingCode || pairingCode.status !== 'active') return undefined;
    const remainingMs = new Date(pairingCode.expiresAt).getTime() - Date.now();
    if (remainingMs <= 0) {
      setPairingCode((curr) => (curr ? { ...curr, code: null, status: 'expired' } : null));
      return undefined;
    }
    const timer = setTimeout(() => {
      setPairingCode((curr) => (curr ? { ...curr, code: null, status: 'expired' } : null));
    }, remainingMs);
    return () => clearTimeout(timer);
  }, [pairingCode?.id, pairingCode?.expiresAt, pairingCode?.status]);

  async function loadDevices(signal) {
    setDevices((curr) => ({ ...curr, state: 'loading' }));
    try {
      const data = await apiGet('/devices', { signal });
      setDevices({ state: 'ready', items: data.devices });
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (error.status === 401) {
        setAuth({ state: 'signed-out', parent: null });
        return;
      }
      setDevices({ state: 'error', items: [] });
    }
  }

  async function submitCredentials(event) {
    event.preventDefault();
    setSubmitting(true);
    setFormMessage(null);

    try {
      if (mode === 'register') {
        await apiPost('/auth/register', { email, password });
        setMode('login');
        setPassword('');
        setFormMessage({ type: 'success', text: 'Registration request received. You can try signing in.' });
        return;
      }

      const data = await apiPost('/auth/login', { email, password });
      setAuth({ state: 'authenticated', parent: data.parent });
      setPassword('');
      setFormMessage(null);
    } catch (error) {
      setFormMessage({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    if (pairingAbortRef.current) {
      pairingAbortRef.current.abort();
      pairingAbortRef.current = null;
    }
    activePairingChildRef.current = null;
    setPairingCode(null);
    setSelectedChildId(null);
    setSubmitting(true);
    setFormMessage(null);

    try {
      await apiPost('/auth/logout', {});
      setAuth({ state: 'signed-out', parent: null });
    } catch (error) {
      setFormMessage({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function createChildProfile(event) {
    event.preventDefault();
    setCreatingChild(true);
    setChildMessage(null);

    try {
      const profile = await apiPost('/children', {
        displayName: childDisplayName,
        ...(childDateOfBirth ? { dateOfBirth: childDateOfBirth } : {}),
      });
      setChildren((current) => ({
        state: 'ready',
        items: [...current.items, profile.child],
      }));
      setChildDisplayName('');
      setChildDateOfBirth('');
      setChildMessage({ type: 'success', text: 'Child profile created.' });
    } catch (error) {
      setChildMessage({ type: 'error', text: error.message });
    } finally {
      setCreatingChild(false);
    }
  }

  async function deleteChildProfile(childId) {
    setDeletingChild(true);
    try {
      await apiDelete(`/children/${childId}`);
      setChildren((current) => {
        const remaining = current.items.filter((c) => c.id !== childId);
        if (selectedChildId === childId) {
          setSelectedChildId(null);
        }
        return {
          ...current,
          items: remaining,
        };
      });
      setDevices((curr) => ({
        ...curr,
        items: curr.items.filter((d) => d.childProfileId !== childId),
      }));
      setConfirmDeleteChildId(null);
      setChildMessage({ type: 'success', text: 'Child profile deleted.' });
    } catch (err) {
      setChildMessage({ type: 'error', text: err.message || 'Failed to delete child profile.' });
    } finally {
      setDeletingChild(false);
    }
  }

  async function requestPairingCode(child) {
    if (pairingAbortRef.current) {
      pairingAbortRef.current.abort();
      pairingAbortRef.current = null;
    }
    const controller = new AbortController();
    pairingAbortRef.current = controller;
    activePairingChildRef.current = child.id;

    setPairingAction({ busyChildId: child.id, cancelling: false, message: null });
    setPairingCode(null);

    try {
      const data = await apiPost(`/children/${child.id}/pairing-codes`, {}, { signal: controller.signal });
      if (
        controller.signal.aborted ||
        authStateRef.current !== 'authenticated' ||
        activePairingChildRef.current !== child.id
      ) {
        return;
      }
      setPairingCode({
        childId: child.id,
        childName: child.displayName,
        id: data.pairingCode.id,
        code: data.pairingCode.code,
        expiresAt: data.pairingCode.expiresAt,
        status: 'active',
      });
      setPairingAction({ busyChildId: null, cancelling: false, message: null });
    } catch (error) {
      if (
        error.name === 'AbortError' ||
        controller.signal.aborted ||
        authStateRef.current !== 'authenticated' ||
        activePairingChildRef.current !== child.id
      ) {
        return;
      }
      setPairingAction({ busyChildId: null, cancelling: false, message: { type: 'error', text: error.message } });
    } finally {
      if (pairingAbortRef.current === controller) {
        pairingAbortRef.current = null;
      }
    }
  }

  async function cancelPairingCode() {
    if (!pairingCode) return;
    const target = pairingCode;
    setPairingAction((curr) => ({ ...curr, cancelling: true, message: null }));
    try {
      await apiDelete(`/children/${target.childId}/pairing-codes/${target.id}`);
      if (authStateRef.current !== 'authenticated') return;
      setPairingCode(null);
      setPairingAction({ busyChildId: null, cancelling: false, message: { type: 'success', text: 'Pairing code cancelled.' } });
    } catch (error) {
      if (authStateRef.current !== 'authenticated') return;
      setPairingAction({ busyChildId: null, cancelling: false, message: { type: 'error', text: error.message } });
    }
  }

  async function revokeDevice(deviceId) {
    setDeviceAction({ busyId: deviceId, message: null });
    try {
      await apiDelete(`/devices/${deviceId}`);
      if (authStateRef.current !== 'authenticated') return;
      setDevices((curr) => ({
        ...curr,
        items: curr.items.map((d) => (d.id === deviceId ? { ...d, pairingStatus: 'revoked', revokedAt: new Date().toISOString() } : d)),
      }));
      setDeviceAction({ busyId: null, message: { type: 'success', text: 'Device access revoked.' } });
    } catch (error) {
      if (authStateRef.current !== 'authenticated') return;
      setDeviceAction({ busyId: null, message: { type: 'error', text: error.message } });
    }
  }

  const isLoadingHealth = health.state === 'loading';
  const apiAvailable = health.state === 'available';
  const healthLabel = isLoadingHealth
    ? 'Checking API connection'
    : apiAvailable ? 'API available' : 'API unavailable';
  const healthColor = isLoadingHealth
    ? 'bg-amber-400'
    : apiAvailable ? 'bg-emerald-400' : 'bg-rose-400';

  const selectedChild = children.items.find((c) => c.id === selectedChildId);

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-8 sm:px-6 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.15),_transparent_55%)]" />

      <section
        aria-labelledby="welcome-title"
        className={`relative w-full ${auth.state === 'authenticated' ? 'max-w-4xl' : 'max-w-xl'} rounded-3xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl transition-all sm:p-10`}
      >
        {/* Brand Header */}
        <div className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-5">
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className="grid size-10 place-items-center rounded-xl border border-indigo-500/30 bg-indigo-600/20 text-lg font-bold text-indigo-400">
              K
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white">KidsGuard</span>
              <p className="text-xs text-zinc-400">Parental Control Platform</p>
            </div>
          </div>
        </div>

        {auth.state === 'authenticated' ? (
          <div className="space-y-8">
            {/* Parent Account Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-zinc-900/40 p-4 sm:p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Authenticated Parent</p>
                <p className="mt-0.5 break-all text-sm font-semibold text-white">{auth.parent.email}</p>
              </div>
              <button
                className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/10 transition disabled:opacity-60"
                disabled={submitting}
                onClick={signOut}
                type="button"
              >
                Sign out
              </button>
            </div>

            {/* Child Profile Controls (When Child is Selected) */}
            {selectedChild && (
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/10 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-500/20 pb-3">
                  <div>
                    <span className="text-xs font-medium uppercase tracking-wider text-indigo-400">Parent Control Center</span>
                    <h3 className="text-lg font-bold text-white">{selectedChild.displayName}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 rounded-lg bg-zinc-900 p-1 border border-zinc-800 text-xs">
                      <button
                        type="button"
                        onClick={() => setActiveTab('screentime')}
                        className={`rounded px-3 py-1 font-medium transition ${
                          activeTab === 'screentime'
                            ? 'bg-indigo-600 text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Screen Time
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('policy')}
                        className={`rounded px-3 py-1 font-medium transition ${
                          activeTab === 'policy'
                            ? 'bg-indigo-600 text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Rules & Schedules
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('devices')}
                        className={`rounded px-3 py-1 font-medium transition ${
                          activeTab === 'devices'
                            ? 'bg-indigo-600 text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Devices & Sync
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedChildId(null)}
                      className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                      aria-label="Close child controls"
                    >
                      Close
                    </button>
                  </div>
                </div>

                {activeTab === 'screentime' && <ScreenTimeView child={selectedChild} />}
                {activeTab === 'policy' && <PolicyManager child={selectedChild} />}
                {activeTab === 'devices' && (
                  <DeviceStatusView
                    devices={devices.items}
                    activeChild={selectedChild}
                    onRequestPairing={requestPairingCode}
                    onRevokeDevice={(d) => revokeDevice(d.id)}
                    revokingId={deviceAction.busyId}
                  />
                )}
              </div>
            )}

            {/* Child Profiles Section (Maintained for existing tests and CRUD operations) */}
            <section aria-labelledby="children-title" className="rounded-2xl border border-white/10 bg-zinc-900/30 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white" id="children-title">Child profiles</h2>
              </div>
              {children.state === 'loading' && <p className="mt-3 text-sm text-zinc-400" role="status">Loading child profiles…</p>}
              {children.state === 'error' && <p className="mt-3 text-sm text-rose-300" role="alert">Child profiles could not be loaded. Try again later.</p>}
              {children.state === 'ready' && (children.items.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-400">No child profiles yet.</p>
              ) : (
                <ul className="mt-3 space-y-3" aria-label="Saved child profiles">
                  {children.items.map((child) => (
                    <li className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 transition" key={child.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-zinc-100">{child.displayName}</p>
                          {child.dateOfBirth && <p className="mt-1 text-sm text-zinc-400">Date of birth: {child.dateOfBirth}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20 transition"
                            onClick={() => {
                              setSelectedChildId(selectedChildId === child.id ? null : child.id);
                            }}
                            aria-label={`Manage rules & screen time for ${child.displayName}`}
                          >
                            {selectedChildId === child.id ? 'Close controls' : 'Rules & Screen Time'}
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                            disabled={pairingAction.busyChildId === child.id}
                            onClick={() => requestPairingCode(child)}
                            aria-label={`Pair a device for ${child.displayName}`}
                          >
                            {pairingAction.busyChildId === child.id ? 'Pairing…' : 'Pair device'}
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-rose-500/20 px-2.5 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition"
                            onClick={() => setConfirmDeleteChildId(child.id)}
                            aria-label={`Delete ${child.displayName}`}
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Delete Confirmation Prompt */}
                      {confirmDeleteChildId === child.id && (
                        <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/20 p-3 text-xs">
                          <p className="font-semibold text-rose-300">Are you sure you want to delete {child.displayName}?</p>
                          <p className="mt-1 text-zinc-400">All associated device pairings, rules, and screen-time reports will be permanently removed.</p>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              disabled={deletingChild}
                              onClick={() => deleteChildProfile(child.id)}
                              className="rounded bg-rose-600 px-3 py-1 font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                            >
                              {deletingChild ? 'Deleting…' : 'Confirm Delete'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteChildId(null)}
                              className="rounded border border-zinc-700 px-3 py-1 text-zinc-300 hover:bg-zinc-800"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Pairing Code Card */}
                      {pairingCode && pairingCode.childId === child.id && (
                        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3" role="region" aria-label="Active pairing code">
                          {pairingCode.status === 'active' ? (
                            <>
                              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">One-time pairing code</p>
                              <div className="mt-1 flex items-center justify-between gap-2">
                                <code className="font-mono text-xl font-bold tracking-widest text-white select-all">{pairingCode.code}</code>
                                <button
                                  type="button"
                                  className="rounded border border-rose-500/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
                                  disabled={pairingAction.cancelling}
                                  onClick={cancelPairingCode}
                                >
                                  {pairingAction.cancelling ? 'Cancelling…' : 'Cancel code'}
                                </button>
                              </div>
                              <p className="mt-2 text-xs text-zinc-400">
                                Expires at {new Date(pairingCode.expiresAt).toLocaleTimeString()}. Kept in memory only; not stored in browser storage.
                              </p>
                            </>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs text-amber-300">Pairing code expired.</p>
                              <button
                                type="button"
                                className="rounded border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
                                onClick={() => setPairingCode(null)}
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ))}

              {pairingAction.message && (
                <p className={`mt-3 text-sm ${pairingAction.message.type === 'error' ? 'text-rose-300' : 'text-emerald-300'}`} role={pairingAction.message.type === 'error' ? 'alert' : 'status'}>
                  {pairingAction.message.text}
                </p>
              )}

              {/* Add Child Profile Form */}
              <form className="mt-5 space-y-3 border-t border-white/10 pt-5" onSubmit={createChildProfile}>
                <h3 className="text-sm font-semibold text-zinc-200">Add a child profile</h3>
                <div>
                  <label className="mb-2 block text-sm text-zinc-300" htmlFor="child-display-name">Display name</label>
                  <input
                    autoComplete="off"
                    className="w-full rounded-xl border border-white/15 bg-zinc-900 px-4 py-2.5 text-white outline-none focus-visible:border-white/50"
                    id="child-display-name"
                    maxLength={60}
                    onChange={(event) => setChildDisplayName(event.target.value)}
                    required
                    value={childDisplayName}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm text-zinc-300" htmlFor="child-date-of-birth">Date of birth (optional)</label>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-zinc-900 px-4 py-2.5 text-white outline-none focus-visible:border-white/50"
                    id="child-date-of-birth"
                    onChange={(event) => setChildDateOfBirth(event.target.value)}
                    type="date"
                    value={childDateOfBirth}
                  />
                </div>
                {childMessage && (
                  <p className={`text-sm ${childMessage.type === 'error' ? 'text-rose-300' : 'text-emerald-300'}`} role={childMessage.type === 'error' ? 'alert' : 'status'}>
                    {childMessage.text}
                  </p>
                )}
                <button
                  className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60 transition"
                  disabled={creatingChild || children.state === 'loading'}
                  type="submit"
                >
                  {creatingChild ? 'Saving…' : 'Add child profile'}
                </button>
              </form>
            </section>

            {/* Global Paired Devices Section */}
            <section aria-labelledby="devices-title" className="rounded-2xl border border-white/10 bg-zinc-900/30 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white" id="devices-title">Paired devices</h2>
                  <p className="mt-1 text-xs text-zinc-400">Device filtering enforcement is not implemented in this stage.</p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-white/15 px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-white/10 disabled:opacity-50 transition"
                  disabled={devices.state === 'loading'}
                  onClick={() => loadDevices()}
                  aria-label="Refresh paired devices"
                >
                  {devices.state === 'loading' ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {deviceAction.message && (
                <p className={`mt-3 text-sm ${deviceAction.message.type === 'error' ? 'text-rose-300' : 'text-emerald-300'}`} role={deviceAction.message.type === 'error' ? 'alert' : 'status'}>
                  {deviceAction.message.text}
                </p>
              )}

              {devices.state === 'loading' && devices.items.length === 0 && (
                <p className="mt-3 text-sm text-zinc-400" role="status">Loading paired devices…</p>
              )}
              {devices.state === 'error' && (
                <p className="mt-3 text-sm text-rose-300" role="alert">Paired devices could not be loaded. Try again later.</p>
              )}
              {devices.state === 'ready' && (devices.items.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-400">No paired devices yet.</p>
              ) : (
                <ul className="mt-3 space-y-2" aria-label="Paired devices">
                  {devices.items.map((device) => {
                    const childName = children.items.find((c) => c.id === device.childProfileId)?.displayName ?? 'Child';
                    const isRevoked = device.pairingStatus === 'revoked' || Boolean(device.revokedAt);
                    const pairedDate = device.pairedAt ? new Date(device.pairedAt).toLocaleString() : 'Unknown';
                    const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never seen';
                    return (
                      <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-950/40 px-4 py-3" key={device.id}>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-zinc-100">{device.name}</p>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isRevoked ? 'bg-zinc-800 text-zinc-400' : 'border border-emerald-500/30 bg-emerald-950/60 text-emerald-400'}`}>
                              {isRevoked ? 'Revoked' : 'Paired'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-zinc-400">
                            Child: {childName} • Platform: {device.platform} • Paired: {pairedDate} • Last seen: {lastSeen}
                          </p>
                        </div>
                        {!isRevoked && (
                          <button
                            type="button"
                            className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-950/40 disabled:opacity-50 transition"
                            disabled={deviceAction.busyId === device.id}
                            onClick={() => revokeDevice(device.id)}
                            aria-label={`Revoke ${device.name}`}
                          >
                            {deviceAction.busyId === device.id ? 'Revoking…' : 'Revoke'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ))}
            </section>
          </div>
        ) : auth.state === 'checking' ? (
          <p className="mt-8 text-sm text-zinc-400" role="status">Checking sign-in status…</p>
        ) : (
          <div className="mt-8">
            <p className="text-sm font-medium text-zinc-400">Parent account</p>
            <h1 id="welcome-title" className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">A calmer way to stay connected.</h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-zinc-400">Create a parent account or sign in to your KidsGuard workspace to manage family screen time and policies.</p>

            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3" role="status" aria-live="polite">
              <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${healthColor}`} />
              <div>
                <p className="text-sm font-medium text-zinc-100">{healthLabel}</p>
                <p className="mt-1 text-sm text-zinc-500">
                  {isLoadingHealth && 'Contacting the local KidsGuard API…'}
                  {apiAvailable && `MongoDB ${health.data?.dependencies?.mongodb ?? 'status unknown'}${health.data?.status === 'degraded' ? ' — authentication needs a database connection.' : '.'}`}
                  {health.state === 'unavailable' && 'Start the API at localhost:5000 to check its health.'}
                </p>
              </div>
            </div>

            <div aria-label="Authentication options" className="my-6 flex gap-2" role="group">
              <button
                aria-pressed={mode === 'login'}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${mode === 'login' ? 'bg-white text-zinc-950' : 'border border-white/15 text-zinc-300 hover:bg-white/10'}`}
                onClick={() => { setMode('login'); setFormMessage(null); }}
                type="button"
              >
                Sign in
              </button>
              <button
                aria-pressed={mode === 'register'}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${mode === 'register' ? 'bg-white text-zinc-950' : 'border border-white/15 text-zinc-300 hover:bg-white/10'}`}
                onClick={() => { setMode('register'); setFormMessage(null); }}
                type="button"
              >
                Register
              </button>
            </div>

            <form className="space-y-4" onSubmit={submitCredentials}>
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-200" htmlFor="parent-email">Email</label>
                <input
                  autoComplete="username"
                  className="w-full rounded-xl border border-white/15 bg-zinc-900 px-4 py-3 text-white outline-none placeholder:text-zinc-600 focus-visible:border-white/50"
                  id="parent-email"
                  maxLength={254}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-200" htmlFor="parent-password">Password</label>
                <input
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full rounded-xl border border-white/15 bg-zinc-900 px-4 py-3 text-white outline-none placeholder:text-zinc-600 focus-visible:border-white/50"
                  id="parent-password"
                  maxLength={128}
                  minLength={mode === 'register' ? 8 : 1}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
                {mode === 'register' && <p className="mt-2 text-xs text-zinc-500">Use at least 8 characters.</p>}
              </div>
              {formMessage && (
                <p className={`text-sm ${formMessage.type === 'error' ? 'text-rose-300' : 'text-emerald-300'}`} role={formMessage.type === 'error' ? 'alert' : 'status'}>
                  {formMessage.text}
                </p>
              )}
              {auth.state === 'unavailable' && <p className="text-sm text-amber-200">Sign-in status could not be checked. You can still try signing in.</p>}
              <button
                className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60 transition"
                disabled={submitting}
                type="submit"
              >
                {submitting ? 'Please wait…' : mode === 'login' ? 'Continue' : 'Create account'}
              </button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
