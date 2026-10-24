import type { DemoEvent, Severity } from '@gridrisk/shared';
import { centroid } from '@turf/turf';

export const NWS_ALERTS_URL = 'https://api.weather.gov/alerts/active?zone=TXC201';

type NwsFeature = {
  id?: string;
  geometry?: GeoJSON.Geometry | null;
  properties?: {
    id?: string;
    event?: string;
    headline?: string;
    description?: string;
    severity?: string;
    effective?: string;
    sent?: string;
  };
};

type NwsCollection = { features?: NwsFeature[] };

function severityOf(value: string | undefined): Severity {
  if (value === 'Extreme') return 'critical';
  if (value === 'Severe') return 'high';
  return 'low';
}

function featurePoint(feature: NwsFeature): [number, number] {
  if (!feature.geometry) return [-95.37, 29.76];
  const center = centroid(feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon);
  return center.geometry.coordinates as [number, number];
}

/** Convert a saved or fetched NWS GeoJSON response into the shared event contract. */
export function normalizeNwsAlerts(payload: NwsCollection): DemoEvent[] {
  return (payload.features ?? []).map((feature, index) => {
    const properties = feature.properties ?? {};
    const [lon, lat] = featurePoint(feature);
    return {
      id: feature.id ?? properties.id ?? `nws-alert-${index}`,
      type: 'weather',
      lat,
      lon,
      description: properties.headline ?? properties.description ?? properties.event ?? 'NWS alert',
      severity: severityOf(properties.severity),
      timestamp: properties.effective ?? properties.sent,
    };
  });
}

export async function fetchNwsAlerts(
  fetchImpl: typeof fetch = fetch,
  userAgent = 'GridRisk/0.0 (emergency-demo@example.com)',
): Promise<DemoEvent[]> {
  const response = await fetchImpl(NWS_ALERTS_URL, {
    headers: { Accept: 'application/geo+json', 'User-Agent': userAgent },
  });
  if (!response.ok) throw new Error(`NWS request failed: ${response.status}`);
  return normalizeNwsAlerts((await response.json()) as NwsCollection);
}
