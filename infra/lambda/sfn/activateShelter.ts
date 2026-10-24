/**
 * Step Functions branch: record a shelter activation request.
 * This does not change a shelter-management system; it creates an auditable request
 * until a real shelter provider integration is configured.
 */
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { AlertCardData } from '@gridrisk/shared';
import { ddb, ALERTS_TABLE } from '../shared/ddb';

interface Input {
  alertId: string;
}

export async function handler(input: Input): Promise<{
  requests: Array<{ requestId: string; shelterId: string; status: string; createdAt: string }>;
}> {
  const table = ALERTS_TABLE();
  const res = await ddb.send(new GetCommand({ TableName: table, Key: { id: input.alertId } }));
  const alert = res.Item as AlertCardData | undefined;
  if (!alert) throw new Error(`Alert not found: ${input.alertId}`);

  const shelterIds = alert.proposedActions
    .filter((a) => a.type === 'activate_shelter')
    .map((a) => String((a.params as { shelterId?: unknown }).shelterId ?? ''))
    .filter(Boolean);

  const requests = [];
  for (const shelterId of shelterIds) {
    const createdAt = new Date().toISOString();
    const requestId = `shelter-request#${input.alertId}#${shelterId}`;
    let status = 'request_created';
    let externalRequestId: string | undefined;
    const endpoint = process.env.GRIDRISK_SHELTER_ACTION_URL;
    if (endpoint) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
        body: JSON.stringify({ requestId, alertId: input.alertId, shelterId }),
      });
      if (!response.ok) throw new Error(`Shelter integration failed: ${response.status}`);
      const payload = (await response.json()) as { requestId?: string; status?: string };
      externalRequestId = payload.requestId;
      status = payload.status ?? 'submitted';
    }
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: {
          id: requestId,
          kind: 'shelter_status',
          requestId,
          shelterId,
          status,
          ...(externalRequestId ? { externalRequestId } : {}),
          createdAt,
          alertId: input.alertId,
        },
        ConditionExpression: 'attribute_not_exists(id)',
      }),
    );
    requests.push({ requestId, shelterId, status, createdAt });
  }

  return { requests };
}
