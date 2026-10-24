import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { AlertCardData, DemoEvent } from '@gridrisk/shared';
import { App } from '../src/App';
import type { DataAdapter } from '../src/data/DataAdapter';
import { DataAdapterError } from '../src/data/errors';
import { useGridStore } from '../src/store';

// maplibre-gl needs WebGL, which jsdom doesn't have.
vi.mock('../src/map/MapComponent', () => ({ default: () => <div data-testid="map" /> }));

const EVENTS: DemoEvent[] = [
  { id: 'e1', type: 'outage', lat: 29.7, lon: -95.3, description: 'x', severity: 'low' },
];

function stubAdapter(overrides: Partial<DataAdapter> = {}): DataAdapter {
  return {
    getEvents: vi.fn().mockResolvedValue(EVENTS),
    getAlerts: vi.fn().mockResolvedValue([] as AlertCardData[]),
    approve: vi.fn(),
    simulate: vi.fn().mockResolvedValue(EVENTS),
    reset: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  // Signed-in live mode so the dashboard (not the sign-in screen) renders.
  sessionStorage.setItem(
    'gridrisk.auth',
    JSON.stringify({
      idToken: 'tok',
      email: 'demo@example.com',
      expiresAt: Date.now() + 3_600_000,
    }),
  );
  useGridStore.setState({ events: [], alerts: [], selectedEventId: null, mode: 'live' });
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.useRealTimers();
  useGridStore.setState({ events: [], alerts: [], selectedEventId: null, mode: 'mock' });
});

describe('App live mode', () => {
  it('shows the signed-in email and a Sign out button', async () => {
    render(<App adapter={stubAdapter()} />);
    expect(await screen.findByText('demo@example.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeTruthy();
  });

  it('shows an offline banner on a fetch failure and clears it on the next success', async () => {
    const getEvents = vi
      .fn()
      .mockRejectedValueOnce(new DataAdapterError('INTERNAL', 'network down'))
      .mockResolvedValue(EVENTS);
    const getAlerts = vi
      .fn()
      .mockRejectedValueOnce(new DataAdapterError('INTERNAL', 'network down'))
      .mockResolvedValue([]);
    render(<App adapter={stubAdapter({ getEvents, getAlerts })} />);

    // First refresh fails → banner.
    const banner = await screen.findByText(/offline — could not reach the data source/i);
    expect(banner).toBeTruthy();

    // A later successful poll clears it.
    await waitFor(
      () => expect(screen.queryByText(/offline — could not reach the data source/i)).toBeNull(),
      { timeout: 5000 },
    );
  });

  it('returns to the sign-in screen on a 401', async () => {
    const getEvents = vi
      .fn()
      .mockRejectedValue(new DataAdapterError('UNAUTHENTICATED', '401', 401));
    render(<App adapter={stubAdapter({ getEvents })} />);
    expect(await screen.findByRole('form', { name: /sign in/i })).toBeTruthy();
  });

  it('polls every 3 s in live mode', async () => {
    vi.useFakeTimers();
    const getEvents = vi.fn().mockResolvedValue(EVENTS);
    render(<App adapter={stubAdapter({ getEvents })} />);

    // Initial refresh (microtasks) + two polling ticks.
    await vi.advanceTimersByTimeAsync(0);
    const afterMount = getEvents.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6000);
    expect(getEvents.mock.calls.length).toBeGreaterThanOrEqual(afterMount + 2);
  });
});

describe('App mock mode does not poll', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useGridStore.setState({ events: [], alerts: [], selectedEventId: null, mode: 'mock' });
  });

  it('refreshes once and never polls', async () => {
    vi.useFakeTimers();
    const getEvents = vi.fn().mockResolvedValue(EVENTS);
    render(<App adapter={stubAdapter({ getEvents })} />);
    await vi.advanceTimersByTimeAsync(0);
    const afterMount = getEvents.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getEvents.mock.calls.length).toBe(afterMount);
  });
});
