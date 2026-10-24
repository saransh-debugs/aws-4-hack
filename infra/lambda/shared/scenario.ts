/**
 * Shared scenario loader used by the /simulate handlers.
 * Replaces the entire events table with a fresh buildScenario(...) copy and clears the
 * alerts table (including per-zone debounce locks) so a new scenario can raise fresh alerts.
 */
import { BatchWriteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { DemoEvent, ScenarioName } from '@gridrisk/shared';
import { buildScenario } from '@gridrisk/engine';
import { ddb, ALERTS_TABLE, EVENTS_TABLE } from './ddb';

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Delete every item in a table (small demo tables only). */
async function clearTable(table: string): Promise<void> {
  const res = await ddb.send(new ScanCommand({ TableName: table, ProjectionExpression: 'id' }));
  const items = (res.Items ?? []) as { id: string }[];
  if (items.length === 0) return;
  for (const batch of chunk(items, 25)) {
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [table]: batch.map((it) => ({ DeleteRequest: { Key: { id: it.id } } })),
        },
      }),
    );
  }
}

async function putEvents(table: string, events: DemoEvent[]): Promise<void> {
  for (const batch of chunk(events, 25)) {
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [table]: batch.map((evt) => ({ PutRequest: { Item: evt } })),
        },
      }),
    );
  }
}

/**
 * Reset the events table to the given scenario and clear all alerts + zone locks;
 * returns the full current event list. reset === loadScenario('calm').
 */
export async function loadScenario(name: ScenarioName): Promise<DemoEvent[]> {
  const events = buildScenario(name);
  // Clear alerts (and debounce locks) first so a fresh scenario isn't blocked.
  await clearTable(ALERTS_TABLE());
  await clearTable(EVENTS_TABLE());
  await putEvents(EVENTS_TABLE(), events);
  return events;
}
