import type { MapData, RoadSegment, Shelter, Zone } from '@gridrisk/shared';
import { MapDataSchema } from '@gridrisk/shared';

/**
 * The first operational slice is deliberately small: the Downtown Houston
 * planning area covering ZIPs 77002 and 77010. It is a persisted registry,
 * not an analysis-time fallback. Shelters are replaced by the current FEMA
 * snapshot during ingest.
 */
export const DOWNTOWN_HOUSTON_AREA_ID = 'houston-downtown-77002-77010';
export const DOWNTOWN_HOUSTON_VALIDATION_SOURCES = [
  {
    name: 'Houston TranStar road and lane closure feed',
    url: 'https://traffic.houstontranstar.org/rss/rss_info.aspx',
  },
  {
    name: 'FEMA National Shelter System',
    url: 'https://gis.fema.gov/arcgis/rest/services/NSS/FEMA_NSS/MapServer/0',
  },
  {
    name: 'HHS emPOWER public ZIP layer',
    url: 'https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/ArcGIS/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer/1',
  },
] as const;

const DOWNTOWN_ZONE: Zone = {
  id: 'zone-a',
  name: 'Downtown Houston / East Downtown operating area',
  polygon: {
    type: 'Polygon',
    coordinates: [
      [
        [-95.38, 29.745],
        [-95.35, 29.745],
        [-95.35, 29.77],
        [-95.38, 29.77],
        [-95.38, 29.745],
      ],
    ],
  },
  zips: ['77002', '77010'],
  accessRoadIds: ['road-i10-east-downtown'],
};

const DOWNTOWN_ACCESS_ROAD: RoadSegment = {
  id: 'road-i10-east-downtown',
  name: 'IH-10 East / IH-610 connector access',
  line: {
    type: 'LineString',
    coordinates: [
      [-95.345, 29.77],
      [-95.345, 29.755],
    ],
  },
};

export interface OperationalGeographyValidation {
  valid: boolean;
  errors: string[];
}

export function validateOperationalGeography(mapData: MapData): OperationalGeographyValidation {
  const errors: string[] = [];
  const roadIds = new Set(mapData.roads.map((road) => road.id));
  const zoneIds = new Set<string>();
  for (const zone of mapData.zones) {
    if (zoneIds.has(zone.id)) errors.push(`duplicate zone id: ${zone.id}`);
    zoneIds.add(zone.id);
    for (const roadId of zone.accessRoadIds) {
      if (!roadIds.has(roadId)) errors.push(`zone ${zone.id} references missing road ${roadId}`);
    }
  }
  const shelterIds = new Set<string>();
  for (const shelter of mapData.shelters) {
    if (shelterIds.has(shelter.id)) errors.push(`duplicate shelter id: ${shelter.id}`);
    shelterIds.add(shelter.id);
    if (shelter.lat < 29.5 || shelter.lat > 30.1 || shelter.lon < -95.9 || shelter.lon > -95.0) {
      errors.push(`shelter ${shelter.id} is outside the Houston validation envelope`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Build the validated Downtown registry with the latest shelter snapshot. */
export function buildDowntownHoustonRegistry(shelters: Shelter[] = [], now = new Date()): MapData {
  const zones: Zone[] = [DOWNTOWN_ZONE];
  const roads: RoadSegment[] = [DOWNTOWN_ACCESS_ROAD];
  const mapData: MapData = {
    version: `downtown-houston-${now.toISOString().slice(0, 10)}`,
    operatingAreaId: DOWNTOWN_HOUSTON_AREA_ID,
    operatingAreaName: 'Downtown Houston / East Downtown operating area (ZIPs 77002 and 77010)',
    validatedAt: now.toISOString(),
    validationSources: DOWNTOWN_HOUSTON_VALIDATION_SOURCES.map((source) => ({
      ...source,
      checkedAt: now.toISOString(),
    })),
    zones,
    roads,
    shelters,
  };
  const parsed = MapDataSchema.safeParse(mapData);
  if (!parsed.success) throw new Error(`Invalid operational geography: ${parsed.error.message}`);
  const validation = validateOperationalGeography(parsed.data);
  if (!validation.valid)
    throw new Error(`Invalid operational geography: ${validation.errors.join('; ')}`);
  return parsed.data;
}
