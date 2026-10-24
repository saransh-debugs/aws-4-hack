import { describe, expect, it } from 'vitest';
import { buildScenario } from '@gridrisk/engine';
import { ROADS, SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import {
  closedRoadsToGeoJSON,
  eventsToGeoJSON,
  gridToGeoJSON,
  locationStyleUrl,
  OFFLINE_STYLE,
  outageZonesToGeoJSON,
  resolveMapStyle,
  sheltersToGeoJSON,
} from '../src/map/geo';

describe('eventsToGeoJSON', () => {
  it('uses [lon, lat] order and keeps the properties the map styles on', () => {
    const events = buildScenario('escalation');
    const fc = eventsToGeoJSON(events);
    expect(fc.features).toHaveLength(events.length);
    const outage = fc.features.find((f) => f.properties.id === 'evt-outage-a');
    expect(outage?.geometry.coordinates).toEqual([-95.365, 29.7575]);
    expect(outage?.properties).toMatchObject({ type: 'outage', severity: 'critical' });
  });
});

describe('outageZonesToGeoJSON', () => {
  it('is empty when calm and has the zone polygon after escalation', () => {
    expect(outageZonesToGeoJSON(ZONES, buildScenario('calm')).features).toHaveLength(0);
    const fc = outageZonesToGeoJSON(ZONES, buildScenario('escalation'));
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]?.geometry).toEqual(ZONES[0]?.polygon);
  });
});

describe('closedRoadsToGeoJSON', () => {
  it('only includes closed roads', () => {
    expect(closedRoadsToGeoJSON(ROADS, []).features).toHaveLength(0);
    const fc = closedRoadsToGeoJSON(ROADS, ['road-bridge-1', 'unknown']);
    expect(fc.features.map((f) => f.properties.id)).toEqual(['road-bridge-1']);
  });
});

describe('sheltersToGeoJSON', () => {
  it('carries the status so dispatched shelters can turn green', () => {
    const fc = sheltersToGeoJSON(SHELTERS);
    expect(fc.features[0]?.properties).toEqual({
      id: 'shelter-b',
      name: 'Shelter B',
      status: 'standby',
    });
  });
});

describe('gridToGeoJSON', () => {
  it('makes one horizontal and one vertical line per step', () => {
    const fc = gridToGeoJSON({ lat: 10, lon: 20 }, 0.2, 0.1);
    expect(fc.features).toHaveLength(10); // 5 offsets x 2 directions
    expect(fc.features[0]?.geometry.coordinates).toEqual([
      [19.8, 9.8],
      [20.2, 9.8],
    ]);
  });
});

describe('map style', () => {
  it('uses the bundled offline style without a key', () => {
    expect(resolveMapStyle(undefined)).toBe(OFFLINE_STYLE);
    expect(resolveMapStyle('')).toBe(OFFLINE_STYLE);
  });

  it('uses the Amazon Location dark Monochrome style with a key', () => {
    expect(resolveMapStyle('abc')).toBe(locationStyleUrl('abc'));
    expect(locationStyleUrl('a b')).toBe(
      'https://maps.geo.us-east-1.amazonaws.com/v2/styles/Monochrome/descriptor?key=a%20b&color-scheme=Dark',
    );
  });
});
