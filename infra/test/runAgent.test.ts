/**
 * Unit test for the RunAgent Step Functions task (Task 14).
 *
 * DynamoDB is mocked with aws-sdk-client-mock. We assert the output shape:
 *   - calm events       -> { raised: false }           (nothing isolated)
 *   - escalation events -> { raised: true, alert }      (template path, no BEDROCK_MODEL_ID)
 *
 * With no BEDROCK_MODEL_ID the agent never calls Bedrock, so this stays offline.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { buildScenario } from '@gridrisk/engine';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  process.env.EVENTS_TABLE = 'events';
  delete process.env.BEDROCK_MODEL_ID;
});

afterEach(() => {
  delete process.env.BEDROCK_MODEL_ID;
});

describe('RunAgent lambda', () => {
  it('calm scenario -> raised: false', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: buildScenario('calm') });
    const { handler } = await import('../lambda/sfn/runAgent');
    const out = await handler({ zoneId: 'zone-a' });
    expect(out.raised).toBe(false);
    expect(out.zoneId).toBe('zone-a');
    expect(out.alert).toBeUndefined();
  });

  it('escalation scenario with no BEDROCK_MODEL_ID -> raised: true via template', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: buildScenario('escalation') });
    const { handler } = await import('../lambda/sfn/runAgent');
    const out = await handler({ zoneId: 'zone-a' });
    expect(out.raised).toBe(true);
    expect(out.zoneId).toBe('zone-a');
    expect(out.alert).toBeDefined();
    expect(out.alert?.zoneId).toBe('zone-a');
    expect(out.alert?.proposedActions.length).toBeGreaterThan(0);
  });
});
