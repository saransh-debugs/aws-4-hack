import type { DemoEvent } from '@gridrisk/shared';
import type { Shelter } from '@gridrisk/shared';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import {
  fetchCenterPointOutages,
  fetchDriveTexasConditions,
  fetchFemaOpenShelters,
  buildSyntheticUtilityOutage,
} from '../sources/operational';
import { fetchEmpower } from '../sources/empower';
import { fetchNwsAlerts } from '../sources/nws';
import { ZONE_A } from '@gridrisk/shared/fixtures';

/** Small seam around the AWS SDK, so the ingest logic can be tested without AWS credentials. */
export interface DynamoPutClient {
  send(command: unknown): Promise<unknown>;
}

export interface PutItemCommandFactory {
  (input: { TableName: string; Item: Record<string, { S: string }> }): unknown;
}

export interface IngestDependencies {
  fetchEvents?: () => Promise<DemoEvent[]>;
  dynamo: DynamoPutClient;
  putItemCommand: PutItemCommandFactory;
  tableName: string;
  log?: (message: string, details?: unknown) => void;
}

export interface ShelterIngestDependencies {
  fetchShelters: () => Promise<Shelter[]>;
  dynamo: DynamoPutClient;
  putItemCommand: PutItemCommandFactory;
  tableName: string;
  log?: (message: string, details?: unknown) => void;
}

function itemFor(event: DemoEvent): Record<string, { S: string }> {
  return {
    id: { S: event.id },
    type: { S: event.type },
    lat: { S: String(event.lat) },
    lon: { S: String(event.lon) },
    description: { S: event.description },
    severity: { S: event.severity },
    ...(event.zoneId ? { zoneId: { S: event.zoneId } } : {}),
    ...(event.timestamp ? { timestamp: { S: event.timestamp } } : {}),
  };
}

function shelterItemFor(shelter: Shelter): Record<string, { S: string }> {
  return {
    id: { S: shelter.id },
    name: { S: shelter.name },
    lat: { S: String(shelter.lat) },
    lon: { S: String(shelter.lon) },
    capacity: { S: String(shelter.capacity) },
    status: { S: shelter.status },
  };
}

function snapshotItemFor(
  source: string,
  payload: unknown,
  generatedAt: string,
): Record<string, { S: string }> {
  return {
    id: { S: source },
    generatedAt: { S: generatedAt },
    payload: { S: JSON.stringify(payload) },
  };
}

/** Fetch NWS events and idempotently upsert them by their stable event id. */
export async function ingestNwsEvents(deps: IngestDependencies): Promise<{ count: number }> {
  const fetchEvents = deps.fetchEvents ?? fetchNwsAlerts;
  let events: DemoEvent[];
  try {
    events = await fetchEvents();
  } catch (error) {
    deps.log?.('NWS ingest failed; retaining existing events.', error);
    return { count: 0 };
  }

  for (const event of events) {
    await deps.dynamo.send(
      deps.putItemCommand({ TableName: deps.tableName, Item: itemFor(event) }),
    );
  }
  deps.log?.(`NWS ingest upserted ${events.length} events.`);
  return { count: events.length };
}

/** Lambda-compatible entrypoint factory; Darsh's infra supplies the AWS SDK client/command. */
export function createIngestHandler(deps: IngestDependencies): () => Promise<{ count: number }> {
  return () => ingestNwsEvents(deps);
}

export async function ingestShelters(deps: ShelterIngestDependencies): Promise<{ count: number }> {
  try {
    const shelters = await deps.fetchShelters();
    for (const shelter of shelters) {
      await deps.dynamo.send(
        deps.putItemCommand({ TableName: deps.tableName, Item: shelterItemFor(shelter) }),
      );
    }
    deps.log?.(`Shelter ingest upserted ${shelters.length} shelters.`);
    return { count: shelters.length };
  } catch (error) {
    deps.log?.('Shelter ingest failed; retaining existing shelters.', error);
    return { count: 0 };
  }
}

const dynamo = new DynamoDBClient({});

/** Deployable Lambda entrypoint; the infrastructure stack supplies the table name. */
export async function handler(): Promise<{ count: number }> {
  const eventsTableName = process.env.GRIDRISK_EVENTS_TABLE ?? process.env.EVENTS_TABLE_NAME;
  const sheltersTableName = process.env.GRIDRISK_SHELTERS_TABLE;
  const snapshotsTableName = process.env.GRIDRISK_SNAPSHOTS_TABLE;
  if (!eventsTableName) throw new Error('GRIDRISK_EVENTS_TABLE is required');
  const events: DemoEvent[] = [];
  try {
    events.push(...(await fetchNwsAlerts()));
  } catch (error) {
    console.error('NWS ingest failed; retaining existing events.', error);
  }
  if (process.env.DRIVETEXAS_API_KEY) {
    try {
      events.push(...(await fetchDriveTexasConditions(process.env.DRIVETEXAS_API_KEY)));
    } catch (error) {
      console.error('DriveTexas ingest failed; retaining existing events.', error);
    }
  }
  try {
    events.push(
      ...(await fetchCenterPointOutages(process.env.GRIDRISK_CENTERPOINT_OUTAGES_URL || undefined)),
    );
  } catch (error) {
    console.error('CenterPoint outage ingest failed; retaining existing events.', error);
  }
  if (process.env.GRIDRISK_ALLOW_SYNTHETIC_UTILITY === 'true') {
    events.push(buildSyntheticUtilityOutage(process.env.GRIDRISK_SYNTHETIC_ZONE_ID ?? 'zone-a'));
  }
  const result = await ingestNwsEvents({
    fetchEvents: async () => events,
    dynamo,
    tableName: eventsTableName,
    putItemCommand: (input) => new PutItemCommand(input),
  });
  if (sheltersTableName) {
    await ingestShelters({
      fetchShelters: fetchFemaOpenShelters,
      dynamo,
      tableName: sheltersTableName,
      putItemCommand: (input) => new PutItemCommand(input),
    });
  }
  if (snapshotsTableName) {
    try {
      const empower = await fetchEmpower(ZONE_A.zips);
      await dynamo.send(
        new PutItemCommand({
          TableName: snapshotsTableName,
          Item: snapshotItemFor('empower', empower, new Date().toISOString()),
        }),
      );
    } catch (error) {
      console.error('emPOWER snapshot refresh failed; retaining existing snapshot.', error);
    }
  }
  return result;
}
