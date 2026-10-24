import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { AlertCardData, DemoEvent } from '@gridrisk/shared';

const ddbMock = mockClient(DynamoDBDocumentClient);
const sfnMock = mockClient(SFNClient);

/** Minimal authenticated HTTP API v2 event. */
function authedEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    requestContext: { authorizer: { jwt: { claims: { sub: 'user-1' } } } },
    ...overrides,
  } as unknown as APIGatewayProxyEventV2;
}

function anonEvent(): APIGatewayProxyEventV2 {
  return { requestContext: {} } as unknown as APIGatewayProxyEventV2;
}

const SAMPLE_EVENT: DemoEvent = {
  id: 'evt-1',
  type: 'outage',
  lat: 29.76,
  lon: -95.37,
  description: 'Outage',
  severity: 'critical',
};

const PENDING_ALERT: AlertCardData & { taskToken?: string } = {
  id: 'alert-1',
  zoneId: 'zone-a',
  title: 'ZONE A ISOLATED',
  points: ['p'],
  isolationWindowMinutes: 45,
  proposedActions: [
    { id: 'act-shelter', type: 'activate_shelter', label: 'Shelter', params: {} },
    { id: 'act-drone', type: 'dispatch_drone', label: 'Drone', params: {} },
  ],
  relatedEventIds: [],
  status: 'pending',
  createdAt: '2026-10-23T14:15:00.000Z',
  taskToken: 'token-abc',
};

beforeEach(() => {
  ddbMock.reset();
  sfnMock.reset();
  process.env.EVENTS_TABLE = 'events';
  process.env.ALERTS_TABLE = 'alerts';
  process.env.DISPATCH_TOPIC_ARN = 'arn:aws:sns:us-east-1:111:topic';
  process.env.STATE_MACHINE_ARN = 'arn:aws:states:us-east-1:111:stateMachine:sm';
});

afterEach(() => vi.restoreAllMocks());

function body(res: { body?: string }): unknown {
  return JSON.parse(res.body ?? '{}');
}

describe('GET /events', () => {
  it('401 without a JWT', async () => {
    const { handler } = await import('../lambda/getEvents');
    const res = await handler(anonEvent());
    expect((res as { statusCode: number }).statusCode).toBe(401);
  });

  it('returns events for an authenticated request', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [SAMPLE_EVENT] });
    const { handler } = await import('../lambda/getEvents');
    const res = (await handler(authedEvent())) as {
      statusCode: number;
      body: string;
    };
    expect(res.statusCode).toBe(200);
    expect(body(res)).toEqual({ events: [SAMPLE_EVENT] });
  });
});

describe('GET /alerts', () => {
  it('strips the internal taskToken from the response', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [PENDING_ALERT] });
    const { handler } = await import('../lambda/getAlerts');
    const res = (await handler(authedEvent())) as {
      statusCode: number;
      body: string;
    };
    expect(res.statusCode).toBe(200);
    const parsed = body(res) as { alerts: Array<Record<string, unknown>> };
    expect(parsed.alerts[0]).not.toHaveProperty('taskToken');
    expect(parsed.alerts[0]!.id).toBe('alert-1');
  });
});

describe('POST /simulate/{scenario}', () => {
  it('400 on an unknown scenario', async () => {
    const { handler } = await import('../lambda/simulate');
    const res = (await handler(authedEvent({ pathParameters: { scenario: 'nope' } as never }))) as {
      statusCode: number;
    };
    expect(res.statusCode).toBe(400);
  });

  it('resets the events table and returns the calm baseline', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    ddbMock.onAnyCommand().resolves({});
    const { handler } = await import('../lambda/simulate');
    const res = (await handler(authedEvent({ pathParameters: { scenario: 'calm' } as never }))) as {
      statusCode: number;
      body: string;
    };
    expect(res.statusCode).toBe(200);
    const parsed = body(res) as { events: DemoEvent[] };
    expect(parsed.events.length).toBeGreaterThan(0);
  });
});

describe('POST /alerts/{id}/approve', () => {
  async function approve(event: APIGatewayProxyEventV2) {
    const { handler } = await import('../lambda/approve');
    return (await handler(event)) as {
      statusCode: number;
      body: string;
    };
  }

  it('400 when actionIds is empty', async () => {
    const res = await approve(
      authedEvent({
        pathParameters: { id: 'alert-1' } as never,
        body: JSON.stringify({ actionIds: [] }),
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 for an unknown alert id', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    const res = await approve(
      authedEvent({
        pathParameters: { id: 'missing' } as never,
        body: JSON.stringify({ actionIds: ['act-shelter'] }),
      }),
    );
    expect(res.statusCode).toBe(404);
  });

  it('409 when the alert is already dispatched', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { ...PENDING_ALERT, status: 'dispatched' } });
    const res = await approve(
      authedEvent({
        pathParameters: { id: 'alert-1' } as never,
        body: JSON.stringify({ actionIds: ['act-shelter'] }),
      }),
    );
    expect(res.statusCode).toBe(409);
  });

  it('400 for an unknown actionId', async () => {
    ddbMock.on(GetCommand).resolves({ Item: PENDING_ALERT });
    const res = await approve(
      authedEvent({
        pathParameters: { id: 'alert-1' } as never,
        body: JSON.stringify({ actionIds: ['does-not-exist'] }),
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 resumes the execution via SendTaskSuccess and marks approved', async () => {
    ddbMock.on(GetCommand).resolves({ Item: PENDING_ALERT });
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { ...PENDING_ALERT, status: 'approved' },
    });
    sfnMock.on(SendTaskSuccessCommand).resolves({});

    const res = await approve(
      authedEvent({
        pathParameters: { id: 'alert-1' } as never,
        body: JSON.stringify({ actionIds: ['act-shelter', 'act-drone'] }),
      }),
    );
    expect(res.statusCode).toBe(200);
    const parsed = body(res) as { alert: AlertCardData & { taskToken?: string } };
    expect(parsed.alert.status).toBe('approved');
    expect(parsed.alert).not.toHaveProperty('taskToken');
    expect(sfnMock.commandCalls(SendTaskSuccessCommand)).toHaveLength(1);
  });

  // --- hardening (Saransh) ---

  const approveBody = (actionIds: string[]) =>
    authedEvent({
      pathParameters: { id: 'alert-1' } as never,
      body: JSON.stringify({ actionIds }),
    });

  it('409 when the alert is already approved', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { ...PENDING_ALERT, status: 'approved' } });
    expect((await approve(approveBody(['act-shelter']))).statusCode).toBe(409);
  });

  it('only approves a pending alert (conditional update)', async () => {
    ddbMock.on(GetCommand).resolves({ Item: PENDING_ALERT });
    ddbMock.on(UpdateCommand).resolves({ Attributes: { ...PENDING_ALERT, status: 'approved' } });
    sfnMock.on(SendTaskSuccessCommand).resolves({});

    await approve(approveBody(['act-drone']));
    const input = ddbMock.commandCalls(UpdateCommand)[0]!.args[0].input;
    expect(input.ConditionExpression).toBe('#s = :pending');
    expect(input.ExpressionAttributeValues).toMatchObject({ ':pending': 'pending' });
  });

  it('409 when a concurrent approval wins the race, without resuming the execution', async () => {
    ddbMock.on(GetCommand).resolves({ Item: PENDING_ALERT });
    ddbMock
      .on(UpdateCommand)
      .rejects(new ConditionalCheckFailedException({ message: 'conditional', $metadata: {} }));

    const res = await approve(approveBody(['act-shelter']));
    expect(res.statusCode).toBe(409);
    expect((body(res) as { error: { code: string } }).error.code).toBe('CONFLICT');
    expect(sfnMock.commandCalls(SendTaskSuccessCommand)).toHaveLength(0);
  });

  it('rolls back to pending and returns 500 when SendTaskSuccess fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ddbMock.on(GetCommand).resolves({ Item: PENDING_ALERT });
    ddbMock.on(UpdateCommand).resolves({ Attributes: { ...PENDING_ALERT, status: 'approved' } });
    sfnMock.on(SendTaskSuccessCommand).rejects(new Error('TaskTimedOut'));

    const res = await approve(approveBody(['act-shelter']));
    expect(res.statusCode).toBe(500);
    const updates = ddbMock.commandCalls(UpdateCommand).map((c) => c.args[0].input);
    expect(updates).toHaveLength(2);
    expect(updates[1]?.ExpressionAttributeValues).toMatchObject({ ':pending': 'pending' });
    expect(updates[1]?.UpdateExpression).toContain('REMOVE approvedActionIds');
  });

  it.each([
    ['empty actionIds', [], { Item: PENDING_ALERT }],
    ['unknown alert', ['act-shelter'], { Item: undefined }],
    ['already dispatched', ['act-shelter'], { Item: { ...PENDING_ALERT, status: 'dispatched' } }],
    ['unknown actionId', ['nope'], { Item: PENDING_ALERT }],
  ])('never calls SendTaskSuccess or writes on error: %s', async (_name, actionIds, item) => {
    ddbMock.on(GetCommand).resolves(item);
    const res = await approve(approveBody(actionIds as string[]));
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(sfnMock.commandCalls(SendTaskSuccessCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('401 without a JWT, before touching DynamoDB', async () => {
    const res = await approve(anonEvent());
    expect(res.statusCode).toBe(401);
    expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
  });
});
