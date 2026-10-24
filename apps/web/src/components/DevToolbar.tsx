import { useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { useAdapter } from '../data/AdapterContext';
import { useRefresh } from '../data/useGridData';
import { useGridStore } from '../store';

const buttonClass =
  'inline-flex items-center gap-1.5 rounded border border-slate-600 px-2.5 py-1 font-mono text-xs text-slate-100 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:opacity-50';

/** Dev controls for the demo: inject the escalation scenario, or go back to calm. */
export function DevToolbar() {
  const adapter = useAdapter();
  const refresh = useRefresh();
  const eventCount = useGridStore((s) => s.events.length);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="toolbar" aria-label="Dev controls" className="flex items-center gap-3">
      <output aria-label="Event count" className="font-mono text-xs text-slate-300">
        EVENTS: {eventCount}
      </output>
      <button
        type="button"
        className={buttonClass}
        disabled={busy}
        onClick={() => void run(() => adapter.simulate('escalation'))}
      >
        <Play aria-hidden="true" size={14} />
        Simulate
      </button>
      <button
        type="button"
        className={buttonClass}
        disabled={busy}
        onClick={() => void run(() => adapter.reset())}
      >
        <RotateCcw aria-hidden="true" size={14} />
        Reset
      </button>
      {error && (
        <span role="alert" className="font-mono text-xs text-red-300">
          {error}
        </span>
      )}
    </div>
  );
}
