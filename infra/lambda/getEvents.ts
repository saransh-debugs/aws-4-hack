/**
 * GET /events -> { events: DemoEvent[] }  (CONTRACTS.md)
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { DemoEvent } from '@gridrisk/shared';
import { ddb, EVENTS_TABLE } from './shared/ddb';
import { fail, isAuthenticated, ok, withErrorHandling } from './shared/http';

export const handler = withErrorHandling(
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    if (!isAuthenticated(event)) return fail('UNAUTHENTICATED', 'Missing or invalid token');

    const res = await ddb.send(new ScanCommand({ TableName: EVENTS_TABLE() }));
    const now = Math.floor(Date.now() / 1000);
    const events = (res.Items ?? []).filter(
      (item) => typeof item.expiresAt !== 'number' || item.expiresAt > now,
    ) as DemoEvent[];
    return ok({ events });
  },
);
