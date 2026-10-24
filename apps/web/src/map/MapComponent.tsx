import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2 } from 'lucide-react';
import Map, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import './workerSetup';
import { analyze } from '@gridrisk/engine';
import { HOUSTON_CENTER } from '@gridrisk/shared/fixtures';
import { useGridStore } from '../store';
import { closedRoadsToGeoJSON, outageZonesToGeoJSON, resolveMapStyle } from './geo';
import { MapLegend } from './MapLegend';

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Houston map: events, the outage zone (red), closed road (yellow) and shelters.
 * Selecting an event in the store (feed click) flies the map to it.
 */
export default function MapComponent() {
  const events = useGridStore((s) => s.events);
  const zones = useGridStore((s) => s.zones);
  const roads = useGridStore((s) => s.roads);
  const shelters = useGridStore((s) => s.shelters);
  const selectedEventId = useGridStore((s) => s.selectedEventId);
  const selectEvent = useGridStore((s) => s.selectEvent);
  const mapRef = useRef<MapRef>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const mapStyle = useMemo(() => resolveMapStyle(import.meta.env.VITE_LOCATION_API_KEY), []);

  const geo = useMemo(() => {
    const closedRoadIds = analyze(events, zones, { shelters }).flatMap(
      (r) => r.closedAccessRoadIds,
    );
    return {
      zones: outageZonesToGeoJSON(zones, events),
      roads: closedRoadsToGeoJSON(roads, closedRoadIds),
    };
  }, [events, roads, shelters, zones]);

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
