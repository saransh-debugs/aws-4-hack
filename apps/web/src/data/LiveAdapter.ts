/**
 * Task 13a – LiveAdapter (author: Saransh, owner/reviewer: Bushra).
 *
 * Talks to the HTTP API in docs/CONTRACTS.md with `fetch`, using API_ROUTES + buildPath, and
 * validates every response with the shared zod schemas. Non-2xx responses become a
 * DataAdapterError carrying the API error code. Until the backend is wired (Task 13b), MSW
 * serves the same contract (src/mocks/handlers.ts).
 */
import type { z } from 'zod';
import {
  API_ROUTES,
  ApiErrorSchema,
  ApproveResponseSchema,
  buildPath,
  GetAlertsResponseSchema,
  GetHealthResponseSchema,
  GetMapDataResponseSchema,
  GetEventsResponseSchema,
  SimulateResponseSchema,
  type AlertCardData,
  type ApiRouteName,
  type ApproveRequest,
  type DemoEvent,
  type ScenarioName,
  type SourceHealth,
  type MapData,
} from '@gridrisk/shared';
import type { DataAdapter } from './DataAdapter';
import { DataAdapterError, type DataAdapterErrorCode } from './errors';

export interface LiveAdapterOptions {
  /** API base URL without a trailing slash, e.g. VITE_API_URL. */
  baseUrl: string;
  /** Returns the Cognito JWT (Task 13b), or null when signed out. */
  getToken: () => string | null | Promise<string | null>;
  /** Injectable for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

const STATUS_CODES: Record<number, DataAdapterErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'UNAUTHENTICATED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
};

export class LiveAdapter implements DataAdapter {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: LiveAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    // Bind so a bare `fetch` reference is not called with the adapter as `this`.
    this.fetchImpl = options.fetch ?? ((...args) => globalThis.fetch(...args));
  }

  async getEvents(): Promise<DemoEvent[]> {
    return (await this.request('getEvents', GetEventsResponseSchema)).events;
  }

  async getAlerts(): Promise<AlertCardData[]> {
    return (await this.request('getAlerts', GetAlertsResponseSchema)).alerts;
  }

  async getHealth(): Promise<SourceHealth[]> {
    return (await this.request('getHealth', GetHealthResponseSchema)).health;
  }

  async getMapData(): Promise<MapData> {
    return this.request('getMapData', GetMapDataResponseSchema);
  }

  async approve(alertId: string, actionIds: string[]): Promise<AlertCardData> {
    const body: ApproveRequest = { actionIds };
    const res = await this.request('approveAlert', ApproveResponseSchema, { id: alertId }, body);
    return res.alert;
  }

  async simulate(scenario: ScenarioName): Promise<DemoEvent[]> {
    return (await this.request('simulate', SimulateResponseSchema, { scenario })).events;
  }

  async reset(): Promise<void> {
    await this.request('reset', SimulateResponseSchema);
  }

  private async request<T>(
    route: ApiRouteName,
    schema: z.ZodType<T>,
    params: Record<string, string> = {},
    body?: unknown,
  ): Promise<T> {
    const { method, path } = API_ROUTES[route];
    const token = await this.options.getToken();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${buildPath(path, params)}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new DataAdapterError('INTERNAL', `Network error on ${route}: ${String(err)}`);
    }

    const json: unknown = await res.json().catch(() => undefined);

    if (!res.ok) {
      const apiError = ApiErrorSchema.safeParse(json);
      if (apiError.success) {
        const { code, message } = apiError.data.error;
        throw new DataAdapterError(code, message, res.status);
      }
      throw new DataAdapterError(
        STATUS_CODES[res.status] ?? 'INTERNAL',
        `${route} failed with HTTP ${res.status}`,
        res.status,
      );
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new DataAdapterError(
        'INTERNAL',
        `${route}: response does not match the contract`,
        res.status,
      );
    }
    return parsed.data;
  }
}
