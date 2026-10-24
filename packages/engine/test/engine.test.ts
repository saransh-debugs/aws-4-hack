import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DemoEventSchema, EngineResultSchema } from '@gridrisk/shared';
import {
  CALM_EVENTS,
  ESCALATION_ENGINE_RESULT,
  ESCALATION_EVENTS,
  SHELTERS,
  ZONES,
  ZONE_A,
} from '@gridrisk/shared/fixtures';
import {
  analyze,
  buildScenario,
  checkIsolation,
  computeIsolationWindow,
  correlate,
  dependentPatients,
  findShelters,
  buildPartialScenario,
  buildReopenedScenario,
} from '../src';
import { normalizeEmpower } from '../src/sources/empower';
import { normalizeNwsAlerts } from '../src/sources/nws';
import { ingestNwsEvents } from '../src/ingest/handler';
import { assessFreshness, validateDataQuality } from '../src';
import {
  normalizeDriveTexasConditions,
  normalizeFemaOpenShelters,
  normalizeOperationalEvents,
} from '../src/sources/operational';
import { fetchSnapshotBundle } from '../src/sources/refresh';

describe('buildScenario (H2)', () => {
  it('calm returns only calm events', () => {
    expect(buildScenario('calm')).toEqual(CALM_EVENTS);
  });

  it('escalation returns calm + escalation events', () => {
    const events = buildScenario('escalation');
    expect(events).toHaveLength(CALM_EVENTS.length + ESCALATION_EVENTS.length);
    expect(() => z.array(DemoEventSchema).parse(events)).not.toThrow();
  });

  it('returns copies, so mutating the result does not change fixtures', () => {
    const events = buildScenario('calm');
    events[0]!.description = 'mutated';
    expect(CALM_EVENTS[0]!.description).not.toBe('mutated');
  });

  it('includes partial and reopened variants', () => {
    expect(buildPartialScenario().some((event) => event.type === 'outage')).toBe(true);
    expect(buildPartialScenario().some((event) => event.type === 'road_closure')).toBe(false);
    expect(buildReopenedScenario().some((event) => event.type === 'road_closure')).toBe(false);
    expect(buildScenario('reopened')).toEqual(buildReopenedScenario());
  });
});

describe('analyze (H3)', () => {
  it('calm gives no risks', () => {
    expect(analyze(buildScenario('calm'), ZONES)).toEqual([]);
  });

  it('escalation gives the fixture EngineResult', () => {
    const results = analyze(buildScenario('escalation'), ZONES);
    expect(results).toEqual([{ ...ESCALATION_ENGINE_RESULT, dependentPatients: 56 }]);
    expect(() => EngineResultSchema.parse(results[0])).not.toThrow();
  });

  it('is deterministic', () => {
    const events = buildScenario('escalation');
    expect(analyze(events, ZONES)).toEqual(analyze(events, ZONES));
  });

  it('respects config overrides', () => {
    const [r] = analyze(buildScenario('escalation'), ZONES, {
      config: { avgBackupMinutes: 90, estimatedResponseMinutes: 60 },
    });
    expect(r?.isolationWindowMinutes).toBe(30);
  });
});

describe('tool stubs keep their contracts', () => {
  it('correlate groups escalation events by zone', () => {
    const [c] = correlate(buildScenario('escalation'), ZONES);
    expect(c).toEqual({
      zoneId: ZONE_A.id,
      outageEventIds: ['evt-outage-a'],
      closureEventIds: ['evt-closure-bridge'],
      emergencyEventIds: [],
    });
  });

  it('checkIsolation: closed bridge isolates zone A, no closure does not', () => {
    const closure = ESCALATION_EVENTS.filter((e) => e.type === 'road_closure');
    expect(checkIsolation(ZONE_A, closure)).toEqual({
      isolated: true,
      closedAccessRoadIds: ['road-bridge-1'],
    });
    expect(checkIsolation(ZONE_A, [])).toEqual({ isolated: false, closedAccessRoadIds: [] });
  });

  it('dependentPatients returns a non-negative integer', () => {
    expect(dependentPatients(ZONE_A)).toBe(56);
  });

  it('findShelters returns shelters with capacity', () => {
    expect(findShelters(ZONE_A, SHELTERS).map((s) => s.id)).toEqual(['shelter-b']);
  });

  it('correlates events by coordinates when zoneId is absent', () => {
    const events = ESCALATION_EVENTS.map(({ zoneId: _zoneId, ...event }) => event);
    expect(analyze(events, ZONES)[0]?.isolated).toBe(true);
  });

  it('does not treat a low-severity or distant closure as an access closure', () => {
    const closure = {
      ...ESCALATION_EVENTS.find((event) => event.type === 'road_closure')!,
      severity: 'low' as const,
    };
    expect(checkIsolation(ZONE_A, [closure]).isolated).toBe(false);
    expect(
      checkIsolation(ZONE_A, [{ ...closure, severity: 'high', lat: 29.9, lon: -95.1 }]),
    ).toEqual({
      isolated: false,
      closedAccessRoadIds: [],
    });
  });
});

describe('source normalizers and ingest', () => {
  it('normalizes NWS geometry and severity', () => {
    const events = normalizeNwsAlerts({
      features: [
        {
          id: 'nws-1',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-95.4, 29.7],
                [-95.3, 29.7],
                [-95.3, 29.8],
                [-95.4, 29.7],
              ],
            ],
          },
          properties: {
            headline: 'Flood warning',
            severity: 'Severe',
            effective: '2026-10-23T14:00:00.000Z',
          },
        },
      ],
    });
    expect(events[0]).toMatchObject({
      id: 'nws-1',
      type: 'weather',
      severity: 'high',
      description: 'Flood warning',
    });
    expect(events[0]?.lat).toBeCloseTo(29.733, 2);
  });

  it('normalizes emPOWER rows and upserts each stable event id', async () => {
    expect(normalizeEmpower({ features: [{ attributes: { ZIPCODE: 77002, COUNT: 12 } }] })).toEqual(
      [{ zip: '77002', electricityDependentCount: 12 }],
    );
    const sent: unknown[] = [];
    const result = await ingestNwsEvents({
      fetchEvents: async () => [ESCALATION_EVENTS[0]!],
      dynamo: {
        send: async (command) => {
          sent.push(command);
        },
      },
      putItemCommand: (input) => input,
      tableName: 'events',
    });
    expect(result).toEqual({ count: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ TableName: 'events', Item: { id: { S: 'evt-outage-a' } } });
  });

  it('normalizes operational events and catches data-quality failures', () => {
    const event = ESCALATION_EVENTS[0]!;
    expect(normalizeOperationalEvents([{ ...event, type: undefined }], 'outage')[0]).toMatchObject({
      id: event.id,
      type: 'outage',
    });
    const issues = validateDataQuality(
      [event, { ...event, description: 'conflicting duplicate' }],
      ZONES,
      [],
      SHELTERS,
      { now: new Date('2026-10-24T14:00:00.000Z'), maxEventAgeMinutes: 60 },
    );
    expect(issues.filter((issue) => issue.code === 'duplicate_id')).toHaveLength(1);
    expect(issues.filter((issue) => issue.code === 'stale_event')).toHaveLength(2);
    expect(issues.filter((issue) => issue.code === 'missing_road')).toHaveLength(2);
  });

  it('normalizes DriveTexas closures and FEMA shelter capacity/status', () => {
    expect(
      normalizeDriveTexasConditions({
        features: [
          {
            id: 'tx-1',
            geometry: { type: 'Point', coordinates: [-95.38, 29.76] },
            properties: { description: 'Flood closure', condition: 'closed' },
          },
        ],
      }),
    ).toMatchObject([{ id: 'tx-1', type: 'road_closure', severity: 'critical' }]);
    expect(
      normalizeFemaOpenShelters({
        features: [
          {
            attributes: {
              shelter_id: 7,
              shelter_name: 'FEMA Shelter',
              latitude: 29.76,
              longitude: -95.37,
              post_impact_capacity: 100,
              shelter_status_code: 'OPEN',
            },
          },
        ],
      }),
    ).toEqual([
      {
        id: 'fema-7',
        name: 'FEMA Shelter',
        lat: 29.76,
        lon: -95.37,
        capacity: 100,
        status: 'active',
      },
    ]);
  });

  it('reports snapshot freshness', () => {
    const status = assessFreshness(
      'nws',
      '2026-10-23T14:00:00.000Z',
      60,
      new Date('2026-10-23T15:01:00.000Z'),
    );
    expect(status.stale).toBe(true);
    expect(status.ageMinutes).toBe(61);
  });

  it('builds one consistent snapshot bundle for scheduled refreshes', async () => {
    const bundle = await fetchSnapshotBundle(['77002'], {
      fetchNws: async () => [],
      fetchEmpower: async () => [{ zip: '77002', electricityDependentCount: 7 }],
      now: () => new Date('2026-10-23T14:00:00.000Z'),
    });
    expect(bundle).toEqual({
      generatedAt: '2026-10-23T14:00:00.000Z',
      nws: [],
      empower: [{ zip: '77002', electricityDependentCount: 7 }],
    });
  });
});

describe('computeIsolationWindow (real)', () => {
  it.each([
    [120, 75, 45],
    [60, 60, 0],
    [30, 75, 0],
  ])('backup %i − response %i = %i', (avgBackupMinutes, estimatedResponseMinutes, expected) => {
    expect(computeIsolationWindow({ avgBackupMinutes, estimatedResponseMinutes })).toBe(expected);
  });
});
