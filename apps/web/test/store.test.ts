import { afterEach, describe, expect, it } from 'vitest';
import { buildScenario } from '@gridrisk/engine';
import { useGridStore } from '../src/store';

afterEach(() => useGridStore.setState({ events: [], alerts: [], selectedEventId: null }));

describe('grid store', () => {
  it('setSnapshot replaces events and alerts', () => {
    const events = buildScenario('calm');
    useGridStore.getState().setSnapshot({ events, alerts: [] });
    expect(useGridStore.getState().events).toEqual(events);
  });

  it('selectEvent sets and clears the selection', () => {
    useGridStore.getState().selectEvent('evt-calm-1');
    expect(useGridStore.getState().selectedEventId).toBe('evt-calm-1');
    useGridStore.getState().selectEvent(null);
    expect(useGridStore.getState().selectedEventId).toBeNull();
  });

  it('drops a selection whose event disappears', () => {
    const { setSnapshot, selectEvent } = useGridStore.getState();
    setSnapshot({ events: buildScenario('escalation'), alerts: [] });
    selectEvent('evt-outage-a');
    setSnapshot({ events: buildScenario('calm'), alerts: [] });
    expect(useGridStore.getState().selectedEventId).toBeNull();
  });

  it('keeps a selection that still exists', () => {
    const { setSnapshot, selectEvent } = useGridStore.getState();
    setSnapshot({ events: buildScenario('escalation'), alerts: [] });
    selectEvent('evt-calm-1');
    setSnapshot({ events: buildScenario('escalation'), alerts: [] });
    expect(useGridStore.getState().selectedEventId).toBe('evt-calm-1');
  });

  it('setMode changes the mode', () => {
    useGridStore.getState().setMode('live');
    expect(useGridStore.getState().mode).toBe('live');
    useGridStore.getState().setMode('mock');
  });
});
