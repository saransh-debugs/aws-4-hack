import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../src/App';
import { MockAdapter } from '../src/data/MockAdapter';
import { parseDataMode, selectAdapter } from '../src/data/selectAdapter';
import { useGridStore } from '../src/store';

// maplibre-gl needs WebGL, which jsdom doesn't have.
vi.mock('../src/map/MapComponent', () => ({ default: () => <div data-testid="map" /> }));

afterEach(() => {
  cleanup();
  useGridStore.setState({ events: [], alerts: [], selectedEventId: null });
});

describe('App shell', () => {
  it('renders the top bar', () => {
    render(<App adapter={new MockAdapter()} />);
    expect(
      screen.getByRole('heading', { name: 'GridRisk • LIVE FEED • SYNTHETIC DATA' }),
    ).toBeTruthy();
  });

  it('has the three labelled regions', () => {
    render(<App adapter={new MockAdapter()} />);
    for (const name of ['Event feed', 'Map', 'Alerts']) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
  });

  it('lists the calm events in the feed and selects one on click', async () => {
    render(<App adapter={new MockAdapter()} />);
    const item = await screen.findByRole('button', { name: /tree down on elm st/i });
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(3);
    fireEvent.click(item);
    expect(item.getAttribute('aria-pressed')).toBe('true');
    expect(useGridStore.getState().selectedEventId).toBe('evt-calm-1');
  });

  it('shows the calm event count, and Simulate increases it', async () => {
    render(<App adapter={new MockAdapter()} />);
    const count = screen.getByLabelText('Event count');
    await waitFor(() => expect(count.textContent).toBe('EVENTS: 3'));

    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }));
    await waitFor(() => expect(count.textContent).toBe('EVENTS: 8'));
    expect(await screen.findByText(/ZONE A ISOLATED/)).toBeTruthy();
  });

  it('summary strip reflects the escalation', async () => {
    render(<App adapter={new MockAdapter()} />);
    const summary = screen.getByLabelText('Situation summary');
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }));
    await waitFor(() => expect(summary.textContent).toContain('45 min'));
    expect(summary.textContent).toContain('Critical4');
    expect(summary.textContent).toContain('Pending alerts1');
  });

  it('Reset returns to calm and clears alerts', async () => {
    render(<App adapter={new MockAdapter()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }));
    await screen.findByText(/ZONE A ISOLATED/);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(screen.getByLabelText('Event count').textContent).toBe('EVENTS: 3'));
    expect(screen.getByText('No active alerts.')).toBeTruthy();
  });

  it('shows an error when the adapter fails', async () => {
    const adapter = new MockAdapter();
    adapter.simulate = () => Promise.reject(new Error('boom'));
    render(<App adapter={adapter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }));
    expect((await screen.findByRole('alert')).textContent).toBe('boom');
  });
});

describe('selectAdapter', () => {
  it('defaults to mock mode', () => {
    expect(parseDataMode(undefined)).toBe('mock');
    expect(parseDataMode('live')).toBe('live');
  });

  it('mock mode returns the in-memory adapter', () => {
    expect(selectAdapter('mock')).toBeInstanceOf(MockAdapter);
  });

  it('live mode rejects until LiveAdapter lands (Task 13a)', async () => {
    await expect(selectAdapter('live').getEvents()).rejects.toThrow(/not implemented/);
  });
});
