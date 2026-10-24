import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2 } from 'lucide-react';
import Map, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import './workerSetup';
import { analyze } from '@gridrisk/engine';
import { HOUSTON_CENTER, ROADS, SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import { useGridStore } from '../store';
import {
  closedRoadsToGeoJSON,
  dronePathToGeoJSON,
  outageZonesToGeoJSON,
  relatedEventLinesToGeoJSON,
  resolveMapStyle,
  withActivatedShelters,
} from './geo';
import { MapLegend } from './MapLegend';

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The drone's launch point: the first shelter, or the Houston center as a fallback. */
const DRONE_BASE = SHELTERS[0] ?? HOUSTON_CENTER;

/**
 * Houston map: events, the outage zone (red), closed road (yellow), shelters, and the alert
 * overlays — lines between related events, a drone path and an activated (green) shelter after
 * dispatch. Selecting an event in the store (feed click) flies the map to it.
 */
export default function MapComponent() {
  const events = useGridStore((s) => s.events);
  const alerts = useGridStore((s) => s.alerts);
  const selectedEventId = useGridStore((s) => s.selectedEventId);
  const selectEvent = useGridStore((s) => s.selectEvent);
  const mapRef = useRef<MapRef>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const mapStyle = useMemo(() => resolveMapStyle(import.meta.env.VITE_LOCATION_API_KEY), []);

  const dispatched = useMemo(
    () => alerts.filter((a) => a.status === 'dispatched' || a.status === 'approved'),
    [alerts],
  );

  // Shelters that a dispatched alert activated, so they can render green.
  const shelters = useMemo(() => {
    const activatedIds = dispatched.flatMap((a) =>
      a.proposedActions
        .filter((p) => p.type === 'activate_shelter')
        .map((p) => String(p.params.shelterId ?? '')),
    );
    return withActivatedShelters(SHELTERS, activatedIds);
  }, [dispatched]);

  // Zones with an approved drone dispatch → draw a flight path from the base.
  const dronePaths = useMemo(() => {
    const zoneIds = dispatched.flatMap((a) =>
      a.proposedActions
        .filter((p) => p.type === 'dispatch_drone')
        .map((p) => String(p.params.zoneId ?? a.zoneId)),
    );
    const features = zoneIds.flatMap(
      (zoneId) =>
        dronePathToGeoJSON(
          DRONE_BASE,
          ZONES.find((z) => z.id === zoneId),
        ).features,
    );
    return { type: 'FeatureCollection' as const, features };
  }, [dispatched]);

  const geo = useMemo(() => {
    const closedRoadIds = analyze(events, ZONES, { shelters: SHELTERS }).flatMap(
      (r) => r.closedAccessRoadIds,
    );
    const relatedFeatures = alerts.flatMap(
      (a) => relatedEventLinesToGeoJSON(a.relatedEventIds, events).features,
    );
    return {
      zones: outageZonesToGeoJSON(ZONES, events),
      roads: closedRoadsToGeoJSON(ROADS, closedRoadIds),
      related: { type: 'FeatureCollection' as const, features: relatedFeatures },
    };
  }, [events, alerts]);

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
        initialViewState={{
          latitude: HOUSTON_CENTER.lat,
          longitude: HOUSTON_CENTER.lon,
          zoom: 11.5,
        }}
        mapStyle={mapStyle}
        style={{ position: 'absolute', inset: 0 }}
        attributionControl={{ compact: true }}
        onError={(e) => setMapError(e.error?.message ?? 'Unknown map error')}
      >
        <Source id="zones" type="geojson" data={geo.zones}>
          <Layer
            id="zones-fill"
            type="fill"
            paint={{ 'fill-color': '#ef4444', 'fill-opacity': 0.25 }}
          />
          <Layer
            id="zones-outline"
            type="line"
            paint={{ 'line-color': '#ef4444', 'line-width': 2 }}
          />
        </Source>

        <Source id="closures" type="geojson" data={geo.roads}>
          <Layer
            id="closures-line"
            type="line"
            paint={{ 'line-color': '#facc15', 'line-width': 5 }}
          />
        </Source>

        {/* Dashed lines linking an alert's related events (outage → closure → …). */}
        <Source id="related" type="geojson" data={geo.related}>
          <Layer
            id="related-line"
            type="line"
            paint={{
              'line-color': '#38bdf8',
              'line-width': 2,
              'line-dasharray': [2, 2],
              'line-opacity': 0.85,
            }}
          />
        </Source>

        {/* Drone flight path, shown only after a dispatch_drone action is approved. */}
        <Source id="drone-path" type="geojson" data={dronePaths}>
          <Layer
            id="drone-path-line"
            type="line"
            paint={{
              'line-color': '#a855f7',
              'line-width': 2,
              'line-dasharray': [1, 2],
            }}
          />
        </Source>

        {dronePaths.features.map((f) => {
          const [lon, lat] = f.geometry.coordinates[f.geometry.coordinates.length - 1] ?? [0, 0];
          return (
            <Marker key={f.properties.zoneId} latitude={lat} longitude={lon} anchor="center">
              <span
                className="drone-marker"
                role="img"
                aria-label={`Recon drone en route to ${f.properties.zoneId}`}
              >
                🛩️
              </span>
            </Marker>
          );
        })}

        {shelters.map((s) => (
          <Marker key={s.id} latitude={s.lat} longitude={s.lon} anchor="bottom">
            <div
              className={`shelter-pin shelter-pin--${s.status}`}
              role="img"
              aria-label={`${s.name}, capacity ${s.capacity}, ${s.status}`}
            >
              <Building2 aria-hidden="true" size={14} />
              <span>
                {s.name} · {s.capacity} beds · {s.status}
              </span>
            </div>
          </Marker>
        ))}

        {events.map((e) => (
          <Marker key={e.id} latitude={e.lat} longitude={e.lon} anchor="center">
            <button
              type="button"
              className={`event-pin event-pin--${e.severity}`}
              aria-label={`${e.severity} ${e.type} event: ${e.description}`}
              title={`${e.severity.toUpperCase()} · ${e.description}`}
              onClick={() => selectEvent(e.id)}
            />
          </Marker>
        ))}
      </Map>

      {mapError && (
        <p
          role="alert"
          className="absolute left-3 top-3 max-w-md rounded border border-amber-500 bg-slate-900/90 px-3 py-2 font-mono text-xs text-amber-200"
        >
          Basemap problem: {mapError}
        </p>
      )}
      <MapLegend />
    </div>
  );
}
