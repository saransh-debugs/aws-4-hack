import { describe, expect, it } from 'vitest';
import { AlertCardDataSchema } from '@gridrisk/shared';
import {
  ESCALATION_ENGINE_RESULT,
  ESCALATION_EVENTS,
  SAMPLE_ALERT,
  SHELTERS,
  ZONE_A,
} from '@gridrisk/shared/fixtures';
import { buildScenario } from '@gridrisk/engine';
import { buildTemplateAlert, formatDuration, runAgent, TOOL_NAMES } from '../src';

const NOW = new Date(SAMPLE_ALERT.createdAt);

describe('buildTemplateAlert (permanent fallback)', () => {
  const alert = buildTemplateAlert(ESCALATION_ENGINE_RESULT, {
    zone: ZONE_A,
    shelters: SHELTERS,
    now: NOW,
    id: SAMPLE_ALERT.id,
  });

  it('parses as AlertCardData', () => {
    expect(() => AlertCardDataSchema.parse(alert)).not.toThrow();
  });

  it('reproduces the demo alert exactly', () => {
    expect(alert).toEqual(SAMPLE_ALERT);
  });

  it('takes every number from the EngineResult', () => {
    expect(alert.isolationWindowMinutes).toBe(ESCALATION_ENGINE_RESULT.isolationWindowMinutes);
    expect(alert.points.join(' ')).toContain(String(ESCALATION_ENGINE_RESULT.dependentPatients));

    const changed = buildTemplateAlert(
      { ...ESCALATION_ENGINE_RESULT, dependentPatients: 12, avgBackupMinutes: 90 },
      { zone: ZONE_A, shelters: SHELTERS, now: NOW },
    );
    expect(changed.points.join(' ')).toContain('12 electricity-dependent patients');
    expect(changed.points.join(' ')).toContain('90 minutes');
  });

  it('formats durations', () => {
    expect(formatDuration(120)).toBe('2 hours');
    expect(formatDuration(60)).toBe('1 hour');
    expect(formatDuration(45)).toBe('45 minutes');
  });
});

describe('runAgent (H5 stub)', () => {
  it('escalation returns a valid pending alert for zone A', async () => {
    const alert = await runAgent(
      { zoneId: ZONE_A.id, events: buildScenario('escalation') },
      { now: () => NOW },
    );
    expect(alert).not.toBeNull();
    expect(AlertCardDataSchema.parse(alert).status).toBe('pending');
    expect(alert?.title).toBe('ZONE A ISOLATED: ACTION REQUIRED');
  });

  it('calm returns null', async () => {
    expect(await runAgent({ zoneId: ZONE_A.id, events: buildScenario('calm') })).toBeNull();
  });

  it('outage without a bridge closure (not isolated) returns null', async () => {
    const events = ESCALATION_EVENTS.filter((e) => e.type !== 'road_closure');
    expect(await runAgent({ zoneId: ZONE_A.id, events })).toBeNull();
  });

  it('unknown zone returns null', async () => {
    expect(await runAgent({ zoneId: 'nope', events: buildScenario('escalation') })).toBeNull();
  });
});

describe('tool registry plan', () => {
  it('ends with submit_alert', () => {
    expect(TOOL_NAMES.at(-1)).toBe('submit_alert');
  });
});
