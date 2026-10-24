import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiveAdapter } from '../src/data/LiveAdapter';
import { DataAdapterError } from '../src/data/errors';
import { createHandlers } from '../src/mocks/handlers';
import { describeDataAdapterContract } from './contract/dataAdapterContract';

const BASE = 'http://api.test';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** Fresh fake backend (calm baseline) + adapter. */
function freshLiveAdapter(token: string | null = 'test-token') {
  server.resetHandlers(...createHandlers(BASE));
  return new LiveAdapter({ baseUrl: `${BASE}/`, getToken: () => token });
}

describeDataAdapterContract('LiveAdapter (MSW)', () => freshLiveAdapter());

// MockAdapter runs the same contract suite in test/MockAdapter.test.ts.

async function rejection(p: Promise<unknown>): Promise<DataAdapterError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DataAdapterError);
  return err as DataAdapterError;
}

describe('LiveAdapter (HTTP specifics)', () => {
  it('sends the bearer token, JSON body and API_ROUTES paths', async () => {
    const seen: { method: string; url: string; auth: string | null; body: string }[] = [];
    const adapter = freshLiveAdapter('jwt-123');
    server.events.on('request:start', async ({ request }) => {
      seen.push({
        method: request.method,
        url: request.url,
        auth: request.headers.get('Authorization'),
        body: await request.clone().text(),
      });
    });

    await adapter.simulate('escalation');
    const [alert] = await adapter.getAlerts();
    await adapter.approve(alert!.id, ['act-drone-zone-a']);
    server.events.removeAllListeners();

    expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
      `POST ${BASE}/simulate/escalation`,
      `GET ${BASE}/alerts`,
      `POST ${BASE}/alerts/${encodeURIComponent(alert!.id)}/approve`,
    ]);
    expect(seen.every((r) => r.auth === 'Bearer jwt-123')).toBe(true);
    expect(JSON.parse(seen[2]!.body)).toEqual({ actionIds: ['act-drone-zone-a'] });
  });

  it('rejects with UNAUTHENTICATED (401) without a token', async () => {
    const err = await rejection(freshLiveAdapter(null).getEvents());
    expect(err.code).toBe('UNAUTHENTICATED');
    expect(err.status).toBe(401);
  });

  it('rejects with BAD_REQUEST (400) for an unknown scenario', async () => {
    const adapter = freshLiveAdapter();
    // @ts-expect-error – deliberately outside ScenarioName to hit the 400 path.
    const err = await rejection(adapter.simulate('tornado'));
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('rejects responses that do not match the contract', async () => {
    const adapter = freshLiveAdapter();
    server.use(http.get(`${BASE}/events`, () => HttpResponse.json({ events: [{ id: 1 }] })));
    const err = await rejection(adapter.getEvents());
    expect(err.code).toBe('INTERNAL');
    expect(err.message).toMatch(/contract/);
  });

  it('maps a non-JSON error status to a code', async () => {
    const adapter = freshLiveAdapter();
    server.use(http.get(`${BASE}/alerts`, () => new HttpResponse('nope', { status: 404 })));
    const err = await rejection(adapter.getAlerts());
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
  });

  it('wraps network failures as INTERNAL', async () => {
    const adapter = new LiveAdapter({
      baseUrl: BASE,
      getToken: () => 't',
      fetch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    });
    const err = await rejection(adapter.getEvents());
    expect(err.code).toBe('INTERNAL');
    expect(err.message).toContain('Failed to fetch');
  });
});
