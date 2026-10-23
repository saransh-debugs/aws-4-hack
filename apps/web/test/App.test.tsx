import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from '../src/App';
import { parseDataMode, selectAdapter } from '../src/data/selectAdapter';

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
});

describe('selectAdapter', () => {
  it('defaults to mock mode', () => {
    expect(parseDataMode(undefined)).toBe('mock');
    expect(parseDataMode('live')).toBe('live');
  });

  it('placeholder adapter rejects until Task 2 lands', async () => {
    await expect(selectAdapter('mock').getEvents()).rejects.toThrow(/not implemented/);
  });
});
