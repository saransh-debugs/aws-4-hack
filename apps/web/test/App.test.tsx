import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/App';
import { apiBaseUrl, parseDataMode, selectAdapter } from '../src/data/selectAdapter';
import { LiveAdapter } from '../src/data/LiveAdapter';

afterEach(cleanup);

describe('App shell', () => {
  it('renders the top bar', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'GridRisk • LIVE FEED • SYNTHETIC DATA' }),
    ).toBeTruthy();
  });

  it('has the three labelled regions', () => {
    render(<App />);
    for (const name of ['Event feed', 'Map', 'Alerts']) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
  });

  it('lists the calm events in the feed and selects one on click', async () => {
    render(<App />);
    const item = await screen.findByRole('button', { name: /tree down on elm st/i });
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(3);
    fireEvent.click(item);
    expect(item.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('selectAdapter', () => {
  it('defaults to mock mode', () => {
    expect(parseDataMode(undefined)).toBe('mock');
    expect(parseDataMode('live')).toBe('live');
  });

  it('mock mode returns the deterministic calm baseline', async () => {
    const events = await selectAdapter('mock').getEvents();
    expect(events).toHaveLength(3);
    expect(await selectAdapter('mock').getAlerts()).toEqual([]);
  });

  it('live mode returns a LiveAdapter, defaulting to same-origin /api', () => {
    expect(selectAdapter('live')).toBeInstanceOf(LiveAdapter);
    expect(apiBaseUrl(undefined)).toBe('/api');
    expect(apiBaseUrl('  ')).toBe('/api');
    expect(apiBaseUrl('https://x.execute-api.us-east-1.amazonaws.com')).toBe(
      'https://x.execute-api.us-east-1.amazonaws.com',
    );
  });
});
