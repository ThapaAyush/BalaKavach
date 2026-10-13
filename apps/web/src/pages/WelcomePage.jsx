import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';

export default function WelcomePage() {
  const [health, setHealth] = useState({ state: 'loading', data: null });

  useEffect(() => {
    const controller = new AbortController();

    apiGet('/health', { signal: controller.signal })
      .then((data) => setHealth({ state: 'available', data }))
      .catch((error) => {
        if (error.name !== 'AbortError') setHealth({ state: 'unavailable', data: null });
      });

    return () => controller.abort();
  }, []);

  const isLoading = health.state === 'loading';
  const isAvailable = health.state === 'available';
  const label = isLoading ? 'Checking API connection' : isAvailable ? 'API available' : 'API unavailable';
  const statusColor = isLoading ? 'bg-amber-400' : isAvailable ? 'bg-emerald-400' : 'bg-rose-400';

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-5 py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(63,63,70,0.26),_transparent_58%)]" />
      <section aria-labelledby="welcome-title" className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-zinc-950/80 p-7 shadow-2xl shadow-black/40 sm:p-10">
        <div className="mb-10 flex items-center gap-3">
          <div aria-hidden="true" className="grid size-10 place-items-center rounded-xl border border-white/10 bg-zinc-900 text-lg font-semibold text-white">K</div>
          <span className="text-sm font-semibold tracking-wide text-zinc-100">KidsGuard</span>
        </div>

        <p className="text-sm font-medium text-zinc-400">Parent dashboard</p>
        <h1 id="welcome-title" className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">A calmer way to stay connected.</h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-zinc-400">Your KidsGuard workspace is being set up. This foundation currently checks the API connection; family controls will arrive in the next implementation stage.</p>

        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3" role="status" aria-live="polite">
          <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${statusColor}`} />
          <div>
            <p className="text-sm font-medium text-zinc-100">{label}</p>
            <p className="mt-1 text-sm text-zinc-500">
              {isLoading && 'Contacting the local KidsGuard API…'}
              {isAvailable && `MongoDB ${health.data?.dependencies?.mongodb ?? 'status unknown'}${health.data?.status === 'degraded' ? ' — configure MONGODB_URI to enable database features.' : '.'}`}
              {health.state === 'unavailable' && 'Start the API at localhost:5000 to check its health.'}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
