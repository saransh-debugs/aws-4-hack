/**
 * Pure functions that turn domain data into GeoJSON and map styles. No WebGL here, so all of
 * this is unit-tested; MapComponent only wires the results into react-map-gl.
 */
import type {
  DemoEvent,
  EventType,
  LineString,
  Polygon,
  RoadSegment,
  Severity,
  Shelter,
  Zone,
} from '@gridrisk/shared';
import { HOUSTON_CENTER } from '@gridrisk/shared/fixtures';

export interface Point {
  type: 'Point';
  coordinates: [number, number];
}

export interface Feature<G, P> {
  type: 'Feature';
  geometry: G;
  properties: P;
}

export interface FeatureCollection<G, P> {
  type: 'FeatureCollection';
  features: Feature<G, P>[];
}

export type EventProps = {
  id: string;
  type: EventType;
  severity: Severity;
  description: string;
};
export type ZoneProps = { id: string; name: string };
export type RoadProps = { id: string; name: string };
export type ShelterProps = { id: string; name: string; status: Shelter['status'] };
export type GridProps = Record<string, never>;

const collection = <G, P>(features: Feature<G, P>[]): FeatureCollection<G, P> => ({
  type: 'FeatureCollection',
  features,
});

export function eventsToGeoJSON(events: DemoEvent[]): FeatureCollection<Point, EventProps> {
  return collection(
    events.map((e) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [e.lon, e.lat] as [number, number] },
      properties: { id: e.id, type: e.type, severity: e.severity, description: e.description },
    })),
  );
}

/** Zones that currently have an outage event: these are drawn as the red outage polygon. */
export function outageZonesToGeoJSON(
  zones: Zone[],
  events: DemoEvent[],
): FeatureCollection<Polygon, ZoneProps> {
  const outageZoneIds = new Set(events.filter((e) => e.type === 'outage').map((e) => e.zoneId));
  return collection(
    zones
      .filter((z) => outageZoneIds.has(z.id))
      .map((z) => ({
        type: 'Feature' as const,
        geometry: z.polygon,
        properties: { id: z.id, name: z.name },
      })),
  );
}

/** Road segments whose closure cuts off a zone: drawn as the yellow closure line. */
export function closedRoadsToGeoJSON(
  roads: RoadSegment[],
  closedRoadIds: string[],
): FeatureCollection<LineString, RoadProps> {
  const closed = new Set(closedRoadIds);
  return collection(
    roads
      .filter((r) => closed.has(r.id))
      .map((r) => ({
        type: 'Feature' as const,
        geometry: r.line,
        properties: { id: r.id, name: r.name },
      })),
  );
}

export function sheltersToGeoJSON(shelters: Shelter[]): FeatureCollection<Point, ShelterProps> {
  return collection(
    shelters.map((s) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] as [number, number] },
      properties: { id: s.id, name: s.name, status: s.status },
    })),
  );
}

/** Lat/lon grid lines around a center, for the offline style. */
export function gridToGeoJSON(
  center: { lat: number; lon: number } = HOUSTON_CENTER,
  halfSpanDeg = 0.5,
  stepDeg = 0.05,
): FeatureCollection<LineString, GridProps> {
  const steps = Math.round(halfSpanDeg / stepDeg);
  const offsets = Array.from({ length: steps * 2 + 1 }, (_, i) => (i - steps) * stepDeg);
  const round = (n: number): number => Math.round(n * 1e6) / 1e6;
  const lines: Feature<LineString, GridProps>[] = [];

  for (const d of offsets) {
    lines.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [round(center.lon - halfSpanDeg), round(center.lat + d)],
          [round(center.lon + halfSpanDeg), round(center.lat + d)],
        ],
      },
    });
    lines.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [round(center.lon + d), round(center.lat - halfSpanDeg)],
          [round(center.lon + d), round(center.lat + halfSpanDeg)],
        ],
      },
    });
  }
  return collection(lines);
}

export const GRID_SOURCE_ID = 'offline-grid';

/** Bundled style used when no Amazon Location key is set: dark background plus a grid. */
export const OFFLINE_STYLE = {
  version: 8 as const,
  sources: {
    [GRID_SOURCE_ID]: { type: 'geojson' as const, data: gridToGeoJSON() },
  },
  layers: [
    { id: 'background', type: 'background' as const, paint: { 'background-color': '#0b1220' } },
    {
      id: 'offline-grid-lines',
      type: 'line' as const,
      source: GRID_SOURCE_ID,
      paint: { 'line-color': '#334155', 'line-width': 1 },
    },
  ],
};

/** TODO: confirm this URL against the current Amazon Location Service maps docs. */
export function locationStyleUrl(apiKey: string): string {
  return `https://maps.geo.us-east-1.amazonaws.com/v2/styles/Monochrome/descriptor?key=${encodeURIComponent(apiKey)}&color-scheme=Dark`;
}

export function resolveMapStyle(apiKey: string | undefined): string | typeof OFFLINE_STYLE {
  return apiKey ? locationStyleUrl(apiKey) : OFFLINE_STYLE;
}
