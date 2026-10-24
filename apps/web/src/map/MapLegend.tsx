import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PALETTE } from './geo';

type Item = { label: string; swatch: React.CSSProperties; round?: boolean; line?: boolean };

const ITEMS: Item[] = [
  {
    label: 'Zone cut off',
    swatch: { background: `${PALETTE.isolated}40`, borderColor: PALETTE.isolated },
  },
  {
    label: 'Zone power out',
    swatch: { background: `${PALETTE.outage}40`, borderColor: PALETTE.outage },
  },
  {
    label: 'Zone monitored',
    swatch: { background: `${PALETTE.monitored}1f`, borderColor: PALETTE.monitored },
  },
  { label: 'Access road open', swatch: { background: PALETTE.roadOpen }, line: true },
  { label: 'Access road closed', swatch: { background: PALETTE.roadClosed }, line: true },
  {
    label: 'Storm cell',
    swatch: { background: `${PALETTE.weather}4d`, borderColor: PALETTE.weather },
    round: true,
  },
  { label: 'Outage', swatch: { background: PALETTE.outage }, round: true },
  { label: 'Road closure', swatch: { background: '#ea580c' }, round: true },
  { label: 'Weather', swatch: { background: PALETTE.weather }, round: true },
  { label: 'Shelter', swatch: { background: PALETTE.shelter } },
  { label: 'Evacuation route', swatch: { background: PALETTE.evacuation }, line: true },
  { label: 'Drone path', swatch: { background: PALETTE.drone }, line: true },
];

export function MapLegend() {
  const [open, setOpen] = useState(true);
  return (
    <div className="map-legend">
      <button
        type="button"
        className="map-legend__toggle"
        aria-expanded={open}
        aria-controls="map-legend-list"
        onClick={() => setOpen((o) => !o)}
      >
        Legend
        <ChevronDown aria-hidden="true" size={14} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <ul id="map-legend-list" aria-label="Map legend" className="map-legend__list">
          {ITEMS.map((i) => (
            <li key={i.label}>
              <span
                aria-hidden="true"
                className={`map-legend__swatch${i.round ? ' map-legend__swatch--round' : ''}${i.line ? ' map-legend__swatch--line' : ''}`}
                style={i.swatch}
              />
              {i.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
