import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { DemoEvent } from '@gridrisk/shared';
import { CALM_EVENTS, ESCALATION_EVENTS } from '@gridrisk/shared/fixtures';
import {
  EventFeed,
  formatEventTime,
  severityClass,
  sortEventsNewestFirst,
} from '../src/components/EventFeed';

afterEach(cleanup);

const ALL = [...CALM_EVENTS, ...ESCALATION_EVENTS];
const ev = (id: string, timestamp?: string): DemoEvent => ({
  id,
  type: 'outage',
  lat: 29.76,
  lon: -95.37,
  description: id,
  severity: 'low',
  timestamp,
});

const items = () => within(screen.getByRole('list', { name: /events/i })).getAllByRole('button');

describe('sortEventsNewestFirst', () => {
  it('puts the newest timestamp first', () => {
    expect(sortEventsNewestFirst(ALL).map((e) => e.id)).toEqual([
      'evt-911-3',
      'evt-911-2',
      'evt-911-1',
      'evt-closure-bridge',
      'evt-outage-a',
      'evt-calm-3',
      'evt-calm-2',
      'evt-calm-1',
    ]);
  });

  it('puts events without a timestamp last and breaks ties by arrival', () => {
    const t = '2026-10-23T14:00:00.000Z';
    const sorted = sortEventsNewestFirst([ev('a'), ev('b', t), ev('c', t), ev('d')]);
    expect(sorted.map((e) => e.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('does not mutate its input', () => {
    const input = [...ALL];
    sortEventsNewestFirst(input);
    expect(input).toEqual(ALL);
  });
});

describe('severity and time', () => {
  it('maps severity to a class', () => {
    expect(severityClass('critical')).toContain('severity-critical');
    expect(severityClass('high')).toContain('severity-high');
    expect(severityClass('low')).toContain('severity-low');
  });

  it('formats UTC times and handles missing ones', () => {
    expect(formatEventTime('2026-10-23T14:10:00.000Z')).toBe('14:10:00Z');
    expect(formatEventTime(undefined)).toBe('--:--:--');
  });
});

describe('EventFeed', () => {
  it('renders newest first, with severity text as well as color', () => {
    render(<EventFeed events={ALL} onSelect={() => {}} />);
    const buttons = items();
    expect(buttons).toHaveLength(ALL.length);
    expect(buttons[0]?.textContent).toContain('resident on home oxygen');
    expect(buttons[0]?.textContent).toContain('Critical');
    expect(buttons[0]?.className).toContain('severity-critical');
    expect(buttons.at(-1)?.textContent).toContain('Low');
    expect(buttons.at(-1)?.textContent).toContain('evt-calm-1');
  });

  it('calls onSelect with the clicked event and marks the selection', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<EventFeed events={ALL} onSelect={onSelect} />);
    const bridge = screen.getByRole('button', { name: /access bridge closed/i });

    fireEvent.click(bridge);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt-closure-bridge' }));
    expect(bridge.getAttribute('aria-pressed')).toBe('false');

    rerender(<EventFeed events={ALL} selectedEventId="evt-closure-bridge" onSelect={onSelect} />);
    expect(
      screen.getByRole('button', { name: /access bridge closed/i }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  });

  it('items are focusable native buttons (Tab + Enter/Space)', () => {
    render(<EventFeed events={CALM_EVENTS} onSelect={() => {}} />);
    for (const button of items()) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
      button.focus();
      expect(document.activeElement).toBe(button);
    }
  });

  it('shows the count and an empty state', () => {
    render(<EventFeed events={[]} onSelect={() => {}} />);
    expect(screen.getByRole('heading').textContent).toMatch(/^Events\s*0$/);
    expect(screen.getByText('No active events.')).toBeTruthy();
  });

  it('shows newly added events at the top', () => {
    const { rerender } = render(<EventFeed events={CALM_EVENTS} onSelect={() => {}} />);
    expect(items()).toHaveLength(3);
    rerender(<EventFeed events={ALL} onSelect={() => {}} />);
    expect(items()).toHaveLength(8);
    expect(items()[0]?.textContent).toContain('evt-911-3');
  });
});
