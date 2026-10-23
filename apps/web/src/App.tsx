/**
 * M0 shell. TODO(Darsh): Task 2 (store + MockAdapter + dev toolbar), Task 3 (MapComponent),
 * Task 4 (EventFeed), Task 5 (AlertCard). See todo/darsh-ui.md.
 */
export function App() {
  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <header className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
        <h1 className="font-mono text-sm tracking-widest">GridRisk • LIVE FEED • SYNTHETIC DATA</h1>
        <span className="flex items-center gap-2 font-mono text-xs text-slate-300">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-critical" />
          LIVE
        </span>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[18rem_1fr_22rem]">
        <aside aria-label="Event feed" className="border-r border-slate-700 p-4">
          <p className="text-sm text-slate-300">Event feed – TODO(Darsh): EventFeed (Task 4)</p>
        </aside>
        <section aria-label="Map" className="flex items-center justify-center">
          <p className="text-sm text-slate-300">Map – TODO(Darsh): MapComponent (Task 3)</p>
        </section>
        <aside aria-label="Alerts" className="border-l border-slate-700 p-4">
          <p className="text-sm text-slate-300">Alerts – TODO(Darsh): AlertCard (Task 5)</p>
        </aside>
      </main>
    </div>
  );
}
