/**
 * Step Functions task: RunAgent.
 * Reads the current events, runs the agent for the zone, and returns the proposed alert.
 * The stub agent in @gridrisk/agent is fine here (Task 14 swaps in the real model).
 *
 * Output shape consumed by the state machine:
 *   { zoneId, raised: boolean, alert?: AlertCardData }
 */
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { AlertCardData, DemoEvent } from '@gridrisk/shared';
import { runAgent } from '@gridrisk/agent';
import { ddb, EVENTS_TABLE } from '../shared/ddb';

interface Input {
  zoneId: string;
}

interface Output {
  zoneId: string;
  raised: boolean;
  alert?: AlertCardData;
}

export async function handler(input: Input): Promise<Output> {
  const res = await ddb.send(new ScanCommand({ TableName: EVENTS_TABLE() }));
  const events = (res.Items ?? []) as DemoEvent[];

  const alert = await runAgent({ zoneId: input.zoneId, events });
  if (!alert) return { zoneId: input.zoneId, raised: false };

  return { zoneId: input.zoneId, raised: true, alert };
}
