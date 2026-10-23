/**
 * Engine tool functions (handoff H3). The agent calls these; the model never makes up numbers.
 * Signatures are the contract. Bodies marked TODO are M0 stubs.
 */
import type { DemoEvent, Shelter, Zone } from '@gridrisk/shared';
import type { EngineConfig } from './config';

export interface ZoneCorrelation {
  zoneId: string;
  outageEventIds: string[];
  closureEventIds: string[];
  emergencyEventIds: string[];
}

export interface IsolationResult {
  isolated: boolean;
  closedAccessRoadIds: string[];
}

/**
 * Group outage / road_closure / 911 events by zone.
 * Weather events are context only and are not grouped.
 */
export function correlate(events: DemoEvent[], zones: Zone[]): ZoneCorrelation[] {
  // TODO(Tanisha): real implementation – point-in-polygon (Turf) instead of trusting event.zoneId,
  // and closures that intersect a zone's access roads instead of zoneId.
  return zones
    .map((zone) => {
      const inZone = events.filter((e) => e.zoneId === zone.id);
      return {
        zoneId: zone.id,
        outageEventIds: inZone.filter((e) => e.type === 'outage').map((e) => e.id),
        closureEventIds: inZone.filter((e) => e.type === 'road_closure').map((e) => e.id),
        emergencyEventIds: inZone.filter((e) => e.type === '911').map((e) => e.id),
      };
    })
    .filter(
      (c) => c.outageEventIds.length + c.closureEventIds.length + c.emergencyEventIds.length > 0,
    );
}

/** A zone is isolated when every one of its access roads is closed. */
export function checkIsolation(zone: Zone, closureEvents: DemoEvent[]): IsolationResult {
  // TODO(Tanisha): real implementation – map each closure to the road segment it sits on
  // (Turf nearestPointOnLine / buffer). Stub: any high/critical closure tagged to the zone
  // closes all of its access roads. Stretch: Amazon Location Routes avoid-area check.
  const closesAccess = closureEvents.some(
    (e) => e.type === 'road_closure' && e.zoneId === zone.id && e.severity !== 'low',
  );
  const closedAccessRoadIds = closesAccess ? [...zone.accessRoadIds] : [];
  return {
    isolated:
      zone.accessRoadIds.length > 0 && closedAccessRoadIds.length === zone.accessRoadIds.length,
    closedAccessRoadIds,
  };
}

/** Electricity-dependent Medicare beneficiaries in the zone (HHS emPOWER, by ZIP). */
export function dependentPatients(zone: Zone): number {
  // TODO(Tanisha): real implementation – sum snapshots/empower.json over zone.zips.
  return zone.id === 'zone-a' ? 340 : 0;
}

/**
 * Minutes left before backup power runs out for patients we cannot reach in time.
 * REAL: avgBackupMinutes − estimatedResponseMinutes, floored at 0.
 */
export function computeIsolationWindow(
  config: Pick<EngineConfig, 'avgBackupMinutes' | 'estimatedResponseMinutes'>,
): number {
  return Math.max(0, config.avgBackupMinutes - config.estimatedResponseMinutes);
}

/** Shelters that can take evacuees from the zone, best first. */
export function findShelters(_zone: Zone, shelters: Shelter[]): Shelter[] {
  // TODO(Tanisha): real implementation – exclude shelters inside the zone, sort by distance,
  // require remaining capacity.
  return shelters.filter((s) => s.capacity > 0);
}
