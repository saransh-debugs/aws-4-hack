/**
 * Deterministic alert template. REAL and permanent: this is the fallback whenever the
 * model fails, times out, or produces numbers that do not match the engine.
 * Every number in the output comes straight from the EngineResult.
 *
 * SDK-free (the web app imports it via `@gridrisk/agent/template`). Action building lives in
 * ./actions, which is also SDK-free.
 */
import type { AlertCardData, EngineResult, Shelter, Zone } from '@gridrisk/shared';
import { buildProposedActions } from './actions';

export interface TemplateOptions {
  zone: Zone;
  shelters: Shelter[];
  now?: Date;
  id?: string;
}

/** 120 -> "2 hours", 60 -> "1 hour", 90 -> "90 minutes". */
export function formatDuration(minutes: number): string {
  if (minutes > 0 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

export function buildTemplateAlert(result: EngineResult, options: TemplateOptions): AlertCardData {
  const { zone, shelters } = options;
  const now = options.now ?? new Date();
  const zoneName = zone.name;

  const points: string[] = [];
  if (result.closedAccessRoadIds.length > 0) {
    points.push(
      zone.accessRoadIds.length === 1
        ? `Storm flooding has closed the only access road into ${zoneName}.`
        : `Flooding has closed ${result.closedAccessRoadIds.length} of ${zone.accessRoadIds.length} access roads to ${zoneName}.`,
    );
  }
  if (result.outageEventIds.length > 0) points.push('Power outage active in this zone.');
  points.push(
    `Deterministic engine calculates ${result.dependentPatients} electricity-dependent patients here, with an average backup of just ${formatDuration(result.avgBackupMinutes)}.`,
  );
  if (result.isolationWindowRangeMinutes) {
    points.push(
      `Planning estimate only: the remaining response window may range from ${formatDuration(result.isolationWindowRangeMinutes.min)} to ${formatDuration(result.isolationWindowRangeMinutes.max)} because backup and response times are not clinically validated.`,
    );
  }

  // Fixed fallback requests: the workflow records a shelter request and drone mission request.
  const proposedActions = buildProposedActions(['activate_shelter', 'dispatch_drone'], {
    zone,
    shelters,
    result,
  });

  return {
    id: options.id ?? `alert-${zone.id}-${now.getTime()}`,
    zoneId: zone.id,
    title: result.isolated
      ? `${zoneName.toUpperCase()} ISOLATED: ACTION REQUIRED`
      : `${zoneName.toUpperCase()} AT RISK: MONITOR`,
    points,
    isolationWindowMinutes: result.isolationWindowMinutes,
    isolationWindowRangeMinutes: result.isolationWindowRangeMinutes,
    uncertainty: 'planning-estimate',
    proposedActions,
    relatedEventIds: [
      ...result.outageEventIds,
      ...result.closureEventIds,
      ...result.emergencyEventIds,
    ],
    status: 'pending',
    createdAt: now.toISOString(),
  };
}
