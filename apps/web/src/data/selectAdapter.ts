import type { DataAdapter, DataMode } from './DataAdapter';
import { LiveAdapter } from './LiveAdapter';

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

/** API base for live mode. Empty VITE_API_URL → same-origin `/api` (served by MSW in dev). */
export function apiBaseUrl(value: string | undefined = import.meta.env.VITE_API_URL): string {
  return value && value.trim() !== '' ? value.trim() : '/api';
}

/**
 * Picks the adapter from VITE_DATA_MODE (default: mock).
 * TODO(Bushra): return new MockAdapter() for mock mode (Task 2).
 * TODO(Task 13b): replace the dev token with the Cognito ID token (Amplify Auth).
 */
export function selectAdapter(
  mode: DataMode = parseDataMode(import.meta.env.VITE_DATA_MODE),
): DataAdapter {
  if (mode === 'live') {
    return new LiveAdapter({ baseUrl: apiBaseUrl(), getToken: () => 'dev-token' });
  }
  return notImplemented(mode);
}
