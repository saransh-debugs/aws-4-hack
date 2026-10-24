import { useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import type { ScenarioName } from '@gridrisk/shared';
import { useAdapter } from '../data/AdapterContext';
import { useRefresh } from '../data/useGridData';
import { useGridStore } from '../store';

const buttonClass =
  'inline-flex items-center gap-1.5 rounded border border-slate-600 px-2.5 py-1 font-mono text-xs text-slate-100 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:opacity-50';

/** Demo scenarios in story order, with what the audience should expect to see. */
export const DEMO_SCENARIOS: { name: ScenarioName; label: string; expect: string }[] = [
  {
    name: 'partial',
    label: '1. Outage only',
    expect: 'Zone A loses power but the bridge is open: no alert.',
  },
  {
    name: 'escalation',
    label: '2. Zone A cut off',
    expect: 'The bridge floods: Zone A is isolated and an alert appears.',
  },
  {
    name: 'reopened',
    label: '3. Bridge reopens',
    expect: 'The water recedes and the bridge reopens: no alert.',
  },
  {
    name: 'zone-b',
    label: '4. Zone B cut off',
    expect: 'Zone B loses power and its evacuation route floods: a Zone B alert.',
  },
  {
    name: 'multi-zone',
    label: '5. Both zones cut off',
    expect: 'Two zones isolated at once: one alert each.',
  },
  {
    name: 'storm',
    label: '6. Storm (noisy feed)',
    expect: 'Many storm events, but only Zone A is cut off: one alert.',
  },
];

/** Dev controls for the demo: inject a scenario, or go back to calm. */
export function DevToolbar() {
  const adapter = useAdapter();
  const refresh = useRefresh();
  const eventCount = useGridStore((s) => s.events.length);
  const [scenario, setScenario] = useState<ScenarioName>('escalation');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = DEMO_SCENARIOS.find((s) => s.name === scenario);

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
      <label className="flex items-center gap-1.5 font-mono text-xs text-slate-300">
        <select
          aria-label="Scenario"
          aria-describedby="scenario-hint"
          value={scenario}
          disabled={busy}
          onChange={(e) => setScenario(e.target.value as ScenarioName)}
          title={selected?.expect}
          className="rounded border border-slate-600 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:opacity-50"
        >
          {DEMO_SCENARIOS.map((s) => (
            <option key={s.name} value={s.name}>
              {s.label}
            </option>
          ))}
        </select>
        <span id="scenario-hint" className="sr-only">
          {selected?.expect}
        </span>
      </label>
      <button
        type="button"
        className={buttonClass}
        disabled={busy}
        onClick={() => void run(() => adapter.simulate(scenario))}
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
