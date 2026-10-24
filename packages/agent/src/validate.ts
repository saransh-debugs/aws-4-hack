/**
 * A2 – Grounding check (owner: Bushra).
 *
 * Every number that appears in the alert's title and points must come from the EngineResult,
 * and it must be used with the right *unit*. The model writes the wording; this is the gate
 * that stops it inventing or mis-converting a number.
 *
 * Allowed values:
 *   counts     – dependentPatients, shelter capacity, and event/road counts from the result
 *   durations  – isolationWindowMinutes, avgBackupMinutes, estimatedResponseMinutes, in minutes,
 *                plus their exact hour equivalents (120 min -> "2 hours"; 90 min has no whole-hour form)
 *
 * Unit-aware: a count may not masquerade as a duration. "3 hours" fails even when 3 is a valid
 * count; "2 hours" passes only because some duration equals 120 minutes. A bare number (no time
 * unit) is accepted if it matches any allowed count or duration-in-minutes.
 *
 * Numbers that are part of a zone or shelter *name* in the context (e.g. the "B" in "Shelter B",
 * or a digit in a road name quoted by the model) are masked out before the scan, so proper names
 * never trip the check.
 *
 * Finally, `isolationWindowMinutes` on the card must equal the engine value.
 *
 * SDK-free.
 */
import type { AlertCardData, EngineResult, Shelter, Zone } from '@gridrisk/shared';

export interface GroundingContext {
  zone: Zone;
  shelters: Shelter[];
}

export interface GroundingResult {
  ok: boolean;
  errors: string[];
}

/** Escape a string for use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace any context name occurrences with spaces so digits inside names aren't scanned. */
function maskNames(text: string, names: string[]): string {
  let masked = text;
  // Longest names first, so "Shelter B" is masked before a bare "B".
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    if (!name) continue;
    masked = masked.replace(new RegExp(escapeRegExp(name), 'gi'), (m) => ' '.repeat(m.length));
  }
  return masked;
}

type Unit = 'hour' | 'minute' | 'count' | 'none';

/** Nouns that make a number a count, so a duration can't pose as one ("120 patients"). */
const COUNT_NOUN =
  /^[\s-]*(?:[a-z]+[\s-]+){0,2}?(?:patients?|people|persons?|residents?|evacuees?|calls?|roads?|bridges?|shelters?|beds?|outages?|closures?|events?|spaces?|spots?)\b/i;

function unitFor(trailing: string): Unit {
  if (/^[\s-]*hours?\b/i.test(trailing)) return 'hour';
  if (/^[\s-]*(?:minutes?|mins?)\b/i.test(trailing)) return 'minute';
  if (COUNT_NOUN.test(trailing)) return 'count';
  return 'none';
}

export function checkGrounding(
  alert: AlertCardData,
  result: EngineResult,
  ctx: GroundingContext,
): GroundingResult {
  const errors: string[] = [];

  // Structural check: the engine's window is authoritative, not the model's text.
  if (alert.isolationWindowMinutes !== result.isolationWindowMinutes) {
    errors.push(
      `isolationWindowMinutes ${alert.isolationWindowMinutes} != engine ${result.isolationWindowMinutes}`,
    );
  }

  // Allowed count values (no unit / explicit "patients", "roads", "shelters", "evacuees" …).
  const counts = new Set<number>([
    result.dependentPatients,
    result.outageEventIds.length,
    result.closureEventIds.length,
    result.emergencyEventIds.length,
    result.closedAccessRoadIds.length,
    ctx.zone.accessRoadIds.length,
    result.candidateShelterIds.length,
    ...ctx.shelters.map((s) => s.capacity),
  ]);

  // Allowed duration values, in minutes.
  const durationMinutes = new Set<number>([
    result.isolationWindowMinutes,
    result.avgBackupMinutes,
    result.estimatedResponseMinutes,
  ]);
  // Their whole-hour equivalents.
  const durationHours = new Set<number>(
    [...durationMinutes].filter((m) => m > 0 && m % 60 === 0).map((m) => m / 60),
  );

  const names = [ctx.zone.name, ...ctx.shelters.map((s) => s.name)];
  const numberRe = /\d+(?:\.\d+)?/g;

  for (const text of [alert.title, ...alert.points]) {
    const masked = maskNames(text, names);
    for (const match of masked.matchAll(numberRe)) {
      const value = Number(match[0]);
      const trailing = masked.slice(match.index + match[0].length);
      const unit = unitFor(trailing);

      if (unit === 'hour') {
        if (!durationHours.has(value)) {
          errors.push(`"${value} hours" in "${text.trim()}" is not a grounded duration`);
        }
      } else if (unit === 'minute') {
        if (!durationMinutes.has(value)) {
          errors.push(`"${value} minutes" in "${text.trim()}" is not a grounded duration`);
        }
      } else if (unit === 'count') {
        if (!counts.has(value)) {
          errors.push(`"${value}" in "${text.trim()}" is not a grounded count`);
        }
      } else {
        // Bare number: a valid count, or a duration quoted without a unit.
        if (!counts.has(value) && !durationMinutes.has(value)) {
          errors.push(`"${value}" in "${text.trim()}" is not a grounded number`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
