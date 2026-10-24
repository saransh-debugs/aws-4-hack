import type { DemoEvent, Shelter } from '@gridrisk/shared';
import { DemoEventSchema, ShelterSchema } from '@gridrisk/shared';

export const DRIVETEXAS_CONDITIONS_URL = 'https://api.drivetexas.org/api/conditions.geojson';
export const FEMA_OPEN_SHELTERS_URL =
  'https://gis.fema.gov/arcgis/rest/services/NSS/FEMA_NSS/MapServer/0/query';

export type OperationalEventType = 'outage' | 'road_closure';

export interface OperationalFeedConfig {
  name: string;
  url: string;
  type: OperationalEventType;
  userAgent?: string;
}

type FeedPayload = { events?: unknown[] } | unknown[];

/** Normalize an approved operational feed without assuming a provider-specific schema. */
export function normalizeOperationalEvents(
  payload: FeedPayload,
  type: OperationalEventType,
): DemoEvent[] {
  const rows = Array.isArray(payload) ? payload : (payload.events ?? []);
  return rows.flatMap((row) => {
    const parsed = DemoEventSchema.safeParse({ ...(row as object), type });
    return parsed.success ? [parsed.data] : [];
  });
}

export async function fetchOperationalEvents(
  config: OperationalFeedConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<DemoEvent[]> {
  const response = await fetchImpl(config.url, {
    headers: {
      Accept: 'application/json',
      ...(config.userAgent ? { 'User-Agent': config.userAgent } : {}),
    },
  });
  if (!response.ok) throw new Error(`${config.name} request failed: ${response.status}`);
  return normalizeOperationalEvents((await response.json()) as FeedPayload, config.type);
}

export async function fetchShelters(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Shelter[]> {
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Shelter request failed: ${response.status}`);
  const rows = (await response.json()) as unknown;
  const values = Array.isArray(rows) ? rows : ((rows as { shelters?: unknown[] }).shelters ?? []);
  return values.flatMap((row) => {
    const parsed = ShelterSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

interface GeoJsonFeatureCollection {
  features?: Array<{
    id?: string | number;
    geometry?: { type?: string; coordinates?: unknown } | null;
    properties?: Record<string, unknown>;
  }>;
}

function severityFromRoadProperties(properties: Record<string, unknown>): DemoEvent['severity'] {
  const value = String(
    properties.severity ?? properties.impact ?? properties.condition ?? '',
  ).toLowerCase();
  if (value.includes('closed') || value.includes('critical') || value.includes('major'))
    return 'critical';
  if (value.includes('high') || value.includes('flood') || value.includes('damage')) return 'high';
  return 'low';
}

/** Normalize TxDOT DriveTexas GeoJSON conditions into road-closure events. */
export function normalizeDriveTexasConditions(payload: GeoJsonFeatureCollection): DemoEvent[] {
  return (payload.features ?? []).flatMap((feature, index) => {
    const coordinates = feature.geometry?.coordinates;
    const point =
      Array.isArray(coordinates) &&
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number'
        ? [coordinates[0], coordinates[1]]
        : null;
    if (!point) return [];
    const properties = feature.properties ?? {};
    return [
      {
        id: String(feature.id ?? properties.id ?? properties.condition_id ?? `drivetexas-${index}`),
        type: 'road_closure' as const,
        lon: point[0]!,
        lat: point[1]!,
        description: String(
          properties.description ??
            properties.condition ??
            properties.remarks ??
            'TxDOT road condition',
        ),
        severity: severityFromRoadProperties(properties),
        timestamp: typeof properties.updated_at === 'string' ? properties.updated_at : undefined,
      },
    ];
  });
}

export async function fetchDriveTexasConditions(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DemoEvent[]> {
  if (!apiKey) throw new Error('DRIVETEXAS_API_KEY is required');
  const response = await fetchImpl(
    `${DRIVETEXAS_CONDITIONS_URL}?key=${encodeURIComponent(apiKey)}`,
    {
      headers: { Accept: 'application/geo+json' },
    },
  );
  if (!response.ok) throw new Error(`DriveTexas request failed: ${response.status}`);
  return normalizeDriveTexasConditions((await response.json()) as GeoJsonFeatureCollection);
}

interface FemaShelterRow {
  attributes?: Record<string, unknown>;
}

/** Normalize FEMA's open-shelter layer into the shared shelter contract. */
export function normalizeFemaOpenShelters(payload: { features?: FemaShelterRow[] }): Shelter[] {
  return (payload.features ?? []).flatMap(({ attributes = {} }) => {
    const lat = Number(attributes.latitude);
    const lon = Number(attributes.longitude);
    const capacity = Number(attributes.post_impact_capacity ?? attributes.evacuation_capacity ?? 0);
    const parsed = ShelterSchema.safeParse({
      id: `fema-${String(attributes.shelter_id ?? attributes.objectid ?? '')}`,
      name: String(attributes.shelter_name ?? 'Unnamed FEMA shelter'),
      lat,
      lon,
      capacity: Number.isFinite(capacity) ? Math.max(0, Math.round(capacity)) : 0,
      status:
        String(attributes.shelter_status_code ?? attributes.status).toUpperCase() === 'OPEN'
          ? 'active'
          : 'standby',
    });
    return parsed.success && parsed.data.id !== 'fema-' ? [parsed.data] : [];
  });
}

export async function fetchFemaOpenShelters(
  state = 'TX',
  county = 'Harris',
  fetchImpl: typeof fetch = fetch,
): Promise<Shelter[]> {
  const params = new URLSearchParams({
    where: `state='${state}' AND county_parish='${county}'`,
    outFields:
      'shelter_id,shelter_name,latitude,longitude,post_impact_capacity,evacuation_capacity,shelter_status_code',
    returnGeometry: 'false',
    f: 'json',
  });
  const response = await fetchImpl(`${FEMA_OPEN_SHELTERS_URL}?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`FEMA shelter request failed: ${response.status}`);
  return normalizeFemaOpenShelters((await response.json()) as { features?: FemaShelterRow[] });
}

export function buildSyntheticUtilityOutage(zoneId: string, now = new Date()): DemoEvent {
  return {
    id: `synthetic-outage-${zoneId}`,
    type: 'outage',
    lat: 29.7575,
    lon: -95.365,
    description: `Synthetic utility outage for ${zoneId}; replace with an approved utility feed.`,
    severity: 'critical',
    zoneId,
    timestamp: now.toISOString(),
  };
}
