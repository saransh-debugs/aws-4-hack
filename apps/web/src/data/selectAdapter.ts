import type { DataAdapter, DataMode } from './DataAdapter';
import { LiveAdapter } from './LiveAdapter';
import { MockAdapter } from './MockAdapter';
import { getValidToken } from '../auth/cognito';

export function parseDataMode(value: string | undefined): DataMode {
  return value === 'live' ? 'live' : 'mock';
}

/** API base for live mode. Empty VITE_API_URL → same-origin `/api` (served by MSW in dev). */
export function apiBaseUrl(value: string | undefined = import.meta.env.VITE_API_URL): string {
  return value && value.trim() !== '' ? value.trim() : '/api';
}

/**
 * Picks the adapter from VITE_DATA_MODE (default: mock). In live mode the LiveAdapter reads the
 * Cognito ID token from sessionStorage on every request (returns null when signed out / expired).
 */
export function selectAdapter(
  mode: DataMode = parseDataMode(import.meta.env.VITE_DATA_MODE),
): DataAdapter {
  if (mode === 'live') {
    return new LiveAdapter({ baseUrl: apiBaseUrl(), getToken: () => getValidToken() });
  }
  return new MockAdapter();
}
