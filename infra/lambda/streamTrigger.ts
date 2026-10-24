/**
 * DynamoDB events-stream handler. Starts the approval state machine once per zone.
 *
 * Debounced: a zone is processed at most once while an alert is active. Because a burst
 * of escalation events arrives as several concurrent stream batches, a read-then-check
 * is racy (no alert exists yet when all batches run). Instead we atomically *claim* the
 * zone with a conditional write of a lock item; only the batch that wins the claim starts
 * an execution. The lock also covers an existing pending/dispatched alert, and is released
 * by POST /simulate/reset.
 */
import type { DynamoDBStreamEvent } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { ddb, ALERTS_TABLE, requireEnv } from './shared/ddb';

const sfn = new SFNClient({});

const lockId = (zoneId: string): string => `zone-lock#${zoneId}`;

/**
 * Try to claim a zone. Returns true if this invocation won the claim (and should start
 * the workflow), false if the zone is already claimed. Atomic via a conditional put.
 */
async function claimZone(zoneId: string): Promise<boolean> {
  try {
    await ddb.send(
      new PutCommand({
        TableName: ALERTS_TABLE(),
        Item: {
          id: lockId(zoneId),
          kind: 'zone_lock',
          zoneId,
          claimedAt: new Date().toISOString(),
        },
        ConditionExpression: 'attribute_not_exists(id)',
      }),
    );
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  const stateMachineArn = requireEnv('STATE_MACHINE_ARN');

  // Collect candidate zones from NEW_IMAGE records of zone-scoped events.
  const zones = new Set<string>();
  for (const record of event.Records) {
    if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') continue;
    const img = record.dynamodb?.NewImage;
    const zoneId = img?.zoneId?.S;
    if (zoneId) zones.add(zoneId);
  }

  for (const zoneId of zones) {
    const won = await claimZone(zoneId);
    if (!won) {
      console.log(`Skipping zone ${zoneId}: already claimed (active alert or in-flight)`);
      continue;
    }
    console.log(`Starting approval workflow for zone ${zoneId}`);
    await sfn.send(
      new StartExecutionCommand({
        stateMachineArn,
        input: JSON.stringify({ zoneId }),
      }),
    );
  }
}
