/**
 * Evacuation routes over real roads, from Amazon Location Routes v2 (CalculateRoutes), avoiding
 * the closed access roads. Called from the browser with the same referrer-restricted API key as
 * the map. If the call fails (offline, no key, no route), the caller draws a straight line.
 *
 * Pure request/response helpers are exported for tests; `fetchEvacuationRoute` does the call.
 */
import type { LineString } from '@gridrisk/shared';

export const ROUTES_ENDPOINT = 'https://routes.geo.us-east-1.amazonaws.com/v2/routes';

/** Metres either side of a closed road's centerline that the route must avoid. */
const AVOID_RADIUS_M = 40;

export interface RouteRequest {
  origin: [number, number];
  destination: [number, number];
  /** Closed roads to route around. */
  avoid: LineString[];
}

export function buildRoutesBody(req: RouteRequest): Record<string, unknown> {
  return {
    Origin: req.origin,
    Destination: req.destination,
    TravelMode: 'Car',
    LegGeometryFormat: 'Simple',
    // Reach the shelter now, with current traffic.
    DepartNow: true,
    ...(req.avoid.length > 0
      ? {
          Avoid: {
            Areas: req.avoid.map((line) => ({
              Geometry: { Corridor: { LineString: line.coordinates, Radius: AVOID_RADIUS_M } },
            })),
          },
        }
      : {}),
  };
}

export interface RouteResult {
  coordinates: [number, number][];
  distanceMeters?: number;
  durationSeconds?: number;
}

type RoutesResponse = {
  Routes?: Array<{
    Legs?: Array<{ Geometry?: { LineString?: number[][] } }>;
    Summary?: { Distance?: number; Duration?: number };
  }>;
};

/** The first route's leg geometries joined into one line, or null if there is no route. */
export function parseRoutesResponse(body: unknown): RouteResult | null {
  const route = (body as RoutesResponse)?.Routes?.[0];
  const coordinates = (route?.Legs ?? []).flatMap((leg) =>
    (leg.Geometry?.LineString ?? [])
      .filter((p) => p.length >= 2)
      .map((p) => [p[0]!, p[1]!] as [number, number]),
  );
  if (coordinates.length < 2) return null;
  return {
    coordinates,
    distanceMeters: route?.Summary?.Distance,
    durationSeconds: route?.Summary?.Duration,
  };
}

export async function fetchEvacuationRoute(
  apiKey: string,
  req: RouteRequest,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<RouteResult | null> {
  const res = await fetchImpl(`${ROUTES_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildRoutesBody(req)),
    signal,
  });
  if (!res.ok) return null;
  return parseRoutesResponse(await res.json());
}
