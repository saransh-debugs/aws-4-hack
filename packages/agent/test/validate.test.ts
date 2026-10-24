/**
 * A2 – Grounding check tests (owner: Bushra).
 *
 * Every number in the title and points must come from the EngineResult, unit-aware. Accepts
 * SAMPLE_ALERT and real-Claude phrasings; rejects invented counts, mis-converted durations and
 * a wrong isolationWindowMinutes.
 */
import { describe, expect, it } from 'vitest';
import type { AlertCardData } from '@gridrisk/shared';
import {
  ESCALATION_ENGINE_RESULT,
  SAMPLE_ALERT,
  SHELTERS,
  ZONE_A,
} from '@gridrisk/shared/fixtures';
import { checkGrounding } from '../src';

const ctx = { zone: ZONE_A, shelters: SHELTERS };
const result = ESCALATION_ENGINE_RESULT; // dependentPatients 340, window 45, backup 120, response 75

/** A valid alert with the given title/points, grounded by default. */
function alertWith(points: string[], title = SAMPLE_ALERT.title): AlertCardData {
  return { ...SAMPLE_ALERT, title, points };
}

describe('checkGrounding', () => {
  it('accepts the sample alert', () => {
    expect(checkGrounding(SAMPLE_ALERT, result, ctx)).toEqual({ ok: true, errors: [] });
  });

  it('accepts real-Claude phrasings', () => {
    const patients = { ...result, dependentPatients: 56 };
    const alert = alertWith([
      '56 electricity-dependent patients are affected.',
      'About 45 minutes are left in the isolation window, based on an assumed average backup of 120 minutes and an assumed response time of 75 minutes.',
      'Shelter B is on standby with capacity for 200 evacuees.',
    ]);
    expect(checkGrounding(alert, patients, ctx)).toEqual({ ok: true, errors: [] });
  });

  it('accepts "2 hours" for a 120-minute backup', () => {
    const alert = alertWith(['Average backup is just 2 hours.']);
    expect(checkGrounding(alert, result, ctx).ok).toBe(true);
  });

  it('allows digits inside the zone and shelter names', () => {
    // "Shelter B" / "Zone A" have no digit, but a shelter literally named with a number must pass.
    const shelters = [{ ...SHELTERS[0]!, name: 'Shelter 7' }];
    const alert = alertWith(['Shelter 7 is on standby with capacity for 200 evacuees.']);
    expect(checkGrounding(alert, result, { zone: ZONE_A, shelters }).ok).toBe(true);
  });

  it('rejects an invented patient count', () => {
    const alert = alertWith(['500 patients are affected.']);
    const out = checkGrounding(alert, result, ctx);
    expect(out.ok).toBe(false);
    expect(out.errors.join(' ')).toContain('500');
  });

  it('rejects a duration the engine never produced', () => {
    const alert = alertWith(['About 30 minutes remain.']);
    expect(checkGrounding(alert, result, ctx).ok).toBe(false);
  });

  it('rejects a count used as a duration ("3 HOURS")', () => {
    // 3 is a valid-looking count elsewhere, but it is not a grounded duration.
    const alert = alertWith(['Only 3 HOURS of backup remain.']);
    const out = checkGrounding(alert, result, ctx);
    expect(out.ok).toBe(false);
    expect(out.errors.join(' ').toLowerCase()).toContain('duration');
  });

  it('rejects a wrong isolationWindowMinutes on the card', () => {
    const alert: AlertCardData = { ...SAMPLE_ALERT, isolationWindowMinutes: 99 };
    const out = checkGrounding(alert, result, ctx);
    expect(out.ok).toBe(false);
    expect(out.errors.join(' ')).toContain('isolationWindowMinutes');
  });
});
