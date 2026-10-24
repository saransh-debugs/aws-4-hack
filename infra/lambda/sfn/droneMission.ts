/**
 * Step Functions branch: create a drone mission request record.
 */
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { AlertCardData } from '@gridrisk/shared';
import { ddb, ALERTS_TABLE } from '../shared/ddb';

interface Input {
  alertId: string;
}

export async function handler(input: Input): Promise<{ missionIds: string[] }> {
  const table = ALERTS_TABLE();
  const res = await ddb.send(new GetCommand({ TableName: table, Key: { id: input.alertId } }));
  const alert = res.Item as AlertCardData | undefined;
  if (!alert) throw new Error(`Alert not found: ${input.alertId}`);

  const missionIds: string[] = [];
  const droneActions = alert.proposedActions.filter((a) => a.type === 'dispatch_drone');

  for (const action of droneActions) {
    const missionId = `mission#${input.alertId}#${action.id}`;
    missionIds.push(missionId);
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: {
          id: missionId,
          kind: 'drone_mission',
          alertId: input.alertId,
          zoneId: alert.zoneId,
          status: 'requested',
          launchedAt: new Date().toISOString(),
          params: action.params,
        },
      }),
    );
  }

  return { missionIds };
}
