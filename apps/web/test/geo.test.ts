import { describe, expect, it } from 'vitest';
import { analyze, buildScenario } from '@gridrisk/engine';
import { ROADS, SHELTERS, ZONES, ZONE_A } from '@gridrisk/shared/fixtures';
import {
  accessRoadsToGeoJSON,
  circlePolygon,
  closedRoadsToGeoJSON,
  evacuationRoutesToGeoJSON,
  impactHeatToGeoJSON,
  overviewBounds,
  PALETTE,
  pointAlong,
  weatherCellsToGeoJSON,
  zoneLabelAnchor,
  zoneStatusesToGeoJSON,
  dronePathToGeoJSON,
  eventsToGeoJSON,
  gridToGeoJSON,
  locationStyleUrl,
  OFFLINE_STYLE,
  outageZonesToGeoJSON,
  polygonCentroid,
  relatedEventLinesToGeoJSON,
  resolveMapStyle,
  sheltersToGeoJSON,
  withActivatedShelters,
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

  it('defaults to the light Standard style with hillshade and live traffic', () => {
    expect(resolveMapStyle('abc')).toBe(locationStyleUrl('abc'));
    const url = new URL(locationStyleUrl('a b'));
    expect(url.origin + url.pathname).toBe(
      'https://maps.geo.us-east-1.amazonaws.com/v2/styles/Standard/descriptor',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      key: 'a b',
      'color-scheme': 'Light',
      terrain: 'Hillshade',
      'political-view': 'USA',
      traffic: 'All',
    });
  });

  it('satellite uses Hybrid (no color scheme), dark uses Standard Dark, traffic can be off', () => {
    const sat = new URL(locationStyleUrl('k', { basemap: 'satellite' }));
    expect(sat.pathname).toContain('/styles/Hybrid/');
    expect(sat.searchParams.has('color-scheme')).toBe(false);
    expect(sat.searchParams.get('traffic')).toBe('All');
    const dark = new URL(locationStyleUrl('k', { basemap: 'dark', traffic: false }));
    expect(dark.searchParams.get('color-scheme')).toBe('Dark');
    expect(dark.searchParams.has('traffic')).toBe(false);
  });

  it('the offline style is light too', () => {
    expect(OFFLINE_STYLE.layers[0]?.paint).toEqual({ 'background-color': '#eef2f6' });
  });
});

describe('zoneStatusesToGeoJSON', () => {
  const results = (name: Parameters<typeof buildScenario>[0]) =>
    analyze(buildScenario(name), ZONES, { shelters: SHELTERS });

  it('draws every zone: blue when calm', () => {
    const fc = zoneStatusesToGeoJSON(ZONES, results('calm'));
    expect(fc.features.map((f) => f.properties.status)).toEqual(['monitored', 'monitored']);
    expect(fc.features[0]?.properties.color).toBe(PALETTE.monitored);
  });

  it('amber for power out, red for cut off', () => {
    expect(
      zoneStatusesToGeoJSON(ZONES, results('partial')).features.map((f) => f.properties.status),
    ).toEqual(['outage', 'monitored']);
    expect(
      zoneStatusesToGeoJSON(ZONES, results('multi-zone')).features.map((f) => f.properties.color),
    ).toEqual([PALETTE.isolated, PALETTE.isolated]);
  });
});

describe('accessRoadsToGeoJSON', () => {
  it('shows every access road, green when open and red when closed', () => {
    const fc = accessRoadsToGeoJSON(ROADS, ZONES, ['road-bridge-1']);
    expect(fc.features.map((f) => [f.properties.id, f.properties.status])).toEqual([
      ['road-bridge-1', 'closed'],
      ['road-zone-b-1', 'open'],
    ]);
    expect(fc.features[1]?.properties.color).toBe(PALETTE.roadOpen);
  });
});

describe('weather and heat', () => {
  it('turns weather events into closed circles, bigger for warnings', () => {
    const fc = weatherCellsToGeoJSON(buildScenario('storm'));
    expect(fc.features.length).toBe(4);
    const ring = fc.features[0]!.geometry.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const span = (i: number) => {
      const r = fc.features[i]!.geometry.coordinates[0]!.map((c) => c[1]);
      return Math.max(...r) - Math.min(...r);
    };
    const low = fc.features.findIndex((f) => f.properties.severity === 'low');
    const high = fc.features.findIndex((f) => f.properties.severity === 'high');
    expect(span(high)).toBeGreaterThan(span(low));
  });

  it('weights non-weather events by severity for the heatmap', () => {
    const fc = impactHeatToGeoJSON(buildScenario('escalation'));
    expect(fc.features.every((f) => f.properties.weight > 0)).toBe(true);
    expect(Math.max(...fc.features.map((f) => f.properties.weight))).toBe(1);
  });

  it('circlePolygon is about the right size (1 km ≈ 0.009° of latitude)', () => {
    const lats = circlePolygon({ lat: 29.76, lon: -95.37 }, 1).coordinates[0]!.map((c) => c[1]);
    expect(Math.max(...lats) - 29.76).toBeCloseTo(0.00904, 4);
  });
});

describe('overviewBounds and pointAlong', () => {
  it('contains every zone and the shelter', () => {
    const [[w, s], [e, n]] = overviewBounds(ZONES, SHELTERS, 0);
    expect(w).toBeLessThanOrEqual(SHELTERS[0]!.lon);
    expect(s).toBeLessThanOrEqual(SHELTERS[0]!.lat);
    expect(e).toBeGreaterThanOrEqual(-95.32);
    expect(n).toBeGreaterThanOrEqual(29.77);
  });

  it('interpolates by distance along a polyline', () => {
    const line: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
    ];
    expect(pointAlong(line, 0)).toEqual([0, 0]);
    expect(pointAlong(line, 0.25)).toEqual([1, 0]);
    expect(pointAlong(line, 0.75)).toEqual([2, 1]);
    expect(pointAlong(line, 1)).toEqual([2, 2]);
  });

  it('zone labels sit on the north edge, centered', () => {
    expect(zoneLabelAnchor(ZONE_A.polygon)).toEqual([-95.365, 29.77]);
  });

  it('evacuation routes start at the zone centroid and end at the shelter', () => {
    const fc = evacuationRoutesToGeoJSON([{ zone: ZONE_A, shelter: SHELTERS[0]! }]);
    expect(fc.features[0]?.geometry.coordinates).toEqual([
      polygonCentroid(ZONE_A.polygon),
      [SHELTERS[0]!.lon, SHELTERS[0]!.lat],
    ]);
  });
});

describe('polygonCentroid', () => {
  it('averages the outer ring without double-counting the closing vertex', () => {
    const [lon, lat] = polygonCentroid(ZONE_A.polygon);
    // Zone A spans lon [-95.38, -95.35], lat [29.745, 29.77].
    expect(lon).toBeCloseTo(-95.365, 3);
    expect(lat).toBeCloseTo(29.7575, 3);
  });
});

describe('relatedEventLinesToGeoJSON', () => {
  it('links events in the given order (outage → closure)', () => {
    const events = buildScenario('escalation');
    const fc = relatedEventLinesToGeoJSON(['evt-outage-a', 'evt-closure-bridge'], events);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]?.geometry.coordinates).toEqual([
      [-95.365, 29.7575],
      [-95.38, 29.7632],
    ]);
  });

  it('is empty when fewer than two ids resolve', () => {
    const events = buildScenario('escalation');
    expect(relatedEventLinesToGeoJSON([], events).features).toHaveLength(0);
    expect(relatedEventLinesToGeoJSON(['evt-outage-a', 'missing'], events).features).toHaveLength(
      0,
    );
  });
});

describe('dronePathToGeoJSON', () => {
  it('draws a line from the base to the zone centroid', () => {
    const base = { lat: 29.6847, lon: -95.4107 };
    const fc = dronePathToGeoJSON(base, ZONE_A);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]?.geometry.coordinates[0]).toEqual([-95.4107, 29.6847]);
    expect(fc.features[0]?.properties.zoneId).toBe('zone-a');
  });

  it('is empty without a zone', () => {
    expect(dronePathToGeoJSON({ lat: 0, lon: 0 }, undefined).features).toHaveLength(0);
  });
});

describe('withActivatedShelters', () => {
  it('flips only the named shelters to active', () => {
    const flipped = withActivatedShelters(SHELTERS, ['shelter-b']);
    expect(flipped.find((s) => s.id === 'shelter-b')?.status).toBe('active');
    // Original fixtures are untouched.
    expect(SHELTERS.find((s) => s.id === 'shelter-b')?.status).toBe('standby');
  });

  it('leaves others unchanged', () => {
    const same = withActivatedShelters(SHELTERS, []);
    expect(same.map((s) => s.status)).toEqual(SHELTERS.map((s) => s.status));
  });
});
