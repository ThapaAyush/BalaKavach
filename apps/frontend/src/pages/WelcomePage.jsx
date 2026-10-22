import { useEffect, useRef, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../lib/api.js';
import { downloadMeta } from '../lib/downloadMeta.js';
import PolicyManager from '../components/PolicyManager.jsx';
import ScreenTimeView from '../components/ScreenTimeView.jsx';
import DeviceStatusView from '../components/DeviceStatusView.jsx';
import DownloadsView from '../components/DownloadsView.jsx';

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
  const [copiedCode, setCopiedCode] = useState(false);
  const [pairingAction, setPairingAction] = useState({ busyChildId: null, cancelling: false, message: null });
  const [deviceAction, setDeviceAction] = useState({ busyId: null, message: null });

  // Top Page Navigation State: 'overview' | 'screentime' | 'rules' | 'devices' | 'downloads'
  const [currentPage, setCurrentPage] = useState('overview');
  // Unauthenticated Navigation State: 'auth' | 'downloads' | 'features'
  const [unauthPage, setUnauthPage] = useState('auth');

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
    let healthTimer = null;
    let authTimer = null;
    let active = true;

    function checkHealth() {
      apiGet('/health')
        .then((data) => {
          if (!active) return;
          setHealth({ state: 'available', data });
        })
        .catch((error) => {
          if (!active || error.name === 'AbortError') return;
          setHealth({ state: 'unavailable', data: null });
          healthTimer = setTimeout(checkHealth, 5000);
        });
    }

    function checkAuth() {
      apiGet('/auth/me')
        .then((data) => {
          if (!active) return;
          setAuth({ state: 'authenticated', parent: data.parent });
        })
        .catch((error) => {
          if (!active || error.name === 'AbortError') return;
          setAuth({ state: error.status === 401 ? 'signed-out' : 'unavailable', parent: null });
          if (error.status !== 401) {
            authTimer = setTimeout(checkAuth, 5000);
          }
        });
    }

    checkHealth();
    checkAuth();

    return () => {
      active = false;
      if (healthTimer) clearTimeout(healthTimer);
      if (authTimer) clearTimeout(authTimer);
    };
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
    setCurrentPage('overview');
    setUnauthPage('auth');
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

  async function copyPairingCode(code) {
    if (!code) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Ignore copy error
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

  const selectedChild = children.items.find((c) => c.id === selectedChildId) || (children.items.length > 0 ? children.items[0] : null);

  return (
    <div className="relative min-h-screen min-h-dvh bg-slate-50/70 text-slate-900 antialiased overflow-x-hidden selection:bg-sky-500 selection:text-white">
      {/* Decorative ambient background glows */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-tr from-sky-200/40 via-indigo-200/30 to-emerald-100/30 blur-3xl opacity-60" />
        <div className="absolute top-1/4 -right-40 size-[420px] rounded-full bg-sky-200/20 blur-3xl" />
        <div className="absolute bottom-10 -left-40 size-[420px] rounded-full bg-indigo-200/20 blur-3xl" />
      </div>

      <main className="w-full max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-3.5 sm:py-6 space-y-4 sm:space-y-6">
        {/* Brand Master Header */}
        <header className="rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-md shadow-sm shadow-slate-200/40 transition overflow-hidden">
          {/* Top Row: Brand Info + Status / Active Child */}
          <div className="px-3.5 sm:px-6 py-3 sm:py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="relative flex items-center justify-center size-10 sm:size-12 rounded-2xl bg-gradient-to-br from-sky-50 via-indigo-50/40 to-white border border-sky-100/80 p-1 sm:p-1.5 shadow-2xs shrink-0">
                <img src="/balakavach_logo.png" alt="BalaKavach Logo" className="size-full object-contain" />
                <span className={`absolute -bottom-0.5 -right-0.5 size-2.5 sm:size-3 rounded-full ring-2 ring-white ${apiAvailable ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              </div>
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900">BalaKavach</span>
                  <span className="hidden sm:inline-block rounded-md bg-sky-50 border border-sky-200/60 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">PLATFORM</span>
                </div>
                <p className="text-[11px] sm:text-xs font-medium text-slate-500">Parental Control &amp; Family Safety</p>
              </div>
            </div>

            {/* Unauthenticated: Portal Options Navigation */}
            {auth.state !== 'authenticated' && (
              <nav aria-label="Portal options" className="order-3 md:order-2 w-full md:w-auto flex items-center justify-center gap-1 bg-slate-100/90 p-1 rounded-2xl border border-slate-200/80 shadow-2xs overflow-x-auto touch-scroll-x no-scrollbar">
                <button
                  type="button"
                  onClick={() => setUnauthPage('auth')}
                  className={`flex items-center gap-1.5 rounded-xl px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-bold transition whitespace-nowrap min-h-[36px] ${
                    unauthPage === 'auth'
                      ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  <span>🔐</span>
                  <span>Parent Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUnauthPage('downloads')}
                  className={`flex items-center gap-1.5 rounded-xl px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-bold transition whitespace-nowrap min-h-[36px] ${
                    unauthPage === 'downloads'
                      ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  <span>📥</span>
                  <span>Download Apps</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUnauthPage('features')}
                  className={`flex items-center gap-1.5 rounded-xl px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-bold transition whitespace-nowrap min-h-[36px] ${
                    unauthPage === 'features'
                      ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  <span>🛡️</span>
                  <span>Safety Features</span>
                </button>
              </nav>
            )}

            {/* Right: Active Child Selector (Authenticated) + API Status Badge */}
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 order-2 md:order-3">
              {auth.state === 'authenticated' && children.items.length > 0 && (
                <div className="flex items-center gap-1.5 sm:gap-2 rounded-xl bg-slate-50 border border-slate-200/80 px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-2xs">
                  <span className="text-slate-500 text-[11px] sm:text-xs shrink-0">Active Child:</span>
                  <select
                    value={selectedChildId || children.items[0]?.id || ''}
                    onChange={(e) => setSelectedChildId(e.target.value)}
                    className="rounded-lg bg-white border border-slate-200 px-2 py-1 text-xs font-bold text-sky-700 outline-none focus:border-sky-500 transition cursor-pointer min-h-[30px]"
                    aria-label="Active Child selector"
                  >
                    {children.items.map((c) => (
                      <option key={c.id} value={c.id}>Child: {c.displayName}</option>
                    ))}
                  </select>
                </div>
              )}

              <span className={`inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-full px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold tracking-wide border shadow-2xs whitespace-nowrap transition-all duration-300 ${apiAvailable ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-emerald-500/5' : 'bg-amber-50 text-amber-700 border-amber-200/80'}`}>
                <span className={`size-1.5 sm:size-2 rounded-full ${apiAvailable ? 'bg-emerald-500 animate-pulse ring-4 ring-emerald-100' : 'bg-amber-500 ring-4 ring-amber-100'}`} />
                <span className="hidden sm:inline">{apiAvailable ? 'Protected & Active' : 'Connecting…'}</span>
                <span className="sm:hidden">{apiAvailable ? 'Active' : 'Connecting'}</span>
              </span>
            </div>
          </div>

          {/* Bottom Row: Authenticated Dashboard Views Navigation Bar */}
          {auth.state === 'authenticated' && (
            <nav aria-label="Dashboard Views" className="border-t border-slate-100 bg-slate-50/70 px-3 sm:px-6 py-2 flex items-center justify-between gap-2 transition">
              <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto w-full py-0.5 touch-scroll-x no-scrollbar">
                <button
                  type="button"
                  aria-label="Overview"
                  onClick={() => setCurrentPage('overview')}
                  className={`flex items-center gap-1.5 sm:gap-2 rounded-xl px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold transition whitespace-nowrap min-h-[38px] ${
                    currentPage === 'overview'
                      ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-2xs'
                  }`}
                >
                  <span>🏠</span>
                  <span>Overview</span>
                </button>

                <button
                  type="button"
                  aria-label="Screen Time"
                  onClick={() => {
                    setCurrentPage('screentime');
                    if (!selectedChildId && children.items.length > 0) {
                      setSelectedChildId(children.items[0].id);
                    }
                  }}
                  className={`flex items-center gap-1.5 sm:gap-2 rounded-xl px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold transition whitespace-nowrap min-h-[38px] ${
                    currentPage === 'screentime'
                      ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-2xs'
                  }`}
                >
                  <span>⏱️</span>
                  <span>Screen Time</span>
                </button>

                <button
                  type="button"
                  aria-label="Rules & Limits"
                  onClick={() => {
                    setCurrentPage('rules');
                    if (!selectedChildId && children.items.length > 0) {
                      setSelectedChildId(children.items[0].id);
                    }
                  }}
                  className={`flex items-center gap-1.5 sm:gap-2 rounded-xl px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold transition whitespace-nowrap min-h-[38px] ${
                    currentPage === 'rules'
                      ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-2xs'
                  }`}
                >
                  <span>🛡️</span>
                  <span>Rules &amp; Limits</span>
                </button>

                <button
                  type="button"
                  aria-label="Paired Devices"
                  onClick={() => {
                    setCurrentPage('devices');
                    loadDevices();
                  }}
                  className={`flex items-center gap-1.5 sm:gap-2 rounded-xl px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold transition whitespace-nowrap min-h-[38px] ${
                    currentPage === 'devices'
                      ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-2xs'
                  }`}
                >
                  <span>📱</span>
                  <span>Paired Devices</span>
                  {devices.items.length > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${currentPage === 'devices' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>
                      {devices.items.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  aria-label="Downloads"
                  onClick={() => setCurrentPage('downloads')}
                  className={`flex items-center gap-1.5 sm:gap-2 rounded-xl px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold transition whitespace-nowrap min-h-[38px] ${
                    currentPage === 'downloads'
                      ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-2xs'
                  }`}
                >
                  <span>📥</span>
                  <span>Downloads</span>
                </button>
              </div>
            </nav>
          )}
        </header>

        <section aria-labelledby="welcome-title">

        {auth.state === 'authenticated' ? (
          <div className="space-y-8">
            {/* 1. SEPARATE PAGE: SCREEN TIME */}
            {currentPage === 'screentime' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 text-base">⏱️</span>
                      <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Screen Time Analytics</h2>
                    </div>
                    <p className="mt-1 text-xs sm:text-sm text-slate-500">
                      Live daily usage measurements, app launches, and phone pickups reported from child companion devices.
                    </p>
                  </div>

                  {children.items.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                      <span className="text-xs font-semibold text-slate-400 mr-1 hidden sm:inline">Select Child:</span>
                      {children.items.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => setSelectedChildId(child.id)}
                          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition shadow-2xs ${
                            selectedChild?.id === child.id
                              ? 'bg-sky-600 text-white shadow-sky-500/20'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80'
                          }`}
                        >
                          <span className="size-2 rounded-full bg-emerald-400" />
                          <span>{child.displayName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {children.items.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center space-y-3">
                    <p className="text-sm font-semibold text-slate-600">No child profiles found.</p>
                    <p className="text-xs text-slate-400">Please create a child profile in the Overview page to track screen time.</p>
                    <button
                      type="button"
                      onClick={() => setCurrentPage('overview')}
                      className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition shadow-xs"
                    >
                      Go to Overview
                    </button>
                  </div>
                ) : (
                  <>
                    <ScreenTimeView child={selectedChild} />
                    <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                      <span className="text-sky-900 font-medium">
                        Want to customize screen time limits or set quiet bedtime hours for {selectedChild?.displayName}?
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage('rules')}
                        className="rounded-xl bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-sky-500 transition shadow-xs whitespace-nowrap"
                      >
                        Adjust Rules &amp; Limits →
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 2. SEPARATE PAGE: RULES & LIMITS */}
            {currentPage === 'rules' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 text-base">🛡️</span>
                      <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Rules &amp; Safety Limits</h2>
                    </div>
                    <p className="mt-1 text-xs sm:text-sm text-slate-500">
                      Enforce daily screen-time caps, quiet bedtime hours, app restrictions, and web domain filtering.
                    </p>
                  </div>

                  {children.items.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                      <span className="text-xs font-semibold text-slate-400 mr-1 hidden sm:inline">Select Child:</span>
                      {children.items.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => setSelectedChildId(child.id)}
                          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition shadow-2xs ${
                            selectedChild?.id === child.id
                              ? 'bg-sky-600 text-white shadow-sky-500/20'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80'
                          }`}
                        >
                          <span className="size-2 rounded-full bg-sky-400" />
                          <span>{child.displayName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {children.items.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center space-y-3">
                    <p className="text-sm font-semibold text-slate-600">No child profiles found.</p>
                    <p className="text-xs text-slate-400">Please create a child profile in the Overview page to set rules.</p>
                    <button
                      type="button"
                      onClick={() => setCurrentPage('overview')}
                      className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition shadow-xs"
                    >
                      Go to Overview
                    </button>
                  </div>
                ) : (
                  <>
                    <PolicyManager
                      child={selectedChild}
                      onPolicyVersionChange={(ver) => {
                        if (selectedChild) {
                          setChildPolicyVersions((prev) => ({ ...prev, [selectedChild.id]: ver }));
                        }
                      }}
                      onPolicySaved={() => {
                        loadDevices();
                        setTimeout(() => loadDevices(), 2500);
                        setTimeout(() => loadDevices(), 5000);
                      }}
                    />
                    <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                      <span className="text-sky-900 font-medium">
                        Want to inspect real-time usage and app breakdown for {selectedChild?.displayName}?
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage('screentime')}
                        className="rounded-xl bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-sky-500 transition shadow-xs whitespace-nowrap"
                      >
                        View Screen Time Activity →
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 3. SEPARATE PAGE: PAIRED DEVICES */}
            {currentPage === 'devices' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 text-base">📱</span>
                      <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Paired Devices &amp; Sync Status</h2>
                    </div>
                    <p className="mt-1 text-xs sm:text-sm text-slate-500">
                      Manage all connected companion devices, heartbeat activity, and policy synchronization.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => loadDevices()}
                      disabled={devices.state === 'loading'}
                      className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs disabled:opacity-50 transition"
                    >
                      {devices.state === 'loading' ? 'Refreshing…' : '🔄 Refresh Devices'}
                    </button>
                  </div>
                </div>

                {/* Pairing Code Card if active */}
                {pairingCode && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 sm:p-5 shadow-xs" role="region" aria-label="Active pairing code">
                    {pairingCode.status === 'active' ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">One-time pairing code ({pairingCode.childName})</span>
                          <span className="rounded-full bg-emerald-200/60 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800">Active</span>
                        </div>
                        <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-emerald-200">
                          <code
                            onClick={() => copyPairingCode(pairingCode.code)}
                            title="Click to copy pairing code"
                            className="font-mono text-xl sm:text-2xl font-bold tracking-widest text-emerald-900 select-all cursor-pointer hover:text-emerald-700 transition text-center sm:text-left"
                          >
                            {pairingCode.code}
                          </code>
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <button
                              type="button"
                              onClick={() => copyPairingCode(pairingCode.code)}
                              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition active:scale-95 min-h-[36px] ${
                                copiedCode
                                  ? 'bg-emerald-600 text-white'
                                  : 'border border-emerald-300 bg-emerald-100/80 text-emerald-900 hover:bg-emerald-200'
                              }`}
                            >
                              <span>{copiedCode ? 'Copied!' : 'Copy code'}</span>
                            </button>
                            <button
                              type="button"
                              className="flex-1 sm:flex-initial rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition min-h-[36px] text-center"
                              disabled={pairingAction.cancelling}
                              onClick={cancelPairingCode}
                            >
                              {pairingAction.cancelling ? 'Cancelling…' : 'Cancel code'}
                            </button>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Enter this code in the Android companion app or Chrome extension popup. Expires at {new Date(pairingCode.expiresAt).toLocaleTimeString()}.
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

                <DeviceStatusView
                  devices={devices.items}
                  activeChild={selectedChild}
                  policyVersion={selectedChild ? (childPolicyVersions[selectedChild.id] ?? 1) : 1}
                  onRequestPairing={requestPairingCode}
                  onRevokeDevice={(d) => revokeDevice(d.id)}
                  revokingId={deviceAction.busyId}
                />
              </div>
            )}

            {/* 4. SEPARATE PAGE: DOWNLOADS */}
            {currentPage === 'downloads' && (
              <div className="space-y-6">
                <DownloadsView isStandalone={true} />
              </div>
            )}

            {/* 5. SEPARATE PAGE: OVERVIEW (DASHBOARD) */}
            {currentPage === 'overview' && (
              <>
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
                            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                              <button
                                type="button"
                                className={`col-span-2 sm:col-span-1 rounded-xl border px-3 sm:px-3.5 py-2 sm:py-1.5 text-xs font-semibold shadow-xs transition text-center min-h-[38px] ${
                                  selectedChildId === child.id
                                    ? 'border-sky-500 bg-sky-600 text-white hover:bg-sky-700 shadow-sky-100'
                                    : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
                                }`}
                                onClick={() => {
                                  if (selectedChildId === child.id) {
                                    setSelectedChildId(null);
                                  } else {
                                    setSelectedChildId(child.id);
                                    setTimeout(() => {
                                      const el = document.getElementById(`child-control-center-${child.id}`);
                                      if (typeof el?.scrollIntoView === 'function') {
                                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                      }
                                    }, 50);
                                  }
                                }}
                                aria-label={`Manage rules & screen time for ${child.displayName}`}
                              >
                                {selectedChildId === child.id ? 'Close controls' : 'Rules & Screen Time'}
                              </button>
                              <button
                                type="button"
                                className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 sm:px-3.5 py-2 sm:py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 shadow-xs transition disabled:opacity-50 text-center min-h-[38px]"
                                disabled={pairingAction.busyChildId === child.id}
                                onClick={() => requestPairingCode(child)}
                                aria-label={`Pair a device for ${child.displayName}`}
                              >
                                {pairingAction.busyChildId === child.id ? 'Pairing…' : 'Pair device'}
                              </button>
                              <button
                                type="button"
                                className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 shadow-xs transition shrink-0 min-h-[38px]"
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
                                  <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-emerald-200">
                                    <code
                                      onClick={() => copyPairingCode(pairingCode.code)}
                                      title="Click to copy pairing code"
                                      className="font-mono text-xl sm:text-2xl font-bold tracking-widest text-emerald-900 select-all cursor-pointer hover:text-emerald-700 transition text-center sm:text-left"
                                    >
                                      {pairingCode.code}
                                    </code>
                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                      <button
                                        type="button"
                                        onClick={() => copyPairingCode(pairingCode.code)}
                                        className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition active:scale-95 min-h-[36px] ${
                                          copiedCode
                                            ? 'bg-emerald-600 text-white'
                                            : 'border border-emerald-300 bg-emerald-100/80 text-emerald-900 hover:bg-emerald-200'
                                        }`}
                                        title="Copy pairing code"
                                      >
                                        {copiedCode ? (
                                          <>
                                            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                            </svg>
                                            <span>Copied!</span>
                                          </>
                                        ) : (
                                          <>
                                            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                                            </svg>
                                            <span>Copy code</span>
                                          </>
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        className="flex-1 sm:flex-initial rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition min-h-[36px] text-center"
                                        disabled={pairingAction.cancelling}
                                        onClick={cancelPairingCode}
                                      >
                                        {pairingAction.cancelling ? 'Cancelling…' : 'Cancel code'}
                                      </button>
                                    </div>
                                  </div>
                                  <p className="mt-2 text-xs text-slate-500">
                                    Enter this code in the BalaKavach Android companion app or Chrome desktop extension popup. Kept in memory only; not stored in browser storage. Expires at {new Date(pairingCode.expiresAt).toLocaleTimeString()}.
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

                          {/* Child Profile Controls (Rendered inline directly underneath this child) */}
                          {selectedChildId === child.id && (
                            <div
                              id={`child-control-center-${child.id}`}
                              className="mt-4 rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50/40 via-white to-white p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-5"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-100 pb-4">
                                <div className="flex items-center justify-between w-full sm:w-auto gap-3">
                                  <div className="flex items-center gap-2.5 sm:gap-3">
                                    <div className="flex size-9 sm:size-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white font-bold text-sm sm:text-base shadow-xs">
                                      {child.displayName[0].toUpperCase()}
                                    </div>
                                    <div>
                                      <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-sky-600">Parent Control Center</span>
                                      <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-tight">{child.displayName}</h3>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 sm:hidden">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedChildId(child.id);
                                        setCurrentPage(activeTab === 'policy' ? 'rules' : activeTab === 'devices' ? 'devices' : 'screentime');
                                      }}
                                      className="rounded-xl border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 hover:bg-sky-100 transition shadow-2xs"
                                    >
                                      Full Page ↗
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedChildId(null)}
                                      className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-xs"
                                      aria-label="Close child controls"
                                    >
                                      Close
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                  <div className="w-full sm:w-auto flex items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs overflow-x-auto touch-scroll-x no-scrollbar">
                                    <button
                                      type="button"
                                      onClick={() => setActiveTab('screentime')}
                                      className={`flex-1 sm:flex-initial whitespace-nowrap rounded-lg py-2 sm:py-1.5 px-2.5 sm:px-3 text-center font-semibold transition min-h-[34px] ${
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
                                      className={`flex-1 sm:flex-initial whitespace-nowrap rounded-lg py-2 sm:py-1.5 px-2.5 sm:px-3 text-center font-semibold transition min-h-[34px] ${
                                        activeTab === 'policy'
                                          ? 'bg-white text-sky-700 shadow-xs'
                                          : 'text-slate-600 hover:text-slate-900'
                                      }`}
                                    >
                                      Rules &amp; Schedules
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveTab('devices');
                                        loadDevices();
                                      }}
                                      className={`flex-1 sm:flex-initial whitespace-nowrap rounded-lg py-2 sm:py-1.5 px-2.5 sm:px-3 text-center font-semibold transition min-h-[34px] ${
                                        activeTab === 'devices'
                                          ? 'bg-white text-sky-700 shadow-xs'
                                          : 'text-slate-600 hover:text-slate-900'
                                      }`}
                                    >
                                      Devices &amp; Sync
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedChildId(child.id);
                                      setCurrentPage(activeTab === 'policy' ? 'rules' : activeTab === 'devices' ? 'devices' : 'screentime');
                                    }}
                                    className="hidden sm:inline-block rounded-xl border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-100 transition shadow-xs shrink-0"
                                    title="Open this section in its dedicated separate page"
                                  >
                                    Full Page ↗
                                  </button>
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

                              {activeTab === 'screentime' && <ScreenTimeView child={child} />}
                              {activeTab === 'policy' && (
                                <PolicyManager
                                  child={child}
                                  onPolicyVersionChange={(ver) => {
                                    setChildPolicyVersions((prev) => ({ ...prev, [child.id]: ver }));
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
                                  activeChild={child}
                                  policyVersion={childPolicyVersions[child.id] ?? 1}
                                  onRequestPairing={requestPairingCode}
                                  onRevokeDevice={(d) => revokeDevice(d.id)}
                                  revokingId={deviceAction.busyId}
                                />
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

                {/* Downloads Shortcut Banner */}
                <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-sky-50/50 via-white to-emerald-50/50 p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 text-2xl shadow-2xs">
                      📱
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Need to install companion apps on child devices?</h3>
                      <p className="text-xs text-slate-500">Download the Android companion app APK or Chrome desktop extension.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage('downloads')}
                    className="w-full sm:w-auto rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-xs text-center"
                  >
                    Open Downloads Page →
                  </button>
                </div>
              </>
            )}
          </div>
        ) : auth.state === 'checking' ? (
          <p className="mt-8 text-sm text-slate-500" role="status">Checking sign-in status…</p>
        ) : (
          <div className="space-y-6">
            {/* Unauthenticated View: Downloads Page */}
            {unauthPage === 'downloads' && (
              <DownloadsView isStandalone={true} />
            )}

            {/* Unauthenticated View: Safety Features Showcase */}
            {unauthPage === 'features' && (
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="rounded-3xl border border-slate-200/90 bg-white/95 backdrop-blur-sm p-6 sm:p-8 shadow-md shadow-slate-200/50 text-center space-y-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-sky-700">
                    Family Safety System
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Complete Protection for Your Children</h2>
                  <p className="text-sm text-slate-500 max-w-2xl mx-auto">
                    BalaKavach gives parents peace of mind with real-time screen-time tracking, bedtime scheduling, app restrictions, and web domain filtering.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 text-left">
                    <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-5 space-y-2">
                      <span className="text-2xl">⏱️</span>
                      <h3 className="font-bold text-slate-900 text-sm">Real Screen Time</h3>
                      <p className="text-xs text-slate-600">Track actual active device usage with phone pickups, app launch frequencies, and per-app breakdowns.</p>
                    </div>
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5 space-y-2">
                      <span className="text-2xl">🌙</span>
                      <h3 className="font-bold text-slate-900 text-sm">Bedtime &amp; Quiet Hours</h3>
                      <p className="text-xs text-slate-600">Automate evening quiet hours to help kids wind down and sleep peacefully without late-night distractions.</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 space-y-2">
                      <span className="text-2xl">🛡️</span>
                      <h3 className="font-bold text-slate-900 text-sm">Web &amp; App Filtering</h3>
                      <p className="text-xs text-slate-600">Block gaming and adult domains instantly across companion Android phones and Chrome desktop browsers.</p>
                    </div>
                  </div>
                  <div className="pt-4 flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setUnauthPage('auth')}
                      className="rounded-xl bg-sky-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-sky-500 transition shadow-xs"
                    >
                      Get Started / Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnauthPage('downloads')}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-xs"
                    >
                      Download Companion Apps
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Unauthenticated View: Default Login / Register & Downloads Side-by-Side */}
            {unauthPage === 'auth' && (
              <div className="mt-4 sm:mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch w-full">
                {/* Left Column: Sign In / Register Card */}
                <div className="flex flex-col w-full">
                  <div className="flex-1 rounded-3xl border border-slate-200/90 bg-white/95 backdrop-blur-sm p-4 sm:p-6 lg:p-8 shadow-md shadow-slate-200/50 flex flex-col justify-between transition">
                    <div>
                      {/* Top Header inside Left Card */}
                      <div className="mb-6 border-b border-slate-100 pb-5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200/80 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-sky-700">
                            <span className="size-1.5 rounded-full bg-sky-600" />
                            Parent Portal
                          </span>
                          <span className="text-[11px] font-semibold text-slate-400">
                            {mode === 'login' ? 'Secure Sign-In' : 'New Parent Setup'}
                          </span>
                        </div>
                        <h1 id="welcome-title" className="mt-2.5 text-2xl sm:text-[26px] font-extrabold tracking-tight text-slate-900 leading-tight">
                          {mode === 'login' ? 'Sign in to BalaKavach' : 'Create Parent Account'}
                        </h1>
                        <p className="mt-1 text-xs sm:text-sm text-slate-500">
                          {mode === 'login' ? 'Manage screen time and protection for your family.' : 'Set up your parent dashboard in under a minute.'}
                        </p>
                      </div>

                      {/* Mode Tabs */}
                      <div aria-label="Authentication options" className="mb-5 flex gap-1 rounded-2xl bg-slate-100/80 p-1 border border-slate-200/70" role="group">
                        <button
                          aria-pressed={mode === 'login'}
                          className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all duration-200 min-h-[42px] ${mode === 'login' ? 'bg-white text-sky-700 shadow-sm shadow-slate-300/40 ring-1 ring-black/5' : 'text-slate-600 hover:text-slate-900'}`}
                          onClick={() => { setMode('login'); setFormMessage(null); }}
                          type="button"
                        >
                          Sign in
                        </button>
                        <button
                          aria-pressed={mode === 'register'}
                          className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all duration-200 min-h-[42px] ${mode === 'register' ? 'bg-white text-sky-700 shadow-sm shadow-slate-300/40 ring-1 ring-black/5' : 'text-slate-600 hover:text-slate-900'}`}
                          onClick={() => { setMode('register'); setFormMessage(null); }}
                          type="button"
                        >
                          Register
                        </button>
                      </div>

                      {/* Form */}
                      <form className="space-y-4" onSubmit={submitCredentials}>
                        <div>
                          <label className="mb-1.5 block text-xs font-bold text-slate-700 tracking-wide uppercase" htmlFor="parent-email">Email</label>
                          <input
                            autoComplete="username"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition shadow-2xs"
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
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-bold text-slate-700 tracking-wide uppercase" htmlFor="parent-password">Password</label>
                            {mode === 'login' && (
                              <span className="text-[11px] text-slate-400 font-medium">Encrypted &amp; Secure</span>
                            )}
                          </div>
                          <input
                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition shadow-2xs"
                            id="parent-password"
                            maxLength={128}
                            minLength={mode === 'register' ? 8 : 1}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="••••••••"
                            required
                            type="password"
                            value={password}
                          />
                          {mode === 'register' && <p className="mt-1.5 text-[11px] font-medium text-slate-500">Must be at least 8 characters.</p>}
                        </div>

                        {formMessage && (
                          <div className={`rounded-xl border p-3 text-xs font-semibold ${formMessage.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`} role={formMessage.type === 'error' ? 'alert' : 'status'}>
                            {formMessage.text}
                          </div>
                        )}
                        {auth.state === 'unavailable' && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800" role="alert">
                            Sign-in status could not be checked. You can still try signing in.
                          </div>
                        )}

                        <button
                          className="w-full rounded-xl bg-gradient-to-r from-sky-600 via-sky-600 to-indigo-600 px-4 py-3 min-h-[46px] text-sm font-bold text-white hover:from-sky-500 hover:to-indigo-500 shadow-md shadow-sky-600/20 hover:shadow-lg hover:shadow-sky-600/30 disabled:cursor-wait disabled:opacity-60 transition active:scale-[0.99] flex items-center justify-center gap-2"
                          disabled={submitting}
                          type="submit"
                        >
                          {submitting ? (
                            <>
                              <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                              <span>Please wait…</span>
                            </>
                          ) : (
                            <span>{mode === 'login' ? 'Continue' : 'Create account'}</span>
                          )}
                        </button>
                      </form>
                    </div>

                    {/* Status Footer */}
                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500" role="status" aria-live="polite">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${healthColor} ring-4 ${apiAvailable ? 'ring-emerald-100' : 'ring-rose-100'}`} />
                        <span className="font-bold text-slate-700">{healthLabel}</span>
                        <span className="text-slate-300">•</span>
                        <span className="font-medium text-slate-500">
                          {isLoadingHealth && 'Contacting API server…'}
                          {apiAvailable && `MongoDB ${health.data?.dependencies?.mongodb ?? 'connected'}`}
                          {health.state === 'unavailable' && (
                            typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
                              ? 'Start the API at localhost:5000'
                              : 'API service waking up or connecting. Retrying…'
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Clean Child Device Apps Download */}
                <div className="flex flex-col w-full">
                  <DownloadsView />
                </div>
              </div>
            )}
          </div>
        )}
        </section>
      </main>
    </div>
  );
}
