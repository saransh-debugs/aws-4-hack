/**
 * Task 13a – MSW handlers that follow docs/CONTRACTS.md (author: Saransh, owner: Bushra).
 *
 * An in-memory fake of the backend so LiveAdapter can be built and tested before the real API
 * is wired. Used by tests (msw/node) and by the browser when VITE_API_MOCKING=msw.
 */
import { http, HttpResponse, type HttpHandler } from 'msw';
import {
  API_ROUTES,
  ApproveRequestSchema,
  ScenarioNameSchema,
  type AlertCardData,
  type ApiError,
  type DemoEvent,
} from '@gridrisk/shared';
import { ROADS, SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import { analyze, buildScenario } from '@gridrisk/engine';
// Browser-safe subpath: no Bedrock SDK.
import { buildTemplateAlert } from '@gridrisk/agent/template';

export interface MockApiState {
  events: DemoEvent[];
  alerts: AlertCardData[];
}

export function initialMockApiState(): MockApiState {
  return { events: buildScenario('calm'), alerts: [] };
}

function apiError(status: number, code: ApiError['error']['code'], message: string) {
  return HttpResponse.json<ApiError>({ error: { code, message } }, { status });
}

/** MSW path for an API_ROUTES path: `{id}` → `:id`. */
function mswPath(baseUrl: string, path: string): string {
  return `${baseUrl}${path.replace(/\{(\w+)\}/g, ':$1')}`;
}

/** New pending alerts for zones the engine finds isolated, at most one per zone. */
function raiseAlerts(state: MockApiState): void {
  for (const result of analyze(state.events, ZONES, { shelters: SHELTERS })) {
    if (!result.isolated || state.alerts.some((a) => a.zoneId === result.zoneId)) continue;
    const zone = ZONES.find((z) => z.id === result.zoneId);
    if (!zone) continue;
    state.alerts.push(buildTemplateAlert(result, { zone, shelters: SHELTERS }));
  }
}

/**
 * Handlers bound to `baseUrl` (e.g. VITE_API_URL, or `http://api.test` in tests).
 * Each call gets its own state, so tests can start from a clean calm baseline.
 */
export function createHandlers(
  baseUrl: string,
  state: MockApiState = initialMockApiState(),
): HttpHandler[] {
  const base = baseUrl.replace(/\/+$/, '');
  /** 401 unless the request carries a bearer token (any non-empty value), like the JWT authorizer. */
  const unauthorized = (request: Request) =>
    /^Bearer \S+$/.test(request.headers.get('Authorization') ?? '')
      ? undefined
      : apiError(401, 'UNAUTHENTICATED', 'Missing or invalid bearer token');

  return [
    http.get(
      mswPath(base, API_ROUTES.getEvents.path),
      ({ request }) => unauthorized(request) ?? HttpResponse.json({ events: state.events }),
    ),

    http.get(
      mswPath(base, API_ROUTES.getAlerts.path),
      ({ request }) => unauthorized(request) ?? HttpResponse.json({ alerts: state.alerts }),
    ),

    http.get(
      mswPath(base, API_ROUTES.getMapData.path),
      ({ request }) =>
        unauthorized(request) ??
        HttpResponse.json({ zones: ZONES, roads: ROADS, shelters: SHELTERS }),
    ),

    http.post<{ id: string }>(
      mswPath(base, API_ROUTES.approveAlert.path),
      async ({ params, request }) => {
        const denied = unauthorized(request);
        if (denied) return denied;
        const body = ApproveRequestSchema.safeParse(await request.json().catch(() => null));
        if (!body.success) {
          return apiError(400, 'BAD_REQUEST', 'actionIds must be a non-empty array of strings');
        }
        const alert = state.alerts.find((a) => a.id === params.id);
        if (!alert) return apiError(404, 'NOT_FOUND', `Unknown alert: ${params.id}`);
        if (alert.status !== 'pending') {
          return apiError(409, 'CONFLICT', `Alert ${alert.id} is already ${alert.status}`);
        }
        const known = new Set(alert.proposedActions.map((a) => a.id));
        const unknown = body.data.actionIds.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          return apiError(400, 'BAD_REQUEST', `Unknown actionIds: ${unknown.join(', ')}`);
        }
        // The real backend goes approved → dispatched via Step Functions; the fake jumps there.
        alert.status = 'dispatched';
        return HttpResponse.json({ alert });
      },
    ),

    // Must come before /simulate/:scenario so "reset" is not treated as a scenario name.
    http.post(mswPath(base, API_ROUTES.reset.path), ({ request }) => {
      const denied = unauthorized(request);
      if (denied) return denied;
      Object.assign(state, initialMockApiState());
      return HttpResponse.json({ events: state.events });
    }),

    http.post<{ scenario: string }>(
      mswPath(base, API_ROUTES.simulate.path),
      ({ params, request }) => {
        const denied = unauthorized(request);
        if (denied) return denied;
        const scenario = ScenarioNameSchema.safeParse(params.scenario);
        if (!scenario.success) {
          return apiError(400, 'BAD_REQUEST', `Unknown scenario: ${params.scenario}`);
        }
        state.events = buildScenario(scenario.data);
        raiseAlerts(state);
        return HttpResponse.json({ events: state.events });
      },
    ),
  ];
}
