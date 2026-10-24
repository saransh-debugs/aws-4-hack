/**
 * GET /alerts -> { alerts: AlertCardData[] }  (CONTRACTS.md)
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { AlertCardData } from '@gridrisk/shared';
import { ddb, ALERTS_TABLE } from './shared/ddb';
import { fail, isAuthenticated, ok, withErrorHandling } from './shared/http';

/** Internal fields stored on the alert record that must not leak to the API. */
interface StoredAlert extends AlertCardData {
  taskToken?: string;
  /** Non-alert bookkeeping rows (zone_lock, shelter_status, drone_mission) set this. */
  kind?: string;
}

function toCardData(item: StoredAlert): AlertCardData {
  const { taskToken: _taskToken, kind: _kind, ...card } = item;
  return card;
}

export const handler = withErrorHandling(
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    if (!isAuthenticated(event)) return fail('UNAUTHENTICATED', 'Missing or invalid token');

    const res = await ddb.send(new ScanCommand({ TableName: ALERTS_TABLE() }));
    // The alerts table also holds bookkeeping rows (zone locks, shelter/drone records);
    // only rows without a `kind` are real alert cards.
    const alerts = ((res.Items ?? []) as StoredAlert[])
      .filter((item) => item.kind === undefined)
      .map(toCardData);
    // Newest first so the UI shows the active alert at the top.
    alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return ok({ alerts });
  },
);
