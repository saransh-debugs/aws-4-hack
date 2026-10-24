/**
 * HTML markers for the map. HTML (not symbol layers) so they work on every basemap, including
 * the offline style, which has no glyphs or sprites.
 */
import { Building2, CloudRain, Construction, Plane, Zap, type LucideIcon } from 'lucide-react';
import type { DemoEvent, EventType, Shelter } from '@gridrisk/shared';
import type { ZoneStatus } from './geo';

const TYPE: Record<EventType, { icon: LucideIcon; label: string }> = {
  outage: { icon: Zap, label: 'Outage' },
  road_closure: { icon: Construction, label: 'Road closure' },
  weather: { icon: CloudRain, label: 'Weather' },
};

/** A round pin colored by event type, sized and ringed by severity. */
export function EventPin({
  event,
  selected,
  onSelect,
}: {
  event: DemoEvent;
  selected: boolean;
  onSelect: () => void;
}) {
  const { icon: Icon, label } = TYPE[event.type];
  return (
    <button
      type="button"
      className={`map-pin map-pin--${event.type} map-pin--${event.severity}${selected ? ' map-pin--selected' : ''}`}
      aria-label={`${event.severity} ${label.toLowerCase()}: ${event.description}`}
      aria-pressed={selected}
      title={`${event.severity.toUpperCase()} · ${event.description}`}
      onClick={onSelect}
    >
      <Icon aria-hidden="true" strokeWidth={2.5} />
    </button>
  );
}

const ZONE_STATUS_TEXT: Record<ZoneStatus, string> = {
  monitored: 'Normal',
  outage: 'Power out',
  isolated: 'Cut off',
};

/** Zone name chip with its status and, when it matters, the patients at risk. */
export function ZoneLabel({
  name,
  status,
  patients,
}: {
  name: string;
  status: ZoneStatus;
  patients?: number;
}) {
  return (
    <div
      className={`zone-label zone-label--${status}`}
      role="img"
      aria-label={`${name}: ${ZONE_STATUS_TEXT[status]}`}
    >
      <span className="zone-label__name">{name}</span>
      <span className="zone-label__status">{ZONE_STATUS_TEXT[status]}</span>
      {status !== 'monitored' && patients !== undefined && (
        <span className="zone-label__patients">{patients} patients</span>
      )}
    </div>
  );
}

export function ShelterPin({ shelter }: { shelter: Shelter }) {
  return (
    <div
      className={`shelter-pin shelter-pin--${shelter.status}`}
      role="img"
      aria-label={`${shelter.name}, capacity ${shelter.capacity}, ${shelter.status}`}
    >
      <Building2 aria-hidden="true" size={14} />
      <span>
        {shelter.name} · {shelter.capacity} beds ·{' '}
        {shelter.status === 'active' ? 'OPEN' : 'standby'}
      </span>
    </div>
  );
}

export function DroneMarker({ zoneName, arrived }: { zoneName: string; arrived: boolean }) {
  return (
    <span
      className={`drone-marker${arrived ? ' drone-marker--arrived' : ''}`}
      role="img"
      aria-label={arrived ? `Recon drone over ${zoneName}` : `Recon drone en route to ${zoneName}`}
    >
      <Plane aria-hidden="true" size={16} strokeWidth={2.5} />
    </span>
  );
}
