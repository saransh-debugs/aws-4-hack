import type { DemoEvent, RoadSegment, Shelter, Zone } from '@gridrisk/shared';
import { DemoEventSchema } from '@gridrisk/shared';

export type DataQualityCode =
  | 'duplicate_id'
  | 'invalid_event'
  | 'stale_event'
  | 'event_outside_zone'
  | 'missing_road'
  | 'invalid_shelter';

export interface DataQualityIssue {
  code: DataQualityCode;
  message: string;
  id?: string;
}

export interface DataQualityOptions {
  now?: Date;
  maxEventAgeMinutes?: number;
}

function sameEvent(a: DemoEvent, b: DemoEvent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function validateDataQuality(
  events: DemoEvent[],
  zones: Zone[],
  roads: RoadSegment[],
  shelters: Shelter[],
  options: DataQualityOptions = {},
): DataQualityIssue[] {
  const now = options.now ?? new Date();
  const maxAge = options.maxEventAgeMinutes ?? 24 * 60;
  const issues: DataQualityIssue[] = [];
  const seen = new Map<string, DemoEvent>();

  for (const event of events) {
    const parsed = DemoEventSchema.safeParse(event);
    if (!parsed.success) {
      issues.push({ code: 'invalid_event', id: event.id, message: parsed.error.message });
      continue;
    }
    const previous = seen.get(event.id);
    if (previous && !sameEvent(previous, event)) {
      issues.push({
        code: 'duplicate_id',
        id: event.id,
        message: `Conflicting records share event id ${event.id}`,
      });
    }
    seen.set(event.id, event);

    if (event.timestamp) {
      const ageMinutes = (now.getTime() - Date.parse(event.timestamp)) / 60_000;
      if (!Number.isFinite(ageMinutes) || ageMinutes > maxAge) {
        issues.push({
          code: 'stale_event',
          id: event.id,
          message: `Event ${event.id} is older than ${maxAge} minutes`,
        });
      }
    }
  }

  const roadIds = new Set(roads.map((road) => road.id));
  for (const zone of zones) {
    for (const roadId of zone.accessRoadIds) {
      if (!roadIds.has(roadId)) {
        issues.push({
          code: 'missing_road',
          id: roadId,
          message: `Zone ${zone.id} references missing road ${roadId}`,
        });
      }
    }
  }

  const shelterIds = new Set(shelters.map((shelter) => shelter.id));
  for (const shelter of shelters) {
    if (!Number.isFinite(shelter.lat) || !Number.isFinite(shelter.lon) || shelter.capacity < 0) {
      issues.push({
        code: 'invalid_shelter',
        id: shelter.id,
        message: `Shelter ${shelter.id} has invalid coordinates or capacity`,
      });
    }
  }
  if (shelterIds.size !== shelters.length) {
    issues.push({ code: 'invalid_shelter', message: 'Shelter IDs must be unique' });
  }

  return issues;
}
