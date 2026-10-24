import { useGridStore } from '../store';

function Stat({ label, value, alarm = false }: { label: string; value: string; alarm?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className={`font-mono text-lg ${alarm ? 'text-red-400' : 'text-slate-50'}`}>{value}</dd>
    </div>
  );
}

/** One-line situation summary above the map. */
export function StatsBar() {
  const events = useGridStore((s) => s.events);
  const alerts = useGridStore((s) => s.alerts);

  const critical = events.filter((e) => e.severity === 'critical').length;
  const pending = alerts.filter((a) => a.status === 'pending');
  const soonest =
    pending.length > 0 ? Math.min(...pending.map((a) => a.isolationWindowMinutes)) : null;

  return (
    <dl
      aria-label="Situation summary"
      className="flex items-center gap-8 border-b border-slate-700 bg-slate-900 px-4 py-2"
    >
      <Stat label="Events" value={String(events.length)} />
      <Stat label="Critical" value={String(critical)} alarm={critical > 0} />
      <Stat label="Pending alerts" value={String(pending.length)} alarm={pending.length > 0} />
      <Stat
        label="Isolation window"
        value={soonest === null ? '—' : `${soonest} min`}
        alarm={soonest !== null}
      />
    </dl>
  );
}
