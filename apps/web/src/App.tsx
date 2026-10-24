import { useState } from 'react';
import { buildScenario } from '@gridrisk/engine';
import { EventFeed } from './components/EventFeed';

/**
 * M0 shell. TODO(Bushra): Task 2 (store + MockAdapter + dev toolbar), Task 3 (MapComponent),
 * Task 5 (AlertCard). See todo/bushra-ui.md.
 */
export function App() {
  // TODO(Bushra): replace with the Task 2 store (`events`, `selectedEventId`) and fly the map
  // to the selected event in onSelect.
  const [events] = useState(() => buildScenario('calm'));
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <header className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
        <h1 className="font-mono text-sm tracking-widest">GridRisk • LIVE FEED • SYNTHETIC DATA</h1>
        <span className="flex items-center gap-2 font-mono text-xs text-slate-300">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-critical" />
          LIVE
        </span>
      </header>

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
        <section aria-label="Map" className="flex items-center justify-center">
          <p className="text-sm text-slate-300">Map – TODO(Bushra): MapComponent (Task 3)</p>
        </section>
        <aside aria-label="Alerts" className="border-l border-slate-700 p-4">
          <p className="text-sm text-slate-300">Alerts – TODO(Bushra): AlertCard (Task 5)</p>
        </aside>
      </main>
    </div>
  );
}
