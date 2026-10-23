import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AlertCardDataSchema,
  ApproveRequestSchema,
  DemoEventSchema,
  EngineResultSchema,
  RoadSegmentSchema,
  ShelterSchema,
  ZoneSchema,
  buildPath,
  API_ROUTES,
} from '../src';
import {
  CALM_EVENTS,
  ESCALATION_ENGINE_RESULT,
  ESCALATION_EVENTS,
  ROADS,
  SAMPLE_ALERT,
  SHELTERS,
  ZONES,
  ZONE_A,
} from '../src/fixtures/houston';

describe('fixtures conform to frozen contracts', () => {
  it.each([
    ['calm events', z.array(DemoEventSchema), CALM_EVENTS],
    ['escalation events', z.array(DemoEventSchema), ESCALATION_EVENTS],
    ['zones', z.array(ZoneSchema), ZONES],
    ['roads', z.array(RoadSegmentSchema), ROADS],
    ['shelters', z.array(ShelterSchema), SHELTERS],
    ['engine result', EngineResultSchema, ESCALATION_ENGINE_RESULT],
    ['sample alert', AlertCardDataSchema, SAMPLE_ALERT],
  ] as const)('%s parse', (_name, schema, value) => {
    expect(() => schema.parse(value)).not.toThrow();
  });

  it('event ids are unique across calm + escalation', () => {
    const ids = [...CALM_EVENTS, ...ESCALATION_EVENTS].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sample alert relatedEventIds all exist in the escalation set', () => {
    const ids = new Set(ESCALATION_EVENTS.map((e) => e.id));
    for (const id of SAMPLE_ALERT.relatedEventIds) expect(ids.has(id)).toBe(true);
  });

  it('engine result references real escalation events and zone', () => {
    const ids = new Set(ESCALATION_EVENTS.map((e) => e.id));
    const r = ESCALATION_ENGINE_RESULT;
    expect(r.zoneId).toBe(ZONE_A.id);
    for (const id of [...r.outageEventIds, ...r.closureEventIds, ...r.emergencyEventIds]) {
      expect(ids.has(id)).toBe(true);
    }
    expect(r.isolationWindowMinutes).toBe(r.avgBackupMinutes - r.estimatedResponseMinutes);
  });

  it('zone A access roads exist', () => {
    const roadIds = new Set(ROADS.map((r) => r.id));
    for (const id of ZONE_A.accessRoadIds) expect(roadIds.has(id)).toBe(true);
  });
});

describe('schemas reject bad input', () => {
  it('rejects unknown event type', () => {
    expect(DemoEventSchema.safeParse({ ...CALM_EVENTS[0], type: 'earthquake' }).success).toBe(
      false,
    );
  });

  it('rejects approve with no actions', () => {
    expect(ApproveRequestSchema.safeParse({ actionIds: [] }).success).toBe(false);
  });
});

describe('buildPath', () => {
  it('fills and encodes params', () => {
    expect(buildPath(API_ROUTES.approveAlert.path, { id: 'a/b' })).toBe('/alerts/a%2Fb/approve');
  });

  it('throws on missing params', () => {
    expect(() => buildPath(API_ROUTES.simulate.path)).toThrow(/scenario/);
  });
});
