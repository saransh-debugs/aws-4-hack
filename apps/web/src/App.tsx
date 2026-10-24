import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AdapterProvider, useAdapter } from './data/AdapterContext';
import type { DataAdapter } from './data/DataAdapter';
import { DataAdapterError } from './data/errors';
import { selectAdapter } from './data/selectAdapter';
import { useRefresh } from './data/useGridData';
import { getValidToken, loadSession, signOut } from './auth/cognito';
import { AlertCard } from './components/AlertCard';
import { DevToolbar } from './components/DevToolbar';
import { EventFeed } from './components/EventFeed';
import { MapBoundary } from './components/MapBoundary';
import { SignIn } from './components/SignIn';
import { StatsBar } from './components/StatsBar';
import { useGridStore } from './store';

// Lazy so maplibre-gl stays out of the first bundle.
const MapComponent = lazy(() => import('./map/MapComponent'));

/** Ignore global shortcuts while the user is typing in a form control. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function Dashboard({ onUnauthenticated }: { onUnauthenticated: () => void }) {
  const adapter = useAdapter();
  const refresh = useRefresh();
  const events = useGridStore((s) => s.events);
  const alerts = useGridStore((s) => s.alerts);
  const mode = useGridStore((s) => s.mode);
  const selectedEventId = useGridStore((s) => s.selectedEventId);
  const selectEvent = useGridStore((s) => s.selectEvent);
  const [offline, setOffline] = useState(false);

  // Replaces the old refresh().catch TODO: surface fetch failures in a banner, clear on success.
  // A 401 in live mode clears the token and returns to the sign-in screen.
  const safeRefresh = useCallback(async () => {
    try {
      await refresh();
      setOffline(false);
    } catch (err) {
      if (err instanceof DataAdapterError && err.code === 'UNAUTHENTICATED') {
        onUnauthenticated();
        return;
      }
      setOffline(true);
    }
  }, [refresh, onUnauthenticated]);

  useEffect(() => {
    void safeRefresh();
  }, [safeRefresh]);

  // Live mode: poll events/alerts every 3 s. Mock mode never polls. Pause while the tab is hidden.
  useEffect(() => {
    if (mode !== 'live') return;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void safeRefresh();
    }, 3000);
    return () => clearInterval(id);
  }, [mode, safeRefresh]);

  // Task 16: hidden Shift+R reset. Ignored while focus is in a form control.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.key.toLowerCase() !== 'r') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      void (async () => {
        try {
          await adapter.reset();
          await safeRefresh();
        } catch {
          setOffline(true);
        }
      })();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adapter, safeRefresh]);

  const email = mode === 'live' ? loadSession()?.email : undefined;

  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <header className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
        <h1 className="font-mono text-sm tracking-widest">GridRisk • LIVE FEED • SYNTHETIC DATA</h1>
        <div className="flex items-center gap-4">
          <DevToolbar />
          {email && (
            <span className="flex items-center gap-2 font-mono text-xs text-slate-300">
              <span className="text-slate-400">{email}</span>
              <button
                type="button"
                onClick={() => onUnauthenticated()}
                className="rounded border border-slate-600 px-2 py-0.5 text-slate-100 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              >
                Sign out
              </button>
            </span>
          )}
          <span className="flex items-center gap-2 font-mono text-xs text-slate-300">
            <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-critical" />
            LIVE
          </span>
        </div>
      </header>

      {offline && (
        <p
          role="alert"
          className="border-b border-amber-500/50 bg-amber-500/10 px-4 py-1.5 font-mono text-xs text-amber-200"
        >
          Offline — could not reach the data source. Retrying…
        </p>
      )}

      <StatsBar />

      <main className="grid min-h-0 flex-1 grid-cols-[20rem_1fr_22rem]">
        <aside
          aria-label="Event feed"
          className="flex min-h-0 flex-col border-r border-slate-700 p-4"
        >
          <EventFeed
            events={events}
            selectedEventId={selectedEventId}
            onSelect={(e) => selectEvent(e.id)}
          />
        </aside>
        <section aria-label="Map" className="relative min-h-0">
          <MapBoundary>
            <Suspense fallback={<p className="p-4 text-sm text-slate-300">Loading map…</p>}>
              <MapComponent />
            </Suspense>
          </MapBoundary>
        </section>
        <aside
          aria-label="Alerts"
          className="min-h-0 space-y-3 overflow-y-auto border-l border-slate-700 p-4"
        >
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-300">No active alerts.</p>
          ) : (
            alerts.map((a) => (
              <AlertCard key={a.id} alert={a} onApproved={() => void safeRefresh()} />
            ))
          )}
        </aside>
      </main>
    </div>
  );
}

function Shell() {
  const mode = useGridStore((s) => s.mode);
  // In live mode, gate the dashboard behind a valid Cognito token.
  const [authed, setAuthed] = useState(() => mode !== 'live' || getValidToken() !== null);

  if (mode === 'live' && !authed) {
    return <SignIn onSignedIn={() => setAuthed(true)} />;
  }

  return (
    <Dashboard
      onUnauthenticated={() => {
        signOut();
        setAuthed(false);
      }}
    />
  );
}

export function App({ adapter }: { adapter?: DataAdapter }) {
  const resolved = useMemo(() => adapter ?? selectAdapter(), [adapter]);
  return (
    <AdapterProvider value={resolved}>
      <Shell />
    </AdapterProvider>
  );
}
