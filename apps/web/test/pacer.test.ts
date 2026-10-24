import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertCardData } from '@gridrisk/shared';
import { SAMPLE_ALERT } from '@gridrisk/shared/fixtures';
import { buildScenario } from '@gridrisk/engine';
import { Pacer, type Snapshot } from '../src/data/pacer';

const OPTS = { eventGapMs: 1000, maxBurstMs: 10_000, thinkMs: 2000 };
const calm = buildScenario('calm');
const escalation = buildScenario('escalation');
const ALERT: AlertCardData = {
  ...SAMPLE_ALERT,
  relatedEventIds: ['evt-outage-a', 'evt-closure-bridge'],
};

function setup() {
  let screen: Snapshot = { events: [], alerts: [] };
  const shows: Snapshot[] = [];
  const pacer = new Pacer(
    {
      current: () => screen,
      show: (s) => {
        screen = s;
        shows.push(s);
      },
      now: () => Date.now(),
    },
    OPTS,
  );
  return { pacer, screen: () => screen, ids: () => screen.events.map((e) => e.id) };
}

beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
afterEach(() => vi.useRealTimers());

describe('Pacer', () => {
  it('shows the first snapshot at once', () => {
    const { pacer, ids } = setup();
    pacer.ingest({ events: calm, alerts: [] });
    expect(ids()).toEqual(calm.map((e) => e.id));
  });

  it('lets new events arrive one at a time, oldest first', () => {
    const { pacer, ids } = setup();
    pacer.ingest({ events: calm, alerts: [] });
    pacer.ingest({ events: escalation, alerts: [] });
    expect(ids()).toHaveLength(3);
    expect(pacer.pending).toBe(2);
    vi.advanceTimersByTime(1000);
    expect(ids().at(-1)).toBe('evt-outage-a');
    vi.advanceTimersByTime(1000);
    expect(ids().at(-1)).toBe('evt-closure-bridge');
    expect(pacer.pending).toBe(0);
  });

  it('holds the alert until its events arrived plus the think time', () => {
    const { pacer, screen } = setup();
    pacer.ingest({ events: calm, alerts: [] });
    pacer.ingest({ events: escalation, alerts: [ALERT] });
    vi.advanceTimersByTime(2000); // both events in
    expect(screen().alerts).toHaveLength(0);
    vi.advanceTimersByTime(1999);
    expect(screen().alerts).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(screen().alerts).toHaveLength(1);
  });

  it('applies a status change on a visible alert at once', () => {
    const { pacer, screen } = setup();
    pacer.ingest({ events: escalation, alerts: [ALERT] }); // first load: immediate
    expect(screen().alerts).toHaveLength(1);
    pacer.ingest({ events: escalation, alerts: [{ ...ALERT, status: 'dispatched' }] });
    expect(screen().alerts[0]?.status).toBe('dispatched');
  });

  it('removes events at once (Reset) and drops anything still queued', () => {
    const { pacer, ids } = setup();
    pacer.ingest({ events: calm, alerts: [] });
    pacer.ingest({ events: buildScenario('storm'), alerts: [] });
    vi.advanceTimersByTime(1000);
    pacer.ingest({ events: calm, alerts: [] });
    expect(ids()).toEqual(calm.map((e) => e.id));
    expect(pacer.pending).toBe(0);
  });

  it('keeps a long burst within maxBurstMs', () => {
    const { pacer } = setup();
    const p = new Pacer(
      {
        current: () => ({ events: calm, alerts: [] }),
        show: () => undefined,
        now: () => Date.now(),
      },
      { ...OPTS, maxBurstMs: 3000 },
    );
    p.ingest({ events: buildScenario('storm'), alerts: [] }); // 9 new events
    vi.advanceTimersByTime(3000);
    expect(p.pending).toBe(0);
    pacer.dispose();
  });

  it('does not re-queue events on repeated polls', () => {
    const { pacer } = setup();
    pacer.ingest({ events: calm, alerts: [] });
    pacer.ingest({ events: escalation, alerts: [] });
    pacer.ingest({ events: escalation, alerts: [] });
    expect(pacer.pending).toBe(2);
  });
});
