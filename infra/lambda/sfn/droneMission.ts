/**
 * Step Functions branch: create a drone mission request record.
 */
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { AlertCardData } from '@gridrisk/shared';
import { ddb, ALERTS_TABLE } from '../shared/ddb';

interface Input {
  alertId: string;
}

export async function handler(input: Input): Promise<{
  requests: Array<{ requestId: string; zoneId: string; status: string; createdAt: string }>;
}> {
  const table = ALERTS_TABLE();
  const res = await ddb.send(new GetCommand({ TableName: table, Key: { id: input.alertId } }));
  const alert = res.Item as AlertCardData | undefined;
  if (!alert) throw new Error(`Alert not found: ${input.alertId}`);

  const requests = [];
  const droneActions = alert.proposedActions.filter((a) => a.type === 'dispatch_drone');

  for (const action of droneActions) {
    const requestId = `drone-request#${input.alertId}#${action.id}`;
    const createdAt = new Date().toISOString();
    let status = 'request_created';
    let externalRequestId: string | undefined;
    const endpoint = process.env.GRIDRISK_DRONE_ACTION_URL;
    if (endpoint) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
        body: JSON.stringify({
          requestId,
          alertId: input.alertId,
          zoneId: alert.zoneId,
          params: action.params,
        }),
      });
      if (!response.ok) throw new Error(`Drone integration failed: ${response.status}`);
      const payload = (await response.json()) as { requestId?: string; status?: string };
      externalRequestId = payload.requestId;
      status = payload.status ?? 'submitted';
    }
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: {
          id: requestId,
          kind: 'drone_mission',
          requestId,
          alertId: input.alertId,
          zoneId: alert.zoneId,
          status,
          ...(externalRequestId ? { externalRequestId } : {}),
          createdAt,
          params: action.params,
        },
        ConditionExpression: 'attribute_not_exists(id)',
      }),
    );
    requests.push({ requestId, zoneId: alert.zoneId, status, createdAt });
  }

  return { requests };
}
