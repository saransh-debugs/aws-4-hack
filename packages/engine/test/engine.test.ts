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
} from '../src';

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
});

describe('analyze (H3)', () => {
  it('calm gives no risks', () => {
    expect(analyze(buildScenario('calm'), ZONES)).toEqual([]);
  });

  it('escalation gives the fixture EngineResult', () => {
    const results = analyze(buildScenario('escalation'), ZONES);
    expect(results).toEqual([ESCALATION_ENGINE_RESULT]);
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
      emergencyEventIds: ['evt-911-1', 'evt-911-2', 'evt-911-3'],
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
    expect(dependentPatients(ZONE_A)).toBe(340);
  });

  it('findShelters returns shelters with capacity', () => {
    expect(findShelters(ZONE_A, SHELTERS).map((s) => s.id)).toEqual(['shelter-b']);
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
