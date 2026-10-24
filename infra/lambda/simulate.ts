/**
 * POST /simulate/{scenario} -> { events: DemoEvent[] }
 * POST /simulate/reset      -> { events: DemoEvent[] } (calm baseline)
 *
 * Both map onto buildScenario(...); reset === buildScenario('calm'). See CONTRACTS.md.
 * 400 for an unknown scenario name.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ScenarioNameSchema } from '@gridrisk/shared';
import { loadScenario } from './shared/scenario';
import { fail, isAuthenticated, ok, withErrorHandling } from './shared/http';

export const handler = withErrorHandling(
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    if (!isAuthenticated(event)) return fail('UNAUTHENTICATED', 'Missing or invalid token');

    // The reset route has no {scenario} path param; default it to 'calm'.
    const raw = event.pathParameters?.scenario ?? 'calm';
    const parsed = ScenarioNameSchema.safeParse(raw);
    if (!parsed.success) return fail('BAD_REQUEST', `Unknown scenario: ${raw}`);

    const events = await loadScenario(parsed.data);
    return ok({ events });
  },
);
