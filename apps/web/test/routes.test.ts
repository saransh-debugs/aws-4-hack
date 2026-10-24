import { describe, expect, it, vi } from 'vitest';
import { BRIDGE_ROAD } from '@gridrisk/shared/fixtures';
import {
  buildRoutesBody,
  fetchEvacuationRoute,
  parseRoutesResponse,
  ROUTES_ENDPOINT,
} from '../src/map/routes';

const REQ = {
  origin: [-95.365, 29.7575] as [number, number],
  destination: [-95.4107, 29.6847] as [number, number],
  avoid: [BRIDGE_ROAD.line],
};

describe('evacuation routes (Amazon Location Routes v2)', () => {
  it('asks for a car route that avoids a corridor around each closed road', () => {
    expect(buildRoutesBody(REQ)).toEqual({
      Origin: REQ.origin,
      Destination: REQ.destination,
      TravelMode: 'Car',
      LegGeometryFormat: 'Simple',
      DepartNow: true,
      Avoid: {
        Areas: [
          { Geometry: { Corridor: { LineString: BRIDGE_ROAD.line.coordinates, Radius: 40 } } },
        ],
      },
    });
    expect(buildRoutesBody({ ...REQ, avoid: [] })).not.toHaveProperty('Avoid');
  });

  it('joins the legs of the first route', () => {
    const r = parseRoutesResponse({
      Routes: [
        {
          Legs: [
            {
              Geometry: {
                LineString: [
                  [1, 2],
                  [3, 4],
                ],
              },
            },
            { Geometry: { LineString: [[5, 6]] } },
          ],
          Summary: { Distance: 13200, Duration: 1080 },
        },
      ],
    });
    expect(r).toEqual({
      coordinates: [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      distanceMeters: 13200,
      durationSeconds: 1080,
    });
  });

  it('returns null for no route', () => {
    expect(parseRoutesResponse({ Routes: [] })).toBeNull();
    expect(parseRoutesResponse(null)).toBeNull();
  });

  it('POSTs to the Routes endpoint with the key, and returns null on an error status', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 403 }));
    expect(await fetchEvacuationRoute('k y', REQ, fetchImpl as typeof fetch)).toBeNull();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${ROUTES_ENDPOINT}?key=k%20y`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body)).TravelMode).toBe('Car');
  });
});
