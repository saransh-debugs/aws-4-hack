/**
 * Shared DataAdapter contract suite (Task 13a). Every adapter must pass it, so mock mode and
 * live mode behave the same for the UI. Usage:
 *
 *   describeDataAdapterContract('LiveAdapter (MSW)', () => new LiveAdapter(...));
 *   describeDataAdapterContract('MockAdapter', () => new MockAdapter());   // Bushra, H8
 *
 * `create` is called before every test and must return an adapter in the calm baseline.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { AlertCardDataSchema, DemoEventSchema } from '@gridrisk/shared';
import { CALM_EVENTS, ESCALATION_EVENTS, ZONE_A } from '@gridrisk/shared/fixtures';
import type { DataAdapter } from '../../src/data/DataAdapter';
import { DataAdapterError } from '../../src/data/errors';

async function rejection(p: Promise<unknown>): Promise<DataAdapterError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DataAdapterError);
  return err as DataAdapterError;
}

const ids = (events: { id: string }[]) => events.map((e) => e.id).sort();

export function describeDataAdapterContract(
  name: string,
  create: () => DataAdapter | Promise<DataAdapter>,
): void {
  describe(`DataAdapter contract: ${name}`, () => {
    let adapter: DataAdapter;
    beforeEach(async () => {
      adapter = await create();
    });

    /** Simulate escalation and return its single pending alert. */
    async function escalate() {
      await adapter.simulate('escalation');
      const alerts = await adapter.getAlerts();
      expect(alerts).toHaveLength(1);
      return alerts[0]!;
    }

    it('starts in the calm baseline with no alerts', async () => {
      const events = await adapter.getEvents();
      expect(ids(events)).toEqual(ids(CALM_EVENTS));
      for (const e of events) expect(() => DemoEventSchema.parse(e)).not.toThrow();
      expect(await adapter.getAlerts()).toEqual([]);
      const mapData = await adapter.getMapData();
      expect(mapData.zones.length).toBeGreaterThan(0);
      expect(mapData.roads.length).toBeGreaterThan(0);
      expect(mapData.shelters.length).toBeGreaterThan(0);
    });

    it('simulate("calm") returns the calm events and raises no alert', async () => {
      expect(ids(await adapter.simulate('calm'))).toEqual(ids(CALM_EVENTS));
      expect(await adapter.getAlerts()).toEqual([]);
    });

    it('simulate("escalation") returns the full event list and raises one pending alert', async () => {
      const events = await adapter.simulate('escalation');
      expect(ids(events)).toEqual(ids([...CALM_EVENTS, ...ESCALATION_EVENTS]));
      expect(ids(await adapter.getEvents())).toEqual(ids(events));

      const alert = AlertCardDataSchema.parse(await escalate());
      expect(alert.zoneId).toBe(ZONE_A.id);
      expect(alert.status).toBe('pending');
      expect(alert.isolationWindowMinutes).toBe(45);
      expect(alert.proposedActions.length).toBeGreaterThan(0);
    });

    it('simulating escalation twice does not duplicate the alert', async () => {
      await adapter.simulate('escalation');
      await adapter.simulate('escalation');
      expect(await adapter.getAlerts()).toHaveLength(1);
    });

    it('approve moves the alert out of pending and returns it', async () => {
      const alert = await escalate();
      const actionIds = [alert.proposedActions[0]!.id];

      const approved = AlertCardDataSchema.parse(await adapter.approve(alert.id, actionIds));
      expect(approved.id).toBe(alert.id);
      expect(['approved', 'dispatched']).toContain(approved.status);

      const [stored] = await adapter.getAlerts();
      expect(stored?.status).toBe(approved.status);
    });

    it('approving twice fails with CONFLICT (409)', async () => {
      const alert = await escalate();
      const actionIds = alert.proposedActions.map((a) => a.id);
      await adapter.approve(alert.id, actionIds);
      expect((await rejection(adapter.approve(alert.id, actionIds))).code).toBe('CONFLICT');
    });

    it('approving an unknown alert fails with NOT_FOUND (404)', async () => {
      await escalate();
      const err = await rejection(adapter.approve('alert-nope', ['act-drone-zone-a']));
      expect(err.code).toBe('NOT_FOUND');
    });

    it('empty or unknown actionIds fail with BAD_REQUEST (400) and leave the alert pending', async () => {
      const alert = await escalate();
      expect((await rejection(adapter.approve(alert.id, []))).code).toBe('BAD_REQUEST');
      expect((await rejection(adapter.approve(alert.id, ['act-nope']))).code).toBe('BAD_REQUEST');
      expect((await adapter.getAlerts())[0]?.status).toBe('pending');
    });

    it('reset returns to calm and clears alerts', async () => {
      await escalate();
      await adapter.reset();
      expect(ids(await adapter.getEvents())).toEqual(ids(CALM_EVENTS));
      expect(await adapter.getAlerts()).toEqual([]);
    });
  });
}
