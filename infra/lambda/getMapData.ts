/**
 * GET /map-data -> { zones, roads, shelters }.
 *
 * These are the deployed map registry, not frontend-only fixtures. Keeping the registry behind
 * the API gives the web client one authoritative source and leaves room for a future GIS-backed
 * refresh without changing the map contract.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ROADS, SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import { fail, isAuthenticated, ok, withErrorHandling } from './shared/http';

export const handler = withErrorHandling(
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    if (!isAuthenticated(event)) return fail('UNAUTHENTICATED', 'Missing or invalid token');
    return ok({ zones: ZONES, roads: ROADS, shelters: SHELTERS });
  },
);
