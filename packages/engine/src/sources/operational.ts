import type { DemoEvent, Shelter } from '@gridrisk/shared';
import { DemoEventSchema, ShelterSchema } from '@gridrisk/shared';

export type OperationalEventType = 'outage' | 'road_closure' | '911';

export interface OperationalFeedConfig {
  name: string;
  url: string;
  type: OperationalEventType;
  userAgent?: string;
}

type FeedPayload = { events?: unknown[] } | unknown[];

/** Normalize an approved operational feed without assuming a provider-specific schema. */
export function normalizeOperationalEvents(
  payload: FeedPayload,
  type: OperationalEventType,
): DemoEvent[] {
  const rows = Array.isArray(payload) ? payload : (payload.events ?? []);
  return rows.flatMap((row) => {
    const parsed = DemoEventSchema.safeParse({ ...(row as object), type });
    return parsed.success ? [parsed.data] : [];
  });
}

export async function fetchOperationalEvents(
  config: OperationalFeedConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<DemoEvent[]> {
  const response = await fetchImpl(config.url, {
    headers: {
      Accept: 'application/json',
      ...(config.userAgent ? { 'User-Agent': config.userAgent } : {}),
    },
  });
  if (!response.ok) throw new Error(`${config.name} request failed: ${response.status}`);
  return normalizeOperationalEvents((await response.json()) as FeedPayload, config.type);
}

export async function fetchShelters(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Shelter[]> {
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Shelter request failed: ${response.status}`);
  const rows = (await response.json()) as unknown;
  const values = Array.isArray(rows) ? rows : ((rows as { shelters?: unknown[] }).shelters ?? []);
  return values.flatMap((row) => {
    const parsed = ShelterSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}
