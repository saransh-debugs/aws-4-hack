import type { DataAdapter, DataMode } from './DataAdapter';

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
 * TODO(Darsh): return new MockAdapter() (Task 2) / new LiveAdapter(...) (Task 13).
 */
export function selectAdapter(
  mode: DataMode = parseDataMode(import.meta.env.VITE_DATA_MODE),
): DataAdapter {
  return notImplemented(mode);
}
