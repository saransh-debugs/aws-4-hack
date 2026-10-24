const ITEMS: Array<{ label: string; swatch: string }> = [
  { label: 'Critical event', swatch: 'h-3 w-3 rounded-full bg-critical' },
  { label: 'High event', swatch: 'h-3 w-3 rounded-full bg-orange-500' },
  { label: 'Low event', swatch: 'h-3 w-3 rounded-full bg-slate-400' },
  { label: 'Outage zone', swatch: 'h-3 w-4 border border-red-500 bg-red-500/30' },
  { label: 'Closed road', swatch: 'h-1 w-4 bg-yellow-400' },
  { label: 'Shelter', swatch: 'h-3 w-3 rounded-sm border border-sky-400' },
];

export function MapLegend() {
  return (
    <ul
      aria-label="Map legend"
      className="absolute bottom-6 left-3 space-y-1 rounded border border-slate-700 bg-slate-900/90 px-3 py-2 font-mono text-xs text-slate-200"
    >
      {ITEMS.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span aria-hidden="true" className={i.swatch} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
