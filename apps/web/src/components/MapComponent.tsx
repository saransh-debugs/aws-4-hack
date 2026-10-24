import { useEffect, useMemo, useRef } from 'react';
import Map, {
  Layer,
  NavigationControl,
  Source,
  type LayerProps,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import type { FeatureCollection, LineString, Point, Polygon } from 'geojson';
import type { DemoEvent, RoadSegment, Shelter, Zone } from '@gridrisk/shared';
import 'maplibre-gl/dist/maplibre-gl.css';

const HOUSTON_VIEW = { longitude: -95.37, latitude: 29.76, zoom: 11.5 } as const;

const OFFLINE_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [
    {
      id: 'offline-background',
      type: 'background' as const,
      paint: { 'background-color': '#0b1220' },
    },
  ],
};

const region = import.meta.env.VITE_AWS_REGION ?? 'us-east-1';
const locationKey = import.meta.env.VITE_LOCATION_API_KEY;
const locationMapName = import.meta.env.VITE_LOCATION_MAP_NAME;
const AMAZON_LOCATION_STYLE =
  locationKey && locationMapName
    ? `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${locationMapName}/style-descriptor?key=${locationKey}`
    : OFFLINE_STYLE;

export interface MapComponentProps {
  events: DemoEvent[];
  zones: Zone[];
  roads: RoadSegment[];
  shelters: Shelter[];
  selectedEventId?: string | null;
  onSelectEvent: (event: DemoEvent) => void;
}

function eventCollection(
  events: DemoEvent[],
  selectedEventId?: string | null,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: events.map((event) => ({
      type: 'Feature',
      id: event.id,
      geometry: { type: 'Point', coordinates: [event.lon, event.lat] },
      properties: {
        id: event.id,
        type: event.type,
        severity: event.severity,
        selected: event.id === selectedEventId,
      },
    })),
  };
}

function zoneCollection(zones: Zone[]): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: zones.map((zone) => ({
      type: 'Feature',
      id: zone.id,
      geometry: zone.polygon,
      properties: { id: zone.id, name: zone.name },
    })),
  };
}

function roadCollection(roads: RoadSegment[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: roads.map((road) => ({
      type: 'Feature',
      id: road.id,
      geometry: road.line,
      properties: { id: road.id, name: road.name },
    })),
  };
}

function shelterCollection(shelters: Shelter[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: shelters.map((shelter) => ({
      type: 'Feature',
      id: shelter.id,
      geometry: { type: 'Point', coordinates: [shelter.lon, shelter.lat] },
      properties: { id: shelter.id, name: shelter.name, capacity: shelter.capacity },
    })),
  };
}

const eventLayer: LayerProps = {
  id: 'events',
  type: 'circle' as const,
  source: 'events',
  paint: {
    'circle-radius': [
      'case',
      ['boolean', ['get', 'selected'], false],
      10,
      ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 9],
    ],
    'circle-color': [
      'match',
      ['get', 'severity'],
      'critical',
      '#ef4444',
      'high',
      '#f59e0b',
      '#94a3b8',
    ],
    'circle-stroke-color': '#f8fafc',
    'circle-stroke-width': 1.5,
    'circle-opacity': 0.95,
  } as never,
};

const zoneFillLayer = {
  id: 'zones-fill',
  type: 'fill' as const,
  source: 'zones',
  paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.08 },
};

const zoneOutlineLayer = {
  id: 'zones-outline',
  type: 'line' as const,
  source: 'zones',
  paint: { 'line-color': '#38bdf8', 'line-width': 1.5, 'line-opacity': 0.65 },
};

const roadLayer = {
  id: 'roads',
  type: 'line' as const,
  source: 'roads',
  paint: { 'line-color': '#fbbf24', 'line-width': 3, 'line-opacity': 0.8 },
};

const shelterLayer = {
  id: 'shelters',
  type: 'circle' as const,
  source: 'shelters',
  paint: {
    'circle-radius': 6,
    'circle-color': '#22c55e',
    'circle-stroke-color': '#dcfce7',
    'circle-stroke-width': 1.5,
  },
};

export function MapComponent({
  events,
  zones,
  roads,
  shelters,
  selectedEventId,
  onSelectEvent,
}: MapComponentProps) {
  const mapRef = useRef<MapRef>(null);
  const eventsById = useMemo(
    () => new globalThis.Map(events.map((event) => [event.id, event] as const)),
    [events],
  );
  const eventData = useMemo(
    () => eventCollection(events, selectedEventId),
    [events, selectedEventId],
  );
  const zoneData = useMemo(() => zoneCollection(zones), [zones]);
  const roadData = useMemo(() => roadCollection(roads), [roads]);
  const shelterData = useMemo(() => shelterCollection(shelters), [shelters]);

  useEffect(() => {
    const event = selectedEventId ? eventsById.get(selectedEventId) : undefined;
    if (!event) return;
    mapRef.current?.flyTo({ center: [event.lon, event.lat], zoom: 13, duration: 700 });
  }, [eventsById, selectedEventId]);

  const handleMapClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.find((candidate) => candidate.layer?.id === 'events');
    const id = typeof feature?.properties?.id === 'string' ? feature.properties.id : undefined;
    const selected = id ? eventsById.get(id) : undefined;
    if (selected) onSelectEvent(selected);
  };

  return (
    <div className="relative h-full min-h-[28rem] w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
      <Map
        ref={mapRef}
        initialViewState={HOUSTON_VIEW}
        mapStyle={AMAZON_LOCATION_STYLE}
        interactiveLayerIds={['events']}
        onClick={handleMapClick}
        attributionControl={false}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <Source id="zones" type="geojson" data={zoneData}>
          <Layer {...zoneFillLayer} />
          <Layer {...zoneOutlineLayer} />
        </Source>
        <Source id="roads" type="geojson" data={roadData}>
          <Layer {...roadLayer} />
        </Source>
        <Source id="shelters" type="geojson" data={shelterData}>
          <Layer {...shelterLayer} />
        </Source>
        <Source id="events" type="geojson" data={eventData}>
          <Layer {...eventLayer} />
        </Source>
      </Map>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-slate-700 bg-slate-950/85 px-3 py-2 text-[11px] text-slate-300 shadow-lg">
        <div className="font-mono tracking-wide text-slate-100">
          {locationKey && locationMapName ? 'AMAZON LOCATION' : 'OFFLINE DARK MAP'}
        </div>
        <div>
          {events.length} events · {zones.length} zones · {shelters.length} shelters
        </div>
      </div>
    </div>
  );
}
