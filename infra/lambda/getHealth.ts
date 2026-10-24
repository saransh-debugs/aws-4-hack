/** GET /health -> { health: SourceHealth[] } */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SourceHealthSchema, type SourceHealth } from '@gridrisk/shared';
import { ddb, HEALTH_TABLE } from './shared/ddb';
import { fail, isAuthenticated, ok, withErrorHandling } from './shared/http';

export const handler = withErrorHandling(
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    if (!isAuthenticated(event)) return fail('UNAUTHENTICATED', 'Missing or invalid token');
    const result = await ddb.send(new ScanCommand({ TableName: HEALTH_TABLE() }));
    const now = Date.now();
    const health = (result.Items ?? []).flatMap((item) => {
      const parsed = SourceHealthSchema.safeParse(item);
      if (!parsed.success) return [];
      const ageMinutes = (now - Date.parse(parsed.data.fetchedAt)) / 60_000;
      return [
        {
          ...parsed.data,
          status:
            parsed.data.status === 'healthy' && ageMinutes > parsed.data.maxAgeMinutes
              ? 'stale'
              : parsed.data.status,
        },
      ];
    });
    return ok({ health: health as SourceHealth[] });
  },
);
