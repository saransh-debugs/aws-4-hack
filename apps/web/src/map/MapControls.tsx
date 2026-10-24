import { Car, Maximize2 } from 'lucide-react';
import { BASEMAPS, type Basemap } from './geo';

/** Top-right map controls: basemap switcher, live-traffic toggle and "fit to the situation". */
export function MapControls({
  basemap,
  onBasemap,
  traffic,
  onTraffic,
  onOverview,
  liveBasemap,
}: {
  basemap: Basemap;
  onBasemap: (b: Basemap) => void;
  traffic: boolean;
  onTraffic: (on: boolean) => void;
  onOverview: () => void;
  /** False with the offline style: the switcher and traffic need Amazon Location. */
  liveBasemap: boolean;
}) {
  return (
    <div className="map-controls" role="group" aria-label="Map controls">
      {liveBasemap && (
        <div className="map-controls__segmented" role="group" aria-label="Basemap">
          {BASEMAPS.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={basemap === b.id}
              onClick={() => onBasemap(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
      {liveBasemap && (
        <button
          type="button"
          className="map-controls__btn"
          aria-pressed={traffic}
          onClick={() => onTraffic(!traffic)}
          title="Live traffic from Amazon Location"
        >
          <Car aria-hidden="true" size={14} />
          Live traffic
        </button>
      )}
      <button type="button" className="map-controls__btn" onClick={onOverview}>
        <Maximize2 aria-hidden="true" size={14} />
        Overview
      </button>
    </div>
  );
}
