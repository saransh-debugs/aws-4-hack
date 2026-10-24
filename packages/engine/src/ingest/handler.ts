import type { DemoEvent } from '@gridrisk/shared';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { fetchNwsAlerts } from '../sources/nws';

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

const dynamo = new DynamoDBClient({});

/** Deployable Lambda entrypoint; the infrastructure stack supplies the table name. */
export async function handler(): Promise<{ count: number }> {
  const tableName = process.env.GRIDRISK_EVENTS_TABLE ?? process.env.EVENTS_TABLE_NAME;
  if (!tableName) throw new Error('GRIDRISK_EVENTS_TABLE is required');
  return ingestNwsEvents({
    dynamo,
    tableName,
    putItemCommand: (input) => new PutItemCommand(input),
  });
}
