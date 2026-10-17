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
  const [childPolicyVersions, setChildPolicyVersions] = useState({});

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

  useEffect(() => {
    if (!selectedChildId) return undefined;
    const controller = new AbortController();
    apiGet(`/children/${selectedChildId}/policy`, { signal: controller.signal })
      .then((data) => {
        if (data?.policy?.version) {
          setChildPolicyVersions((prev) => ({ ...prev, [selectedChildId]: data.policy.version }));
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [selectedChildId]);

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
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-50/70 px-4 py-8 sm:px-6 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.08),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(99,102,241,0.06),_transparent_40%)]" />

      <section
        aria-labelledby="welcome-title"
        className={`relative w-full ${auth.state === 'authenticated' ? 'max-w-4xl' : 'max-w-xl'} rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xl shadow-slate-200/60 transition-all sm:p-10`}
      >
        {/* Brand Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img src="/balakavach_logo.png" alt="BalaKavach Logo" className="size-11 rounded-2xl object-contain shadow-xs border border-slate-100 p-0.5 bg-white" />
              <span className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-white ${apiAvailable ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-900">BalaKavach</span>
              <p className="text-xs font-medium text-slate-500">Parental Control Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${apiAvailable ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              <span className={`size-1.5 rounded-full ${apiAvailable ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {apiAvailable ? 'Protected & Active' : 'Connecting…'}
            </span>
          </div>
        </div>

        {auth.state === 'authenticated' ? (
          <div className="space-y-8">
            {/* Parent Account Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700 font-bold text-sm border border-sky-200/60">
                  {auth.parent.email[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Authenticated Parent</p>
                  <p className="mt-0.5 break-all text-sm font-bold text-slate-900">{auth.parent.email}</p>
                </div>
              </div>
              <button
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-rose-600 shadow-xs transition disabled:opacity-60"
                disabled={submitting}
                onClick={signOut}
                type="button"
              >
                Sign out
              </button>
            </div>

            {/* Child Profile Controls (When Child is Selected) */}
            {selectedChild && (
              <div className="rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50/30 via-white to-white p-5 sm:p-6 shadow-sm space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white font-bold text-base shadow-xs">
                      {selectedChild.displayName[0].toUpperCase()}
                    </div>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-sky-600">Parent Control Center</span>
                      <h3 className="text-xl font-extrabold text-slate-900">{selectedChild.displayName}</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs">
                      <button
                        type="button"
                        onClick={() => setActiveTab('screentime')}
                        className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                          activeTab === 'screentime'
                            ? 'bg-white text-sky-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Screen Time
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('policy')}
                        className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                          activeTab === 'policy'
                            ? 'bg-white text-sky-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Rules & Schedules
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('devices');
                          loadDevices();
                        }}
                        className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                          activeTab === 'devices'
                            ? 'bg-white text-sky-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Devices & Sync
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedChildId(null)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-xs"
                      aria-label="Close child controls"
                    >
                      Close
                    </button>
                  </div>
                </div>

                {activeTab === 'screentime' && <ScreenTimeView child={selectedChild} />}
                {activeTab === 'policy' && (
                  <PolicyManager
                    child={selectedChild}
                    onPolicyVersionChange={(ver) => {
                      setChildPolicyVersions((prev) => ({ ...prev, [selectedChild.id]: ver }));
                    }}
                    onPolicySaved={() => {
                      loadDevices();
                      setTimeout(() => loadDevices(), 2500);
                      setTimeout(() => loadDevices(), 5000);
                    }}
                  />
                )}
                {activeTab === 'devices' && (
                  <DeviceStatusView
                    devices={devices.items}
                    activeChild={selectedChild}
                    policyVersion={childPolicyVersions[selectedChild.id] ?? 1}
                    onRequestPairing={requestPairingCode}
                    onRevokeDevice={(d) => revokeDevice(d.id)}
                    revokingId={deviceAction.busyId}
                  />
                )}
              </div>
            )}

            {/* Child Profiles Section */}
            <section aria-labelledby="children-title" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900" id="children-title">Child profiles</h2>
              </div>
              {children.state === 'loading' && <p className="mt-3 text-sm text-slate-500" role="status">Loading child profiles…</p>}
              {children.state === 'error' && <p className="mt-3 text-sm font-medium text-rose-600" role="alert">Child profiles could not be loaded. Try again later.</p>}
              {children.state === 'ready' && (children.items.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No child profiles yet.</p>
              ) : (
                <ul className="mt-3 space-y-3" aria-label="Saved child profiles">
                  {children.items.map((child) => (
                    <li className="rounded-2xl border border-slate-200/90 bg-slate-50/50 hover:bg-slate-50/90 p-4 transition shadow-xs" key={child.id}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700 font-bold text-sm border border-sky-200/60">
                            {child.displayName[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{child.displayName}</p>
                            {child.dateOfBirth && <p className="mt-0.5 text-xs text-slate-500">Date of birth: {child.dateOfBirth}</p>}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 shadow-xs transition"
                            onClick={() => {
                              setSelectedChildId(selectedChildId === child.id ? null : child.id);
                            }}
                            aria-label={`Manage rules & screen time for ${child.displayName}`}
                          >
                            {selectedChildId === child.id ? 'Close controls' : 'Rules & Screen Time'}
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 shadow-xs transition disabled:opacity-50"
                            disabled={pairingAction.busyChildId === child.id}
                            onClick={() => requestPairingCode(child)}
                            aria-label={`Pair a device for ${child.displayName}`}
                          >
                            {pairingAction.busyChildId === child.id ? 'Pairing…' : 'Pair device'}
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 shadow-xs transition"
                            onClick={() => setConfirmDeleteChildId(child.id)}
                            aria-label={`Delete ${child.displayName}`}
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Delete Confirmation Prompt */}
                      {confirmDeleteChildId === child.id && (
                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs">
                          <p className="font-bold text-rose-800">Are you sure you want to delete {child.displayName}?</p>
                          <p className="mt-1 text-slate-600">All associated device pairings, rules, and screen-time reports will be permanently removed.</p>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              disabled={deletingChild}
                              onClick={() => deleteChildProfile(child.id)}
                              className="rounded-lg bg-rose-600 px-3.5 py-1.5 font-semibold text-white hover:bg-rose-500 shadow-xs disabled:opacity-50 transition"
                            >
                              {deletingChild ? 'Deleting…' : 'Confirm Delete'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteChildId(null)}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-100 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Pairing Code Card */}
                      {pairingCode && pairingCode.childId === child.id && (
                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-xs" role="region" aria-label="Active pairing code">
                          {pairingCode.status === 'active' ? (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">One-time pairing code</span>
                                <span className="rounded-full bg-emerald-200/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Active</span>
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-emerald-200">
                                <code className="font-mono text-2xl font-bold tracking-widest text-emerald-900 select-all">{pairingCode.code}</code>
                                <button
                                  type="button"
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition"
                                  disabled={pairingAction.cancelling}
                                  onClick={cancelPairingCode}
                                >
                                  {pairingAction.cancelling ? 'Cancelling…' : 'Cancel code'}
                                </button>
                              </div>
                              <p className="mt-2 text-xs text-slate-500">
                                Enter this code in the BalaKavach Android companion app. Kept in memory only; not stored in browser storage. Expires at {new Date(pairingCode.expiresAt).toLocaleTimeString()}.
                              </p>
                            </>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-amber-800">Pairing code expired.</p>
                              <button
                                type="button"
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
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
                <p className={`mt-3 text-sm font-medium ${pairingAction.message.type === 'error' ? 'text-rose-600' : 'text-emerald-600'}`} role={pairingAction.message.type === 'error' ? 'alert' : 'status'}>
                  {pairingAction.message.text}
                </p>
              )}

              {/* Add Child Profile Form */}
              <form className="mt-6 space-y-4 border-t border-slate-100 pt-5" onSubmit={createChildProfile}>
                <h3 className="text-sm font-bold text-slate-900">Add a child profile</h3>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700" htmlFor="child-display-name">Display name</label>
                  <input
                    autoComplete="off"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition"
                    id="child-display-name"
                    maxLength={60}
                    onChange={(event) => setChildDisplayName(event.target.value)}
                    placeholder="e.g. Alex"
                    required
                    value={childDisplayName}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700" htmlFor="child-date-of-birth">Date of birth (optional)</label>
                  <input
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition"
                    id="child-date-of-birth"
                    onChange={(event) => setChildDateOfBirth(event.target.value)}
                    type="date"
                    value={childDateOfBirth}
                  />
                </div>
                {childMessage && (
                  <p className={`text-sm font-medium ${childMessage.type === 'error' ? 'text-rose-600' : 'text-emerald-600'}`} role={childMessage.type === 'error' ? 'alert' : 'status'}>
                    {childMessage.text}
                  </p>
                )}
                <button
                  className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500 shadow-sm disabled:cursor-wait disabled:opacity-60 transition"
                  disabled={creatingChild || children.state === 'loading'}
                  type="submit"
                >
                  {creatingChild ? 'Saving…' : 'Add child profile'}
                </button>
              </form>
            </section>

            {/* Global Paired Devices Section */}
            <section aria-labelledby="devices-title" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900" id="devices-title">Paired devices</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Device filtering enforcement is not implemented in this stage.</p>
                </div>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs disabled:opacity-50 transition"
                  disabled={devices.state === 'loading'}
                  onClick={() => loadDevices()}
                  aria-label="Refresh paired devices"
                >
                  {devices.state === 'loading' ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {deviceAction.message && (
                <p className={`mt-3 text-sm font-medium ${deviceAction.message.type === 'error' ? 'text-rose-600' : 'text-emerald-600'}`} role={deviceAction.message.type === 'error' ? 'alert' : 'status'}>
                  {deviceAction.message.text}
                </p>
              )}

              {devices.state === 'loading' && devices.items.length === 0 && (
                <p className="mt-3 text-sm text-slate-500" role="status">Loading paired devices…</p>
              )}
              {devices.state === 'error' && (
                <p className="mt-3 text-sm font-medium text-rose-600" role="alert">Paired devices could not be loaded. Try again later.</p>
              )}
              {devices.state === 'ready' && (devices.items.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No paired devices yet.</p>
              ) : (
                <ul className="mt-3 space-y-2.5" aria-label="Paired devices">
                  {devices.items.map((device) => {
                    const childName = children.items.find((c) => c.id === device.childProfileId)?.displayName ?? 'Child';
                    const isRevoked = device.pairingStatus === 'revoked' || Boolean(device.revokedAt);
                    const pairedDate = device.pairedAt ? new Date(device.pairedAt).toLocaleString() : 'Unknown';
                    const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never seen';
                    return (
                      <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 shadow-xs" key={device.id}>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-900">{device.name}</p>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${isRevoked ? 'bg-slate-200 text-slate-600' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                              {isRevoked ? 'Revoked' : 'Paired'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            Child: {childName} • Platform: {device.platform} • Paired: {pairedDate} • Last seen: {lastSeen}
                            {device.acknowledgedPolicyVersion !== undefined && device.acknowledgedPolicyVersion !== null ? ` • Policy: v${device.acknowledgedPolicyVersion}` : ''}
                          </p>
                        </div>
                        {!isRevoked && (
                          <button
                            type="button"
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 shadow-xs disabled:opacity-50 transition"
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
          <p className="mt-8 text-sm text-slate-500" role="status">Checking sign-in status…</p>
        ) : (
          <div className="mt-8">
            <span className="inline-block rounded-full bg-sky-50 border border-sky-200/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-sky-700">Parent account</span>
            <h1 id="welcome-title" className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">A calmer way to stay connected.</h1>
            <p className="mt-3 max-w-lg text-base leading-relaxed text-slate-600">Create a parent account or sign in to your BalaKavach workspace to manage family screen time and policies.</p>

            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 shadow-xs" role="status" aria-live="polite">
              <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${healthColor}`} />
              <div>
                <p className="text-sm font-bold text-slate-900">{healthLabel}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {isLoadingHealth && 'Contacting the local BalaKavach API…'}
                  {apiAvailable && `MongoDB ${health.data?.dependencies?.mongodb ?? 'status unknown'}${health.data?.status === 'degraded' ? ' — authentication needs a database connection.' : '.'}`}
                  {health.state === 'unavailable' && 'Start the API at localhost:5000 to check its health.'}
                </p>
              </div>
            </div>

            <div aria-label="Authentication options" className="my-6 flex gap-2 rounded-xl bg-slate-100 p-1 border border-slate-200" role="group">
              <button
                aria-pressed={mode === 'login'}
                className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition ${mode === 'login' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                onClick={() => { setMode('login'); setFormMessage(null); }}
                type="button"
              >
                Sign in
              </button>
              <button
                aria-pressed={mode === 'register'}
                className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition ${mode === 'register' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                onClick={() => { setMode('register'); setFormMessage(null); }}
                type="button"
              >
                Register
              </button>
            </div>

            <form className="space-y-4" onSubmit={submitCredentials}>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700" htmlFor="parent-email">Email</label>
                <input
                  autoComplete="username"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition"
                  id="parent-email"
                  maxLength={254}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700" htmlFor="parent-password">Password</label>
                <input
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition"
                  id="parent-password"
                  maxLength={128}
                  minLength={mode === 'register' ? 8 : 1}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                  type="password"
                  value={password}
                />
                {mode === 'register' && <p className="mt-1.5 text-xs text-slate-500">Use at least 8 characters.</p>}
              </div>
              {formMessage && (
                <p className={`text-sm font-medium ${formMessage.type === 'error' ? 'text-rose-600' : 'text-emerald-600'}`} role={formMessage.type === 'error' ? 'alert' : 'status'}>
                  {formMessage.text}
                </p>
              )}
              {auth.state === 'unavailable' && <p className="text-sm font-medium text-amber-700">Sign-in status could not be checked. You can still try signing in.</p>}
              <button
                className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500 shadow-md shadow-sky-600/20 disabled:cursor-wait disabled:opacity-60 transition"
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
