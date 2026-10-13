import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../lib/api.js';

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
      if (auth.state === 'signed-out') setChildren({ state: 'idle', items: [] });
      return undefined;
    }

    const controller = new AbortController();
    setChildren({ state: 'loading', items: [] });
    apiGet('/children', { signal: controller.signal })
      .then((data) => setChildren({ state: 'ready', items: data.children }))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        if (error.status === 401) {
          setAuth({ state: 'signed-out', parent: null });
          return;
        }
        setChildren({ state: 'error', items: [] });
      });

    return () => controller.abort();
  }, [auth.state, auth.parent?.id]);

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

  const isLoadingHealth = health.state === 'loading';
  const apiAvailable = health.state === 'available';
  const healthLabel = isLoadingHealth
    ? 'Checking API connection'
    : apiAvailable ? 'API available' : 'API unavailable';
  const healthColor = isLoadingHealth
    ? 'bg-amber-400'
    : apiAvailable ? 'bg-emerald-400' : 'bg-rose-400';

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-5 py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(63,63,70,0.26),_transparent_58%)]" />
      <section aria-labelledby="welcome-title" className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-zinc-950/80 p-7 shadow-2xl shadow-black/40 sm:p-10">
        <div className="mb-10 flex items-center gap-3">
          <div aria-hidden="true" className="grid size-10 place-items-center rounded-xl border border-white/10 bg-zinc-900 text-lg font-semibold text-white">K</div>
          <span className="text-sm font-semibold tracking-wide text-zinc-100">KidsGuard</span>
        </div>

        <p className="text-sm font-medium text-zinc-400">Parent account</p>
        <h1 id="welcome-title" className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">A calmer way to stay connected.</h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-zinc-400">Create a parent account or sign in to your KidsGuard workspace. Family controls are planned for a later stage.</p>

        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3" role="status" aria-live="polite">
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

        {auth.state === 'authenticated' ? (
          <div className="mt-8 space-y-5">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-zinc-400">Signed in as</p>
              <p className="mt-1 break-all text-base font-medium text-zinc-100">{auth.parent.email}</p>
              <button
                className="mt-5 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
                disabled={submitting}
                onClick={signOut}
                type="button"
              >
                Sign out
              </button>
            </div>

            <section aria-labelledby="children-title" className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <h2 className="text-lg font-semibold text-white" id="children-title">Child profiles</h2>
              {children.state === 'loading' && <p className="mt-3 text-sm text-zinc-400" role="status">Loading child profiles…</p>}
              {children.state === 'error' && <p className="mt-3 text-sm text-rose-300" role="alert">Child profiles could not be loaded. Try again later.</p>}
              {children.state === 'ready' && (children.items.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-400">No child profiles yet.</p>
              ) : (
                <ul className="mt-3 space-y-2" aria-label="Saved child profiles">
                  {children.items.map((child) => (
                    <li className="rounded-xl border border-white/10 px-4 py-3" key={child.id}>
                      <p className="font-medium text-zinc-100">{child.displayName}</p>
                      {child.dateOfBirth && <p className="mt-1 text-sm text-zinc-400">Date of birth: {child.dateOfBirth}</p>}
                    </li>
                  ))}
                </ul>
              ))}

              <form className="mt-5 space-y-3 border-t border-white/10 pt-5" onSubmit={createChildProfile}>
                <h3 className="text-sm font-semibold text-zinc-200">Add a child profile</h3>
                <div>
                  <label className="mb-2 block text-sm text-zinc-300" htmlFor="child-display-name">Display name</label>
                  <input
                    autoComplete="off"
                    className="w-full rounded-xl border border-white/15 bg-zinc-900 px-4 py-3 text-white outline-none focus-visible:border-white/50"
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
                    className="w-full rounded-xl border border-white/15 bg-zinc-900 px-4 py-3 text-white outline-none focus-visible:border-white/50"
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
                  className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60"
                  disabled={creatingChild || children.state === 'loading'}
                  type="submit"
                >
                  {creatingChild ? 'Saving…' : 'Add child profile'}
                </button>
              </form>
            </section>
          </div>
        ) : auth.state === 'checking' ? (
          <p className="mt-8 text-sm text-zinc-400" role="status">Checking sign-in status…</p>
        ) : (
          <div className="mt-8">
            <div aria-label="Authentication options" className="mb-5 flex gap-2" role="group">
              <button
                aria-pressed={mode === 'login'}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${mode === 'login' ? 'bg-white text-zinc-950' : 'border border-white/15 text-zinc-300 hover:bg-white/10'}`}
                onClick={() => { setMode('login'); setFormMessage(null); }}
                type="button"
              >
                Sign in
              </button>
              <button
                aria-pressed={mode === 'register'}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${mode === 'register' ? 'bg-white text-zinc-950' : 'border border-white/15 text-zinc-300 hover:bg-white/10'}`}
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
                  minLength={mode === 'register' ? 12 : 1}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
                {mode === 'register' && <p className="mt-2 text-xs text-zinc-500">Use at least 12 characters.</p>}
              </div>
              {formMessage && (
                <p className={`text-sm ${formMessage.type === 'error' ? 'text-rose-300' : 'text-emerald-300'}`} role={formMessage.type === 'error' ? 'alert' : 'status'}>
                  {formMessage.text}
                </p>
              )}
              {auth.state === 'unavailable' && <p className="text-sm text-amber-200">Sign-in status could not be checked. You can still try signing in.</p>}
              <button
                className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60"
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
