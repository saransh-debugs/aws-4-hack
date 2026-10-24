/**
 * Step Functions task: MarkDispatched. Flips the alert to 'dispatched' and
 * clears the task token now that the execution is complete.
 */
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { AlertCardData } from '@gridrisk/shared';
import { ddb, ALERTS_TABLE } from '../shared/ddb';

interface Input {
  alertId: string;
}

export async function handler(input: Input): Promise<{ alert: AlertCardData }> {
  const res = await ddb.send(
    new UpdateCommand({
      TableName: ALERTS_TABLE(),
      Key: { id: input.alertId },
      UpdateExpression: 'SET #s = :dispatched REMOVE taskToken',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':dispatched': 'dispatched' },
      ReturnValues: 'ALL_NEW',
    }),
  );
  const { taskToken: _t, ...alert } = (res.Attributes ?? {}) as AlertCardData & {
    taskToken?: string;
  };
  return { alert };
}
