import type { DemoEvent, EngineResult, Shelter, Zone } from '@gridrisk/shared';
import { SHELTERS } from '@gridrisk/shared/fixtures';
import { DEFAULT_CONFIG, type EngineConfig } from './config';
import {
  checkIsolation,
  computeIsolationWindow,
  correlate,
  dependentPatients,
  findShelters,
} from './tools';

export interface AnalyzeOptions {
  config?: EngineConfig;
  shelters?: Shelter[];
}

/**
 * Handoff H3. One EngineResult per zone that has correlated outage/closure/911 events.
 * Deterministic: same input gives the same output.
 *
 * M0: composed from the stub tools in ./tools; produces exactly ESCALATION_ENGINE_RESULT
 * for the escalation scenario and [] for calm.
 */
export function analyze(
  events: DemoEvent[],
  zones: Zone[],
  options: AnalyzeOptions = {},
): EngineResult[] {
  const config = options.config ?? DEFAULT_CONFIG;
  const shelters = options.shelters ?? SHELTERS;
  const byId = new Map(events.map((e) => [e.id, e]));

  return correlate(events, zones).flatMap((c) => {
    const zone = zones.find((z) => z.id === c.zoneId);
    if (!zone) return [];
    const closures = c.closureEventIds.map((id) => byId.get(id)).filter((e) => e !== undefined);
    const isolation = checkIsolation(zone, closures);
    return [
      {
        zoneId: zone.id,
        isolated: isolation.isolated,
        closedAccessRoadIds: isolation.closedAccessRoadIds,
        outageEventIds: c.outageEventIds,
        closureEventIds: c.closureEventIds,
        emergencyEventIds: c.emergencyEventIds,
        dependentPatients: dependentPatients(zone),
        avgBackupMinutes: config.avgBackupMinutes,
        estimatedResponseMinutes: config.estimatedResponseMinutes,
        isolationWindowMinutes: computeIsolationWindow(config),
        candidateShelterIds: findShelters(zone, shelters).map((s) => s.id),
      },
    ];
  });
}
