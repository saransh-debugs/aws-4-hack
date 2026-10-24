import { describe, expect, it } from 'vitest';
import { AdapterError } from '../src/data/DataAdapter';
import { MockAdapter } from '../src/data/MockAdapter';

const NOW = new Date('2026-10-23T14:15:00.000Z');
const make = () => new MockAdapter({ now: () => NOW });

describe('MockAdapter', () => {
  it('starts calm with no alerts', async () => {
    const adapter = make();
    expect(await adapter.getEvents()).toHaveLength(3);
    expect(await adapter.getAlerts()).toEqual([]);
  });

  it('simulate(escalation) adds the escalation events and one pending alert', async () => {
    const adapter = make();
    const events = await adapter.simulate('escalation');
    expect(events).toHaveLength(5);
    expect(events.filter((e) => e.severity === 'critical')).toHaveLength(1);
    expect(events.map((e) => e.id)).toContain('evt-outage-a');
    expect(events.map((e) => e.id)).toContain('evt-closure-bridge');

    const alerts = await adapter.getAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.status).toBe('pending');
    expect(alerts[0]?.zoneId).toBe('zone-a');
  });

  it('simulating twice does not duplicate the alert', async () => {
    const adapter = make();
    await adapter.simulate('escalation');
    await adapter.simulate('escalation');
    expect(await adapter.getAlerts()).toHaveLength(1);
  });

  it('approve sets the alert to dispatched', async () => {
    const adapter = make();
    await adapter.simulate('escalation');
    const [alert] = await adapter.getAlerts();
    const approved = await adapter.approve(alert!.id, [alert!.proposedActions[0]!.id]);
    expect(approved.status).toBe('dispatched');
    expect((await adapter.getAlerts())[0]?.status).toBe('dispatched');
  });

  it('approving twice fails with CONFLICT (the API 409)', async () => {
    const adapter = make();
    await adapter.simulate('escalation');
    const [alert] = await adapter.getAlerts();
    const ids = [alert!.proposedActions[0]!.id];
    await adapter.approve(alert!.id, ids);
    await expect(adapter.approve(alert!.id, ids)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('approve rejects an unknown alert, empty actionIds and unknown actionIds', async () => {
    const adapter = make();
    await adapter.simulate('escalation');
    const [alert] = await adapter.getAlerts();
    await expect(adapter.approve('nope', ['a'])).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(adapter.approve(alert!.id, [])).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(adapter.approve(alert!.id, ['nope'])).rejects.toBeInstanceOf(AdapterError);
    expect((await adapter.getAlerts())[0]?.status).toBe('pending');
  });

  it('reset returns to calm and clears alerts', async () => {
    const adapter = make();
    await adapter.simulate('escalation');
    await adapter.reset();
    expect(await adapter.getEvents()).toHaveLength(3);
    expect(await adapter.getAlerts()).toEqual([]);
  });

  it('returns copies, so callers cannot mutate its state', async () => {
    const adapter = make();
    const events = await adapter.getEvents();
    events.length = 0;
    expect(await adapter.getEvents()).toHaveLength(3);
  });
});
