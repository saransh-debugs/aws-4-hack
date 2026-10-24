/**
 * Step Functions task: SaveAlert.
 * Persists the proposed alert (status 'pending') together with the WaitForApproval
 * task token, so POST /alerts/{id}/approve can resume the execution later.
 *
 * Invoked with .waitForTaskToken, so it receives { alert, taskToken }.
 */
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { AlertCardData } from '@gridrisk/shared';
import { ddb, ALERTS_TABLE } from '../shared/ddb';

interface Input {
  alert: AlertCardData;
  taskToken: string;
}

export async function handler(input: Input): Promise<{ alertId: string }> {
  const record = { ...input.alert, status: 'pending' as const, taskToken: input.taskToken };
  await ddb.send(new PutCommand({ TableName: ALERTS_TABLE(), Item: record }));
  return { alertId: input.alert.id };
}
