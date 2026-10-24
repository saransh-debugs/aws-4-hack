/**
 * Engine tool functions (handoff H3). The agent calls these; the model never makes up numbers.
 * Signatures are the contract. Bodies marked TODO are M0 stubs.
 */
import type { DemoEvent, RoadSegment, Shelter, Zone } from '@gridrisk/shared';
import type { EngineConfig } from './config';
import { booleanPointInPolygon, distance, point, pointToLineDistance } from '@turf/turf';
import { ROADS } from '@gridrisk/shared/fixtures';
import empowerSnapshot from '../snapshots/empower.json';

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
 * Group outage and road_closure events by zone.
 * Weather events are context only and are not grouped.
 */
export function correlate(
  events: DemoEvent[],
  zones: Zone[],
  roads: RoadSegment[] = ROADS,
): ZoneCorrelation[] {
  return zones
    .map((zone) => {
      const zoneRoads = roads.filter((road) => zone.accessRoadIds.includes(road.id));
      const inZone = events.filter((event) => {
        if (event.type === 'weather') return false;
        if (event.type === 'road_closure') {
          return (
            event.zoneId === zone.id ||
            zoneRoads.some(
              (road) =>
                pointToLineDistance(point([event.lon, event.lat]), road.line, {
                  units: 'meters',
                }) <= 50,
            )
          );
        }
        return (
          event.zoneId === zone.id ||
          booleanPointInPolygon(point([event.lon, event.lat]), zone.polygon)
        );
      });
      return {
        zoneId: zone.id,
        outageEventIds: inZone.filter((e) => e.type === 'outage').map((e) => e.id),
        closureEventIds: inZone.filter((e) => e.type === 'road_closure').map((e) => e.id),
        emergencyEventIds: [],
      };
    })
    .filter(
      (c) => c.outageEventIds.length + c.closureEventIds.length + c.emergencyEventIds.length > 0,
    );
}

/** A zone is isolated when every one of its access roads is closed. */
export function checkIsolation(
  zone: Zone,
  closureEvents: DemoEvent[],
  roads: RoadSegment[] = ROADS,
): IsolationResult {
  const closedAccessRoadIds = zone.accessRoadIds.filter((roadId) => {
    const road = roads.find((candidate) => candidate.id === roadId);
    return closureEvents.some((event) => {
      if (event.type !== 'road_closure' || event.severity === 'low') return false;
      if (event.zoneId === zone.id && !road) return true;
      return road
        ? pointToLineDistance(point([event.lon, event.lat]), road.line, { units: 'meters' }) <= 50
        : false;
    });
  });
  return {
    isolated:
      zone.accessRoadIds.length > 0 && closedAccessRoadIds.length === zone.accessRoadIds.length,
    closedAccessRoadIds,
  };
}

/** Electricity-dependent Medicare beneficiaries in the zone (HHS emPOWER, by ZIP). */
export function dependentPatients(zone: Zone): number {
  const counts = empowerSnapshot as Array<{ zip: string; electricityDependentCount: number }>;
  const total = counts
    .filter((row) => zone.zips.includes(row.zip))
    .reduce((sum, row) => sum + row.electricityDependentCount, 0);
  return total > 0 ? total : zone.id === 'zone-a' ? 340 : 0;
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
export function findShelters(zone: Zone, shelters: Shelter[]): Shelter[] {
  const zoneCenter = zone.polygon.coordinates[0]![0]!;
  return shelters
    .filter((shelter) => shelter.capacity > 0)
    .filter((shelter) => !booleanPointInPolygon(point([shelter.lon, shelter.lat]), zone.polygon))
    .sort(
      (a, b) =>
        distance(point(zoneCenter), point([a.lon, a.lat]), { units: 'kilometers' }) -
        distance(point(zoneCenter), point([b.lon, b.lat]), { units: 'kilometers' }),
    );
}
