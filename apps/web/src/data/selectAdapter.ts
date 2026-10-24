import type { DataAdapter, DataMode } from './DataAdapter';
import { MockAdapter } from './MockAdapter';

function notImplemented(mode: DataMode): DataAdapter {
  const fail = (method: string) => () =>
    Promise.reject(new Error(`${mode} DataAdapter.${method} not implemented`));
  return {
    getEvents: fail('getEvents'),
    getAlerts: fail('getAlerts'),
    approve: fail('approve'),
    simulate: fail('simulate'),
    reset: fail('reset'),
  };
}

export function parseDataMode(value: string | undefined): DataMode {
  return value === 'live' ? 'live' : 'mock';
}

/**
 * Picks the adapter from VITE_DATA_MODE (default: mock).
 * TODO(Saransh, Task 13a): return new LiveAdapter(...) for live mode.
 */
export function selectAdapter(
  mode: DataMode = parseDataMode(import.meta.env.VITE_DATA_MODE),
): DataAdapter {
  return mode === 'mock' ? new MockAdapter() : notImplemented(mode);
}
