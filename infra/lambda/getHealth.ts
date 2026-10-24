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
    const health = (result.Items ?? []).flatMap((item) => {
      const parsed = SourceHealthSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
    return ok({ health: health as SourceHealth[] });
  },
);
