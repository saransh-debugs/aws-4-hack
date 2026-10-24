/**
 * Step Functions task: RunAgent (Task 14).
 * Reads the current events, runs the REAL agent for the zone (Bedrock Converse loop with a
 * template fallback), and returns the proposed alert.
 *
 * One BedrockRuntimeClient is created at module scope so it is reused across warm invocations.
 * The agent falls back to the deterministic template when BEDROCK_MODEL_ID is unset or Bedrock
 * errors, so the state machine keeps working offline.
 *
 * Output shape consumed by the state machine (unchanged):
 *   { zoneId, raised: boolean, alert?: AlertCardData }
 */
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { AlertCardData, DemoEvent } from '@gridrisk/shared';
import { runAgent, type AgentLogger } from '@gridrisk/agent';
import { ddb, EVENTS_TABLE } from '../shared/ddb';

interface Input {
  zoneId: string;
}

interface Output {
  zoneId: string;
  raised: boolean;
  alert?: AlertCardData;
}

// Reused across warm invocations. Region follows AWS_REGION (us-east-1 in prod).
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

// Structured JSON logger -> CloudWatch.
const logger: AgentLogger = {
  info: (msg, data) => console.log(JSON.stringify({ level: 'info', msg, ...data })),
  warn: (msg, data) => console.warn(JSON.stringify({ level: 'warn', msg, ...data })),
};

export async function handler(input: Input): Promise<Output> {
  const res = await ddb.send(new ScanCommand({ TableName: EVENTS_TABLE() }));
  const events = (res.Items ?? []) as DemoEvent[];

  const alert = await runAgent(
    { zoneId: input.zoneId, events },
    { bedrockClient, modelId: process.env.BEDROCK_MODEL_ID, logger },
  );
  if (!alert) return { zoneId: input.zoneId, raised: false };

  return { zoneId: input.zoneId, raised: true, alert };
}
