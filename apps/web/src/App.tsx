import { lazy, Suspense, useEffect, useMemo } from 'react';
import { AdapterProvider } from './data/AdapterContext';
import type { DataAdapter } from './data/DataAdapter';
import { selectAdapter } from './data/selectAdapter';
import { useRefresh } from './data/useGridData';
import { DevToolbar } from './components/DevToolbar';
import { EventFeed } from './components/EventFeed';
import { MapBoundary } from './components/MapBoundary';
import { StatsBar } from './components/StatsBar';
import { useGridStore } from './store';

// Lazy so maplibre-gl stays out of the first bundle.
const MapComponent = lazy(() => import('./map/MapComponent'));

function Shell() {
  const refresh = useRefresh();
  const events = useGridStore((s) => s.events);
  const alerts = useGridStore((s) => s.alerts);
  const selectedEventId = useGridStore((s) => s.selectedEventId);
  const selectEvent = useGridStore((s) => s.selectEvent);

  useEffect(() => {
    void refresh().catch(() => undefined); // TODO(Task 13b): show an offline/error banner
  }, [refresh]);

  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <header className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
        <h1 className="font-mono text-sm tracking-widest">GridRisk • LIVE FEED • SYNTHETIC DATA</h1>
        <div className="flex items-center gap-4">
          <DevToolbar />
          <span className="flex items-center gap-2 font-mono text-xs text-slate-300">
            <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-critical" />
            LIVE
          </span>
        </div>
      </header>

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
        <aside aria-label="Alerts" className="border-l border-slate-700 p-4">
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-300">No active alerts.</p>
          ) : (
            // TODO(Bushra): replace with AlertCard (Task 5)
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id} className="font-mono text-sm">
                  {a.title} <span className="text-slate-300">({a.status})</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>
    </div>
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
