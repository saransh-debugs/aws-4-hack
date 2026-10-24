import { useEffect, useMemo, useState } from 'react';
import type { AlertCardData, DemoEvent } from '@gridrisk/shared';
import { ROADS, SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import { EventFeed } from './components/EventFeed';
import { MapComponent } from './components/MapComponent';
import { selectAdapter } from './data/selectAdapter';

/**
 * Dashboard shell. Both mock and live modes load through the same DataAdapter contract, so the
 * map and event feed do not need to know whether data came from fixtures or the deployed API.
 */
export function App() {
  const adapter = useMemo(() => selectAdapter(), []);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [alerts, setAlerts] = useState<AlertCardData[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([adapter.getEvents(), adapter.getAlerts()])
      .then(([nextEvents, nextAlerts]) => {
        if (!active) return;
        setEvents(nextEvents);
        setAlerts(nextAlerts);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : 'Unable to load operational data');
      });
    return () => {
      active = false;
    };
  }, [adapter]);

  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <header className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
        <h1 className="font-mono text-sm tracking-widest">GridRisk • LIVE FEED • SYNTHETIC DATA</h1>
        <span className="flex items-center gap-2 font-mono text-xs text-slate-300">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-critical" />
          LIVE
        </span>
      </header>

      {loadError && (
        <p
          role="alert"
          className="border-b border-red-900 bg-red-950/60 px-4 py-2 text-sm text-red-200"
        >
          Data refresh failed: {loadError}
        </p>
      )}

      <main className="grid min-h-0 flex-1 grid-cols-[20rem_1fr_22rem]">
        <aside
          aria-label="Event feed"
          className="flex min-h-0 flex-col border-r border-slate-700 p-4"
        >
          <EventFeed
            events={events}
            selectedEventId={selectedEventId}
            onSelect={(e) => setSelectedEventId(e.id)}
          />
        </aside>
        <section aria-label="Map" className="min-h-0 p-3">
          <MapComponent
            events={events}
            zones={ZONES}
            roads={ROADS}
            shelters={SHELTERS}
            selectedEventId={selectedEventId}
            onSelectEvent={(event) => setSelectedEventId(event.id)}
          />
        </section>
        <aside aria-label="Alerts" className="border-l border-slate-700 p-4">
          <p className="text-sm text-slate-300">Alerts</p>
          <p className="mt-2 font-mono text-2xl text-slate-100">{alerts.length}</p>
          <p className="text-xs text-slate-400">from the active data adapter</p>
        </aside>
      </main>
    </div>
  );
}
