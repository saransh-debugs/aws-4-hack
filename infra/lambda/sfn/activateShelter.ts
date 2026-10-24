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

export async function handler(input: Input): Promise<{ activatedShelterIds: string[] }> {
  const table = ALERTS_TABLE();
  const res = await ddb.send(new GetCommand({ TableName: table, Key: { id: input.alertId } }));
  const alert = res.Item as AlertCardData | undefined;
  if (!alert) throw new Error(`Alert not found: ${input.alertId}`);

  const shelterIds = alert.proposedActions
    .filter((a) => a.type === 'activate_shelter')
    .map((a) => String((a.params as { shelterId?: unknown }).shelterId ?? ''))
    .filter(Boolean);

  for (const shelterId of shelterIds) {
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: {
          id: `shelter#${shelterId}`,
          kind: 'shelter_status',
          shelterId,
          status: 'activation_requested',
          activatedAt: new Date().toISOString(),
          alertId: input.alertId,
        },
      }),
    );
  }

  return { activatedShelterIds: shelterIds };
}
