import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AdapterProvider, useAdapter } from './data/AdapterContext';
import type { DataAdapter } from './data/DataAdapter';
import { DataAdapterError } from './data/errors';
import { selectAdapter } from './data/selectAdapter';
import { useRefresh } from './data/useGridData';
import { getValidToken, loadSession, signOut } from './auth/cognito';
import { analyze } from '@gridrisk/engine';
import { SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import { Radio, Siren } from 'lucide-react';
import { AgentInvestigating } from './components/AgentInvestigating';
import { SidePanel } from './components/SidePanel';
import { AlertCard } from './components/AlertCard';
import { useRecentArrivals } from './data/useRecentArrivals';
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
  const newIds = useRecentArrivals();
  const [feedCollapsed, setFeedCollapsed] = useState(false);
  const [alertsCollapsed, setAlertsCollapsed] = useState(false);

  // Zones the engine sees as cut off whose alert hasn't arrived yet: the agent is working on them.
  const investigating = useMemo(() => {
    const alerted = new Set(alerts.map((a) => a.zoneId));
    return analyze(events, ZONES, { shelters: SHELTERS })
      .filter((r) => r.isolated && !alerted.has(r.zoneId))
      .flatMap((r) => ZONES.filter((z) => z.id === r.zoneId));
  }, [events, alerts]);

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
    <div className="flex h-full flex-col bg-slate-950 text-ink">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-800 bg-slate-900 px-4 py-2">
        <h1 className="flex items-baseline gap-2 font-mono tracking-widest whitespace-nowrap">
          <span className="text-base font-bold text-slate-50">GridRisk</span>
          <span className="text-[10px] text-slate-400"> • LIVE FEED • SYNTHETIC DATA</span>
        </h1>
        <StatsBar />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DevToolbar />
          {email && (
            <span className="flex items-center gap-2 font-mono text-xs text-slate-300">
              <span className="max-w-[12rem] truncate text-slate-400" title={email}>
                {email}
              </span>
              <button
                type="button"
                onClick={() => onUnauthenticated()}
                className="rounded border border-slate-600 px-2 py-0.5 whitespace-nowrap text-slate-100 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
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

      <main className="flex-1 space-y-3 overflow-y-auto p-3">
        <section aria-label="Map" className="map-frame">
          <MapBoundary>
            <Suspense fallback={<p className="p-4 text-sm text-slate-300">Loading map…</p>}>
              <MapComponent />
            </Suspense>
          </MapBoundary>
        </section>

        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <SidePanel
            label="Alerts"
            icon={Siren}
            count={alerts.filter((a) => a.status === 'pending').length + investigating.length}
            alarm={alerts.some((a) => a.status === 'pending') || investigating.length > 0}
            collapsed={alertsCollapsed}
            onToggle={() => setAlertsCollapsed((c) => !c)}
          >
            <div className="space-y-3">
              {investigating.map((z) => (
                <AgentInvestigating key={`investigating-${z.id}`} zoneName={z.name} />
              ))}
              {alerts.length === 0 && investigating.length === 0 ? (
                <p className="text-sm text-slate-300">No active alerts.</p>
              ) : (
                alerts.map((a) => (
                  <AlertCard key={a.id} alert={a} onApproved={() => void safeRefresh()} />
                ))
              )}
            </div>
          </SidePanel>
          <SidePanel
            label="Event feed"
            icon={Radio}
            count={events.length}
            alarm={events.some((e) => e.severity === 'critical')}
            collapsed={feedCollapsed}
            onToggle={() => setFeedCollapsed((c) => !c)}
          >
            <EventFeed
              events={events}
              newIds={newIds}
              hideHeading
              selectedEventId={selectedEventId}
              onSelect={(e) => selectEvent(e.id)}
            />
          </SidePanel>
        </div>
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
