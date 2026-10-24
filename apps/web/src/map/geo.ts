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

/** Bundled light style used when no Amazon Location key is set: a pale background plus a grid. */
export const OFFLINE_STYLE = {
  version: 8 as const,
  sources: {
    [GRID_SOURCE_ID]: { type: 'geojson' as const, data: gridToGeoJSON() },
  },
  layers: [
    { id: 'background', type: 'background' as const, paint: { 'background-color': '#eef2f6' } },
    {
      id: 'offline-grid-lines',
      type: 'line' as const,
      source: GRID_SOURCE_ID,
      paint: { 'line-color': '#cbd5e1', 'line-width': 1 },
    },
  ],
};

/** Basemaps the map switcher offers. */
export type Basemap = 'streets' | 'satellite' | 'dark';

export const BASEMAPS: { id: Basemap; label: string }[] = [
  { id: 'streets', label: 'Streets' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'dark', label: 'Dark' },
];

export interface MapStyleOptions {
  basemap?: Basemap;
  /** Live traffic flow and incidents (Amazon Location `traffic=All`). */
  traffic?: boolean;
}

/**
 * Amazon Location Maps v2 style descriptor URL.
 *   streets   -> Standard, Light, hillshade terrain (colorful: parks, water, roads by class)
 *   satellite -> Hybrid (imagery plus road and label overlays)
 *   dark      -> Standard, Dark
 * `traffic` adds real-time congestion colors (all styles support it except Satellite; Hybrid does).
 */
export function locationStyleUrl(apiKey: string, options: MapStyleOptions = {}): string {
  const { basemap = 'streets', traffic = true } = options;
  const style = basemap === 'satellite' ? 'Hybrid' : 'Standard';
  const params = new URLSearchParams({ key: apiKey });
  if (basemap !== 'satellite') {
    params.set('color-scheme', basemap === 'dark' ? 'Dark' : 'Light');
    params.set('terrain', 'Hillshade');
  }
  params.set('political-view', 'USA');
  if (traffic) params.set('traffic', 'All');
  return `https://maps.geo.us-east-1.amazonaws.com/v2/styles/${style}/descriptor?${params}`;
}

export function resolveMapStyle(
  apiKey: string | undefined,
  options: MapStyleOptions = {},
): string | typeof OFFLINE_STYLE {
  return apiKey ? locationStyleUrl(apiKey, options) : OFFLINE_STYLE;
}

// ---------- Situation overlays (zones by status, access roads, weather cells, heat) ----------

/** Map palette. Chosen to read on a light basemap and on satellite imagery. */
export const PALETTE = {
  monitored: '#2563eb', // blue-600
  outage: '#f59e0b', // amber-500
  isolated: '#dc2626', // red-600
  roadOpen: '#16a34a', // green-600
  roadClosed: '#dc2626',
  weather: '#0ea5e9', // sky-500
  shelter: '#0d9488', // teal-600
  shelterActive: '#16a34a',
  evacuation: '#16a34a',
  drone: '#7c3aed', // violet-600
  related: '#f97316', // orange-500
  casing: '#ffffff',
} as const;

export type ZoneStatus = 'monitored' | 'outage' | 'isolated';
export type ZoneStatusProps = ZoneProps & { status: ZoneStatus; color: string };

/** The engine's view of a zone, as far as the map needs it. */
export interface ZoneSituation {
  zoneId: string;
  isolated: boolean;
  outageEventIds: string[];
  dependentPatients?: number;
}

/** Every monitored zone, colored by status: blue (normal), amber (power out), red (cut off). */
export function zoneStatusesToGeoJSON(
  zones: Zone[],
  situations: ZoneSituation[],
): FeatureCollection<Polygon, ZoneStatusProps> {
  return collection(
    zones.map((z) => {
      const s = situations.find((x) => x.zoneId === z.id);
      const status: ZoneStatus = s?.isolated
        ? 'isolated'
        : s && s.outageEventIds.length > 0
          ? 'outage'
          : 'monitored';
      return {
        type: 'Feature' as const,
        geometry: z.polygon,
        properties: { id: z.id, name: z.name, status, color: PALETTE[status] },
      };
    }),
  );
}

export type AccessRoadProps = RoadProps & { status: 'open' | 'closed'; color: string };

/** Every zone access road: green when open, red when a closure cuts it. */
export function accessRoadsToGeoJSON(
  roads: RoadSegment[],
  zones: Zone[],
  closedRoadIds: string[],
): FeatureCollection<LineString, AccessRoadProps> {
  const access = new Set(zones.flatMap((z) => z.accessRoadIds));
  const closed = new Set(closedRoadIds);
  return collection(
    roads
      .filter((r) => access.has(r.id))
      .map((r) => {
        const status = closed.has(r.id) ? ('closed' as const) : ('open' as const);
        return {
          type: 'Feature' as const,
          geometry: r.line,
          properties: {
            id: r.id,
            name: r.name,
            status,
            color: status === 'closed' ? PALETTE.roadClosed : PALETTE.roadOpen,
          },
        };
      }),
  );
}

/** A circle as a polygon (equirectangular approximation; fine at city scale). */
export function circlePolygon(
  center: { lat: number; lon: number },
  radiusKm: number,
  steps = 48,
): Polygon {
  const dLat = radiusKm / 110.574;
  const dLon = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  const ring: [number, number][] = Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    return [center.lon + dLon * Math.cos(a), center.lat + dLat * Math.sin(a)];
  });
  ring.push(ring[0]!);
  return { type: 'Polygon', coordinates: [ring] };
}

export type WeatherCellProps = { id: string; severity: Severity; description: string };

/** Weather events as translucent storm cells; high-severity warnings get a larger radius. */
export function weatherCellsToGeoJSON(
  events: DemoEvent[],
): FeatureCollection<Polygon, WeatherCellProps> {
  return collection(
    events
      .filter((e) => e.type === 'weather')
      .map((e) => ({
        type: 'Feature' as const,
        geometry: circlePolygon(e, e.severity === 'low' ? 1.2 : 2.4),
        properties: { id: e.id, severity: e.severity, description: e.description },
      })),
  );
}

const SEVERITY_WEIGHT: Record<Severity, number> = { low: 0.2, high: 0.6, critical: 1 };

/** Non-weather events weighted by severity, for the impact heatmap. */
export function impactHeatToGeoJSON(
  events: DemoEvent[],
): FeatureCollection<Point, { weight: number }> {
  return collection(
    events
      .filter((e) => e.type !== 'weather')
      .map((e) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [e.lon, e.lat] as [number, number] },
        properties: { weight: SEVERITY_WEIGHT[e.severity] },
      })),
  );
}

/** [[west, south], [east, north]] around the zones and shelters, padded by `padDeg`. */
export function overviewBounds(
  zones: Zone[],
  points: { lat: number; lon: number }[],
  padDeg = 0.01,
): [[number, number], [number, number]] {
  const coords: [number, number][] = [
    ...zones.flatMap((z) => z.polygon.coordinates[0] ?? []),
    ...points.map((p) => [p.lon, p.lat] as [number, number]),
  ];
  if (coords.length === 0) {
    return [
      [HOUSTON_CENTER.lon - 0.1, HOUSTON_CENTER.lat - 0.1],
      [HOUSTON_CENTER.lon + 0.1, HOUSTON_CENTER.lat + 0.1],
    ];
  }
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lons) - padDeg, Math.min(...lats) - padDeg],
    [Math.max(...lons) + padDeg, Math.max(...lats) + padDeg],
  ];
}

/** Top-center of a zone (its north edge, midway across), where the zone's label sits. */
export function zoneLabelAnchor(polygon: Polygon): [number, number] {
  const ring = polygon.coordinates[0] ?? [];
  if (ring.length === 0) return [0, 0];
  const lons = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  return [(Math.min(...lons) + Math.max(...lons)) / 2, Math.max(...lats)];
}

/** The point a fraction `t` (0..1) of the way along a polyline, by distance. */
export function pointAlong(coords: [number, number][], t: number): [number, number] {
  if (coords.length === 0) return [0, 0];
  if (coords.length === 1 || t <= 0) return coords[0]!;
  const seg = coords.slice(1).map((c, i) => Math.hypot(c[0] - coords[i]![0], c[1] - coords[i]![1]));
  const total = seg.reduce((a, b) => a + b, 0);
  let left = Math.min(1, t) * total;
  for (let i = 0; i < seg.length; i++) {
    const len = seg[i]!;
    if (left <= len || i === seg.length - 1) {
      const f = len === 0 ? 1 : Math.min(1, left / len);
      const [a, b] = [coords[i]!, coords[i + 1]!];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    left -= len;
  }
  return coords[coords.length - 1]!;
}

export type EvacuationProps = { zoneId: string; shelterId: string };

/** Evacuation routes from a zone's centroid to the shelter an approved alert activated. */
export function evacuationRoutesToGeoJSON(
  pairs: { zone: Zone; shelter: Shelter }[],
): FeatureCollection<LineString, EvacuationProps> {
  return collection(
    pairs.map(({ zone, shelter }) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          polygonCentroid(zone.polygon),
          [shelter.lon, shelter.lat] as [number, number],
        ],
      },
      properties: { zoneId: zone.id, shelterId: shelter.id },
    })),
  );
}

// ---------- Task 5: alert overlays (related lines, drone, shelter state) ----------

/** Average of a polygon's outer ring vertices (the closing vertex is dropped). */
export function polygonCentroid(polygon: Polygon): [number, number] {
  const ring = polygon.coordinates[0] ?? [];
  // A GeoJSON ring repeats its first point as its last; drop it so it isn't double-counted.
  const pts = ring.length > 1 ? ring.slice(0, -1) : ring;
  if (pts.length === 0) return [0, 0];
  let lon = 0;
  let lat = 0;
  for (const [x, y] of pts) {
    lon += x;
    lat += y;
  }
  return [lon / pts.length, lat / pts.length];
}

export type RelatedLineProps = { order: number };

/**
 * A single LineString connecting an alert's related events, in the order outage → closure →
 * any others. The order follows `alert.relatedEventIds`, which the engine emits as outage first.
 * Returns an empty collection when fewer than two of the ids resolve to events.
 */
export function relatedEventLinesToGeoJSON(
  relatedEventIds: string[],
  events: DemoEvent[],
): FeatureCollection<LineString, RelatedLineProps> {
  const byId = new Map(events.map((e) => [e.id, e]));
  const coords = relatedEventIds
    .map((id) => byId.get(id))
    .filter((e): e is DemoEvent => e !== undefined)
    .map((e) => [e.lon, e.lat] as [number, number]);
  if (coords.length < 2) return collection<LineString, RelatedLineProps>([]);
  return collection([
    {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: coords },
      properties: { order: 0 },
    },
  ]);
}

export type DroneProps = { zoneId: string };

/**
 * The drone's flight path from a base point to a zone's centroid, drawn only after a
 * dispatch_drone action is approved. Returns an empty collection when the zone is missing.
 */
export function dronePathToGeoJSON(
  base: { lat: number; lon: number },
  zone: Zone | undefined,
): FeatureCollection<LineString, DroneProps> {
  if (!zone) return collection<LineString, DroneProps>([]);
  const target = polygonCentroid(zone.polygon);
  return collection([
    {
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: [[base.lon, base.lat] as [number, number], target],
      },
      properties: { zoneId: zone.id },
    },
  ]);
}

/**
 * Shelters with the ids in `activatedShelterIds` flipped to `active`, so the map can turn a
 * dispatched shelter green. Other shelters are returned unchanged.
 */
export function withActivatedShelters(
  shelters: Shelter[],
  activatedShelterIds: Iterable<string>,
): Shelter[] {
  const active = new Set(activatedShelterIds);
  return shelters.map((s) => (active.has(s.id) ? { ...s, status: 'active' as const } : s));
}
