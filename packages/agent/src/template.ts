/**
 * Deterministic alert template. REAL and permanent: this is the fallback whenever the
 * model fails, times out, or produces numbers that do not match the engine.
 * Every number in the output comes straight from the EngineResult.
 */
import type { AlertCardData, EngineResult, ProposedAction, Shelter, Zone } from '@gridrisk/shared';

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
        ? `Storm flooding the only access bridge to ${zoneName}.`
        : `Flooding has closed ${result.closedAccessRoadIds.length} of ${zone.accessRoadIds.length} access roads to ${zoneName}.`,
    );
  }
  if (result.outageEventIds.length > 0) points.push('Power outage active in this zone.');
  points.push(
    `Deterministic engine calculates ${result.dependentPatients} electricity-dependent patients here, with an average backup of just ${formatDuration(result.avgBackupMinutes)}.`,
  );

  const proposedActions: ProposedAction[] = [];
  const shelter = shelters.find((s) => s.id === result.candidateShelterIds[0]);
  if (shelter) {
    proposedActions.push({
      id: `act-${shelter.id}`,
      type: 'activate_shelter',
      label: `Activate ${shelter.name} (Capacity: ${shelter.capacity})`,
      params: { shelterId: shelter.id },
    });
  }
  proposedActions.push({
    id: `act-drone-${zone.id}`,
    type: 'dispatch_drone',
    label: `Dispatch Aerial Recon Drone to ${zoneName}`,
    params: { zoneId: zone.id },
  });

  return {
    id: options.id ?? `alert-${zone.id}-${now.getTime()}`,
    zoneId: zone.id,
    title: result.isolated
      ? `${zoneName.toUpperCase()} ISOLATED: ACTION REQUIRED`
      : `${zoneName.toUpperCase()} AT RISK: MONITOR`,
    points,
    isolationWindowMinutes: result.isolationWindowMinutes,
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
