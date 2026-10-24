import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  Layer,
  Marker,
  NavigationControl,
  ScaleControl,
  Source,
  type MapRef,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import './workerSetup';
import { analyze } from '@gridrisk/engine';
import type { Shelter, Zone } from '@gridrisk/shared';
import { HOUSTON_CENTER, ROADS, SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import { useGridStore } from '../store';
import {
  PALETTE,
  accessRoadsToGeoJSON,
  dronePathToGeoJSON,
  evacuationRoutesToGeoJSON,
  impactHeatToGeoJSON,
  overviewBounds,
  pointAlong,
  polygonCentroid,
  relatedEventLinesToGeoJSON,
  resolveMapStyle,
  weatherCellsToGeoJSON,
  withActivatedShelters,
  zoneLabelAnchor,
  zoneStatusesToGeoJSON,
  type Basemap,
} from './geo';
import { fetchEvacuationRoute } from './routes';
import { DroneMarker, EventPin, ShelterPin, ZoneLabel } from './markers';
import { MapControls } from './MapControls';
import { MapLegend } from './MapLegend';
import { useRecentArrivals } from '../data/useRecentArrivals';

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const API_KEY = import.meta.env.VITE_LOCATION_API_KEY || undefined;

/** The drone's launch point: the first shelter, or the Houston center as a fallback. */
const DRONE_BASE = SHELTERS[0] ?? HOUSTON_CENTER;
const DRONE_FLIGHT_MS = 6_000;
const OVERVIEW = overviewBounds(ZONES, SHELTERS, 0.012);

/**
 * Houston situation map on a light Amazon Location basemap (Standard, hillshade, live traffic),
 * with a switcher for satellite and dark. Overlays, bottom to top: impact heat, storm cells,
 * zones colored by status, access roads (green open / red closed), the links between an alert's
 * events, the evacuation route over real roads (Amazon Location Routes) and the drone path after
 * dispatch, then zone labels, shelters and event pins. Selecting an event flies the map to it.
 */
export default function MapComponent() {
  const events = useGridStore((s) => s.events);
  const alerts = useGridStore((s) => s.alerts);
  const selectedEventId = useGridStore((s) => s.selectedEventId);
  const selectEvent = useGridStore((s) => s.selectEvent);
  const newIds = useRecentArrivals();
  const mapRef = useRef<MapRef>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<Basemap>('streets');
  const [traffic, setTraffic] = useState(true);

  const mapStyle = useMemo(
    () => resolveMapStyle(API_KEY, { basemap, traffic }),
    [basemap, traffic],
  );

  const results = useMemo(() => analyze(events, ZONES, { shelters: SHELTERS }), [events]);

  const dispatched = useMemo(
    () => alerts.filter((a) => a.status === 'dispatched' || a.status === 'approved'),
    [alerts],
  );

  const activatedShelterIds = useMemo(
    () =>
      dispatched.flatMap((a) =>
        a.proposedActions
          .filter((p) => p.type === 'activate_shelter')
          .map((p) => String(p.params.shelterId ?? '')),
      ),
    [dispatched],
  );
  const shelters = useMemo(
    () => withActivatedShelters(SHELTERS, activatedShelterIds),
    [activatedShelterIds],
  );

  const closedRoadIds = useMemo(() => results.flatMap((r) => r.closedAccessRoadIds), [results]);

  const geo = useMemo(() => {
    const related = alerts.flatMap(
      (a) => relatedEventLinesToGeoJSON(a.relatedEventIds, events).features,
    );
    return {
      zones: zoneStatusesToGeoJSON(ZONES, results),
      roads: accessRoadsToGeoJSON(ROADS, ZONES, closedRoadIds),
      weather: weatherCellsToGeoJSON(events),
      heat: impactHeatToGeoJSON(events),
      related: { type: 'FeatureCollection' as const, features: related },
    };
  }, [events, alerts, results, closedRoadIds]);

  // ---- Evacuation routes: zone -> activated shelter, over real roads, around the closures ----
  const evacPairs = useMemo(
    () =>
      dispatched.flatMap((a) => {
        const zone = ZONES.find((z) => z.id === a.zoneId);
        const ids = a.proposedActions
          .filter((p) => p.type === 'activate_shelter')
          .map((p) => String(p.params.shelterId ?? ''));
        return zone
          ? shelters.filter((s) => ids.includes(s.id)).map((shelter) => ({ zone, shelter }))
          : [];
      }),
    [dispatched, shelters],
  );
  const routes = useEvacuationRoutes(evacPairs, closedRoadIds);

  // ---- Drone: flies from the base to each dispatched zone ----
  const dronePaths = useMemo(() => {
    const zoneIds = dispatched.flatMap((a) =>
      a.proposedActions
        .filter((p) => p.type === 'dispatch_drone')
        .map((p) => String(p.params.zoneId ?? a.zoneId)),
    );
    return {
      type: 'FeatureCollection' as const,
      features: zoneIds.flatMap(
        (zoneId) =>
          dronePathToGeoJSON(
            DRONE_BASE,
            ZONES.find((z) => z.id === zoneId),
          ).features,
      ),
    };
  }, [dispatched]);
  const droneProgress = useFlightProgress(dronePaths.features.map((f) => f.properties.zoneId));

  const flyToOverview = useCallback(() => {
    mapRef.current?.fitBounds(OVERVIEW, {
      padding: 48,
      duration: prefersReducedMotion() ? 0 : 900,
    });
  }, []);

  useEffect(() => {
    const event = useGridStore.getState().events.find((e) => e.id === selectedEventId);
    if (!event) return;
    mapRef.current?.flyTo({
      center: [event.lon, event.lat],
      zoom: 14,
      duration: prefersReducedMotion() ? 0 : 800,
    });
  }, [selectedEventId]);

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        initialViewState={{ bounds: OVERVIEW, fitBoundsOptions: { padding: 48 } }}
        mapStyle={mapStyle}
        style={{ position: 'absolute', inset: 0 }}
        attributionControl={{ compact: true }}
        onError={(e) => setMapError(e.error?.message ?? 'Unknown map error')}
      >
        <NavigationControl position="bottom-right" visualizePitch />
        <ScaleControl position="bottom-right" unit="imperial" />

        {/* Impact heat: where severe, non-weather events cluster. */}
        <Source id="impact-heat" type="geojson" data={geo.heat}>
          <Layer
            id="impact-heat-layer"
            type="heatmap"
            paint={{
              'heatmap-weight': ['get', 'weight'],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 30, 15, 80],
              'heatmap-intensity': 0.9,
              'heatmap-opacity': 0.45,
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0,
                'rgba(254,240,138,0)',
                0.3,
                'rgba(253,224,71,0.6)',
                0.6,
                'rgba(249,115,22,0.75)',
                1,
                'rgba(220,38,38,0.85)',
              ],
            }}
          />
        </Source>

        {/* Storm cells from weather events. */}
        <Source id="weather" type="geojson" data={geo.weather}>
          <Layer
            id="weather-fill"
            type="fill"
            paint={{
              'fill-color': PALETTE.weather,
              'fill-opacity': ['match', ['get', 'severity'], 'low', 0.12, 0.22],
            }}
          />
          <Layer
            id="weather-outline"
            type="line"
            paint={{ 'line-color': PALETTE.weather, 'line-width': 1.5, 'line-dasharray': [3, 2] }}
          />
        </Source>

        {/* Every zone, colored by status. */}
        <Source id="zones" type="geojson" data={geo.zones}>
          <Layer
            id="zones-fill"
            type="fill"
            paint={{
              'fill-color': ['get', 'color'],
              'fill-opacity': ['match', ['get', 'status'], 'isolated', 0.32, 'outage', 0.24, 0.1],
            }}
          />
          <Layer
            id="zones-outline-casing"
            type="line"
            paint={{ 'line-color': PALETTE.casing, 'line-width': 5, 'line-opacity': 0.8 }}
          />
          <Layer
            id="zones-outline"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': ['match', ['get', 'status'], 'isolated', 3.5, 2.5],
            }}
          />
        </Source>

        {/* Access roads: white casing under green (open) or red dashed (closed). */}
        <Source id="access-roads" type="geojson" data={geo.roads}>
          <Layer
            id="access-roads-casing"
            type="line"
            layout={{ 'line-cap': 'round' }}
            paint={{ 'line-color': PALETTE.casing, 'line-width': 11 }}
          />
          <Layer
            id="access-roads-open"
            type="line"
            filter={['==', ['get', 'status'], 'open']}
            layout={{ 'line-cap': 'round' }}
            paint={{ 'line-color': PALETTE.roadOpen, 'line-width': 6 }}
          />
          <Layer
            id="access-roads-closed"
            type="line"
            filter={['==', ['get', 'status'], 'closed']}
            paint={{
              'line-color': PALETTE.roadClosed,
              'line-width': 7,
              'line-dasharray': [1.2, 0.8],
            }}
          />
        </Source>

        {/* Links between an alert's related events (outage → closure → …). */}
        <Source id="related" type="geojson" data={geo.related}>
          <Layer
            id="related-line"
            type="line"
            paint={{
              'line-color': PALETTE.related,
              'line-width': 2.5,
              'line-dasharray': [2, 1.5],
              'line-opacity': 0.95,
            }}
          />
        </Source>

        {/* Evacuation route over real roads (falls back to a straight line). */}
        <Source id="evacuation" type="geojson" data={routes}>
          <Layer
            id="evacuation-casing"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': PALETTE.casing, 'line-width': 9 }}
          />
          <Layer
            id="evacuation-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': PALETTE.evacuation, 'line-width': 5 }}
          />
        </Source>

        {/* Drone flight path, shown only after a dispatch_drone action is approved. */}
        <Source id="drone-path" type="geojson" data={dronePaths}>
          <Layer
            id="drone-path-line"
            type="line"
            paint={{ 'line-color': PALETTE.drone, 'line-width': 2.5, 'line-dasharray': [1, 1.5] }}
          />
        </Source>

        {ZONES.map((z, i) => {
          const f = geo.zones.features.find((x) => x.properties.id === z.id);
          const edge = i % 2 === 0 ? 'north' : 'south';
          const [lon, lat] = zoneLabelAnchor(z.polygon, edge);
          return (
            <Marker
              key={`label-${z.id}`}
              latitude={lat}
              longitude={lon}
              anchor={edge === 'north' ? 'bottom' : 'top'}
              offset={[0, edge === 'north' ? -4 : 4]}
            >
              <ZoneLabel
                name={z.name}
                status={f?.properties.status ?? 'monitored'}
                patients={results.find((r) => r.zoneId === z.id)?.dependentPatients}
              />
            </Marker>
          );
        })}

        {shelters.map((s) => (
          <Marker key={s.id} latitude={s.lat} longitude={s.lon} anchor="bottom">
            <ShelterPin shelter={s} />
          </Marker>
        ))}

        {events.map((e) => (
          <Marker key={e.id} latitude={e.lat} longitude={e.lon} anchor="center">
            <EventPin
              event={e}
              selected={e.id === selectedEventId}
              isNew={newIds.has(e.id)}
              onSelect={() => selectEvent(e.id)}
            />
          </Marker>
        ))}

        {dronePaths.features.map((f) => {
          const t = droneProgress[f.properties.zoneId] ?? 1;
          const [lon, lat] = pointAlong(f.geometry.coordinates, t);
          const zoneName = ZONES.find((z) => z.id === f.properties.zoneId)?.name ?? 'zone';
          return (
            <Marker
              key={`drone-${f.properties.zoneId}`}
              latitude={lat}
              longitude={lon}
              anchor="center"
            >
              <DroneMarker zoneName={zoneName} arrived={t >= 1} />
            </Marker>
          );
        })}
      </Map>

      <MapControls
        basemap={basemap}
        onBasemap={setBasemap}
        traffic={traffic}
        onTraffic={setTraffic}
        onOverview={flyToOverview}
        liveBasemap={API_KEY !== undefined}
      />
      {mapError && (
        <p role="alert" className="map-error">
          Basemap problem: {mapError}
        </p>
      )}
      <MapLegend />
    </div>
  );
}

/** Road routes for each zone → shelter pair; straight lines until (or unless) Routes answers. */
function useEvacuationRoutes(pairs: { zone: Zone; shelter: Shelter }[], closedRoadIds: string[]) {
  const [roadRoutes, setRoadRoutes] = useState<Record<string, [number, number][]>>({});
  const pairKey = pairs.map((p) => `${p.zone.id}>${p.shelter.id}`).join(',');

  useEffect(() => {
    if (!API_KEY || pairs.length === 0) return;
    const controller = new AbortController();
    const avoid = ROADS.filter((r) => closedRoadIds.includes(r.id)).map((r) => r.line);
    for (const { zone, shelter } of pairs) {
      const id = `${zone.id}>${shelter.id}`;
      fetchEvacuationRoute(
        API_KEY,
        {
          origin: polygonCentroid(zone.polygon),
          destination: [shelter.lon, shelter.lat],
          avoid,
        },
        fetch,
        controller.signal,
      )
        .then((r) => r && setRoadRoutes((prev) => ({ ...prev, [id]: r.coordinates })))
        .catch(() => undefined); // keep the straight-line fallback
    }
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pairKey captures pairs
  }, [pairKey, closedRoadIds.join(',')]);

  return useMemo(() => {
    const straight = evacuationRoutesToGeoJSON(pairs);
    return {
      ...straight,
      features: straight.features.map((f) => {
        const road = roadRoutes[`${f.properties.zoneId}>${f.properties.shelterId}`];
        return road ? { ...f, geometry: { type: 'LineString' as const, coordinates: road } } : f;
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pairKey captures pairs
  }, [pairKey, roadRoutes]);
}

/** 0 → 1 over DRONE_FLIGHT_MS for each newly dispatched zone (1 at once with reduced motion). */
function useFlightProgress(zoneIds: string[]): Record<string, number> {
  const [progress, setProgress] = useState<Record<string, number>>({});
  const starts = useRef<Record<string, number>>({});
  const key = zoneIds.join(',');

  useEffect(() => {
    if (zoneIds.length === 0) return;
    if (prefersReducedMotion()) {
      setProgress(Object.fromEntries(zoneIds.map((z) => [z, 1])));
      return;
    }
    const now = performance.now();
    for (const z of zoneIds) starts.current[z] ??= now;
    let frame = 0;
    const tick = () => {
      const t = performance.now();
      const next = Object.fromEntries(
        zoneIds.map((z) => [z, Math.min(1, (t - starts.current[z]!) / DRONE_FLIGHT_MS)]),
      );
      setProgress(next);
      if (Object.values(next).some((v) => v < 1)) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures zoneIds
  }, [key]);

  return progress;
}
