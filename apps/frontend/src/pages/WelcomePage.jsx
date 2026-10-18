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
    <main className="min-h-screen min-h-dvh bg-[#eef2f6] text-slate-900 py-3.5 sm:py-8 px-3 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        {/* Brand Header */}
        <header className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="relative">
              <img src="/balakavach_logo.png" alt="BalaKavach Logo" className="size-10 sm:size-11 rounded-2xl object-contain shadow-xs border border-slate-100 p-0.5 bg-white" />
              <span className={`absolute -bottom-0.5 -right-0.5 size-2.5 sm:size-3 rounded-full ring-2 ring-white ${apiAvailable ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            </div>
            <div>
              <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900">BalaKavach</span>
              <p className="text-[11px] sm:text-xs font-medium text-slate-500">Parental Control Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${apiAvailable ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              <span className={`size-2 rounded-full ${apiAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {apiAvailable ? 'Protected & Active' : 'Connecting…'}
            </span>
          </div>
        </header>

        <section aria-labelledby="welcome-title">

        {auth.state === 'authenticated' ? (
          <div className="space-y-8">
            {/* Parent Account Bar & Quick Metrics */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white font-bold text-base shadow-xs">
                    {auth.parent.email[0].toUpperCase()}
                  </div>
                  <div>
                    <span className="inline-block rounded-full bg-sky-50 border border-sky-200 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-700">
                      Parent Account
                    </span>
                    <p className="mt-0.5 break-all text-sm font-bold text-slate-900">{auth.parent.email}</p>
                  </div>
                </div>
                <button
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 shadow-xs transition disabled:opacity-60"
                  disabled={submitting}
                  onClick={signOut}
                  type="button"
                >
                  Sign out
                </button>
              </div>

              {/* Quick Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
                <div className="rounded-xl bg-slate-50/70 border border-slate-200/70 p-3">
                  <p className="text-[11px] font-semibold text-slate-500">Child Profiles</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{children.items.length}</p>
                </div>
                <div className="rounded-xl bg-slate-50/70 border border-slate-200/70 p-3">
                  <p className="text-[11px] font-semibold text-slate-500">Paired Devices</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{devices.items.length}</p>
                </div>
                <div className="rounded-xl bg-slate-50/70 border border-slate-200/70 p-3">
                  <p className="text-[11px] font-semibold text-slate-500">Active Policy</p>
                  <p className="mt-1 text-lg font-bold text-sky-700 font-mono">
                    {selectedChild && childPolicyVersions[selectedChild.id] ? `v${childPolicyVersions[selectedChild.id]}` : 'Active'}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50/70 border border-slate-200/70 p-3">
                  <p className="text-[11px] font-semibold text-slate-500">Protection Status</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                    <span className="text-xs font-bold text-emerald-700">Real-Time</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Child Profile Controls (When Child is Selected) */}
            {selectedChild && (
              <div className="rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50/30 via-white to-white p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-100 pb-4">
                  <div className="flex items-center justify-between w-full sm:w-auto gap-3">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div className="flex size-9 sm:size-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white font-bold text-sm sm:text-base shadow-xs">
                        {selectedChild.displayName[0].toUpperCase()}
                      </div>
                      <div>
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-sky-600">Parent Control Center</span>
                        <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-tight">{selectedChild.displayName}</h3>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedChildId(null)}
                      className="sm:hidden rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-xs"
                      aria-label="Close child controls"
                    >
                      Close
                    </button>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="w-full sm:w-auto grid grid-cols-3 sm:flex gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs">
                      <button
                        type="button"
                        onClick={() => setActiveTab('screentime')}
                        className={`rounded-lg py-2 sm:py-1.5 px-1.5 sm:px-3 text-center font-semibold transition ${
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
                        className={`rounded-lg py-2 sm:py-1.5 px-1.5 sm:px-3 text-center font-semibold transition ${
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
                        className={`rounded-lg py-2 sm:py-1.5 px-1.5 sm:px-3 text-center font-semibold transition ${
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
                      className="hidden sm:inline-block rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-xs shrink-0"
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
                    <li className="rounded-2xl border border-slate-200/90 bg-slate-50/50 hover:bg-slate-50/90 p-3.5 sm:p-4 transition shadow-xs" key={child.id}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700 font-bold text-sm border border-sky-200/60 shrink-0">
                            {child.displayName[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{child.displayName}</p>
                            {child.dateOfBirth && <p className="mt-0.5 text-xs text-slate-500">Date of birth: {child.dateOfBirth}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <button
                            type="button"
                            className="flex-1 sm:flex-initial rounded-xl border border-sky-200 bg-sky-50 px-2.5 sm:px-3.5 py-2 sm:py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 shadow-xs transition text-center"
                            onClick={() => {
                              setSelectedChildId(selectedChildId === child.id ? null : child.id);
                            }}
                            aria-label={`Manage rules & screen time for ${child.displayName}`}
                          >
                            {selectedChildId === child.id ? 'Close controls' : 'Rules & Screen Time'}
                          </button>
                          <button
                            type="button"
                            className="flex-1 sm:flex-initial rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 sm:px-3.5 py-2 sm:py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 shadow-xs transition disabled:opacity-50 text-center"
                            disabled={pairingAction.busyChildId === child.id}
                            onClick={() => requestPairingCode(child)}
                            aria-label={`Pair a device for ${child.displayName}`}
                          >
                            {pairingAction.busyChildId === child.id ? 'Pairing…' : 'Pair device'}
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 shadow-xs transition shrink-0"
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
                                Enter this code in the BalaKavach Android companion app or Chrome desktop extension popup. Kept in memory only; not stored in browser storage. Expires at {new Date(pairingCode.expiresAt).toLocaleTimeString()}.
                              </p>
                              <div className="mt-2.5 pt-2 border-t border-emerald-200/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="text-slate-600">Need to install the client on child's device?</span>
                                <div className="flex flex-wrap items-center gap-3">
                                  <a
                                    href="/balakavach-companion.apk"
                                    download="balakavach-companion.apk"
                                    className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-800 underline"
                                  >
                                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                    </svg>
                                    Android App (8.6 MB) ↓
                                  </a>
                                  <span className="text-slate-300 hidden sm:inline">•</span>
                                  <a
                                    href="/balakavach-chrome-extension.zip"
                                    download="balakavach-chrome-extension.zip"
                                    className="inline-flex items-center gap-1 font-bold text-sky-700 hover:text-sky-800 underline"
                                  >
                                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                    </svg>
                                    Chrome Extension ZIP (258 KB) ↓
                                  </a>
                                </div>
                              </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="mt-5 sm:mt-8 lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start space-y-6 lg:space-y-0 max-w-5xl mx-auto">
            {/* Left Column: Sign In / Register Card */}
            <div className="lg:col-span-7 space-y-4">
              <div>
                <span className="inline-block rounded-full bg-sky-50 border border-sky-200/80 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-700">Parent Portal</span>
                <h1 id="welcome-title" className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
                  {mode === 'login' ? 'Sign in to BalaKavach' : 'Create Parent Account'}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {mode === 'login' ? 'Manage screen time and protection for your family.' : 'Set up your parent dashboard in under a minute.'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
                <div aria-label="Authentication options" className="mb-5 flex gap-1.5 rounded-xl bg-slate-100 p-1 border border-slate-200/80" role="group">
                  <button
                    aria-pressed={mode === 'login'}
                    className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition min-h-[42px] ${mode === 'login' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                    onClick={() => { setMode('login'); setFormMessage(null); }}
                    type="button"
                  >
                    Sign in
                  </button>
                  <button
                    aria-pressed={mode === 'register'}
                    className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition min-h-[42px] ${mode === 'register' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                    onClick={() => { setMode('register'); setFormMessage(null); }}
                    type="button"
                  >
                    Register
                  </button>
                </div>

                <form className="space-y-3.5" onSubmit={submitCredentials}>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700" htmlFor="parent-email">Email</label>
                    <input
                      autoComplete="username"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition"
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
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition"
                      id="parent-password"
                      maxLength={128}
                      minLength={mode === 'register' ? 8 : 1}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      required
                      type="password"
                      value={password}
                    />
                    {mode === 'register' && <p className="mt-1 text-[11px] text-slate-500">Use at least 8 characters.</p>}
                  </div>

                  {formMessage && (
                    <p className={`text-sm font-medium ${formMessage.type === 'error' ? 'text-rose-600' : 'text-emerald-600'}`} role={formMessage.type === 'error' ? 'alert' : 'status'}>
                      {formMessage.text}
                    </p>
                  )}
                  {auth.state === 'unavailable' && <p className="text-sm font-medium text-amber-700">Sign-in status could not be checked. You can still try signing in.</p>}

                  <button
                    className="w-full rounded-xl bg-sky-600 px-4 py-3 min-h-[46px] text-sm font-semibold text-white hover:bg-sky-500 shadow-md shadow-sky-600/20 disabled:cursor-wait disabled:opacity-60 transition active:scale-[0.99]"
                    disabled={submitting}
                    type="submit"
                  >
                    {submitting ? 'Please wait…' : mode === 'login' ? 'Continue' : 'Create account'}
                  </button>
                </form>

                <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500" role="status" aria-live="polite">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${healthColor}`} />
                    <span className="font-semibold text-slate-700">{healthLabel}</span>
                    <span className="text-slate-300">•</span>
                    <span>
                      {isLoadingHealth && 'Contacting local API…'}
                      {apiAvailable && `MongoDB ${health.data?.dependencies?.mongodb ?? 'connected'}`}
                      {health.state === 'unavailable' && 'Start the API at localhost:5000'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Clean Child Device Apps Download */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Child Device Apps</h2>
                    <p className="mt-0.5 text-xs text-slate-500">Install to protect your kids' phones &amp; computers.</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    Free
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Android Card */}
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/60 to-white p-3.5 transition hover:border-emerald-300">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 text-xl shrink-0">
                        📱
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-bold text-slate-900">Android App</h3>
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded">8.6 MB</span>
                        </div>
                        <p className="text-[11px] text-slate-500">Phones &amp; tablets</p>
                      </div>
                    </div>
                    <a
                      href="/balakavach-companion.apk"
                      download="balakavach-companion.apk"
                      className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition active:scale-95 shrink-0"
                      id="download-apk-btn"
                    >
                      <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Download
                    </a>
                  </div>

                  {/* Chrome Extension Card */}
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-50/60 to-white p-3.5 transition hover:border-sky-300">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-sky-100 text-sky-800 text-xl shrink-0">
                        🌐
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-bold text-slate-900">Chrome Extension</h3>
                          <span className="text-[10px] font-semibold text-sky-700 bg-sky-100/70 px-1.5 py-0.5 rounded">258 KB</span>
                        </div>
                        <p className="text-[11px] text-slate-500">Desktop browsing</p>
                      </div>
                    </div>
                    <a
                      href="/balakavach-chrome-extension.zip"
                      download="balakavach-chrome-extension.zip"
                      className="inline-flex items-center justify-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-sky-500 transition active:scale-95 shrink-0"
                      id="download-extension-btn"
                    >
                      <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Download
                    </a>
                  </div>
                </div>

                {/* Collapsible Quick Setup Guide */}
                <details className="group rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs text-slate-600 transition">
                  <summary className="flex cursor-pointer items-center justify-between font-semibold text-slate-700 select-none">
                    <span>How to install Chrome Extension</span>
                    <span className="text-slate-400 group-open:rotate-180 transition-transform text-[10px]">▼</span>
                  </summary>
                  <ol className="mt-2.5 list-decimal list-inside space-y-1.5 pl-0.5 text-[11px] text-slate-600 border-t border-slate-200/60 pt-2">
                    <li>Download &amp; extract <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-[10.5px]">balakavach-chrome-extension.zip</code></li>
                    <li>Go to <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-[10.5px]">chrome://extensions</code> in Chrome</li>
                    <li>Enable <strong>Developer mode</strong> and click <strong>Load unpacked</strong></li>
                    <li>Select extracted folder and enter pairing code</li>
                  </ol>
                </details>

                {/* Minimal Feature Highlights */}
                <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50/80 p-2 border border-slate-100">
                    <span className="text-base">⏱️</span>
                    <p className="mt-0.5 font-bold text-slate-800 text-[11px]">Screen Time</p>
                  </div>
                  <div className="rounded-xl bg-slate-50/80 p-2 border border-slate-100">
                    <span className="text-base">🚫</span>
                    <p className="mt-0.5 font-bold text-slate-800 text-[11px]">App Blocking</p>
                  </div>
                  <div className="rounded-xl bg-slate-50/80 p-2 border border-slate-100">
                    <span className="text-base">🛡️</span>
                    <p className="mt-0.5 font-bold text-slate-800 text-[11px]">Web Filter</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </section>
      </div>
    </main>
  );
}
