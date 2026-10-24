/** GET /map-data -> versioned operational geography and shelter registry. */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { GeographyRegistrySchema } from '@gridrisk/shared';
import { ddb, GEOGRAPHY_TABLE } from './shared/ddb';
import { fail, isAuthenticated, ok, withErrorHandling } from './shared/http';

export const handler = withErrorHandling(
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    if (!isAuthenticated(event)) return fail('UNAUTHENTICATED', 'Missing or invalid token');
    const result = await ddb.send(new ScanCommand({ TableName: GEOGRAPHY_TABLE() }));
    const record = (result.Items ?? [])[0];
    let payload: unknown;
    try {
      payload = record?.payload ? JSON.parse(String(record.payload)) : undefined;
    } catch {
      payload = undefined;
    }
    const parsed = GeographyRegistrySchema.safeParse(payload);
    if (!parsed.success) return fail('INTERNAL', 'Operational geography is unavailable');
    return ok(parsed.data);
  },
);
