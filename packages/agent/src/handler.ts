/**
 * A4 – RunAgent Lambda entry (owner: Darsh). Exported as `@gridrisk/agent/handler`.
 *
 * Validates the event with zod, then runs the agent. One BedrockRuntimeClient is created per
 * container (module scope) and reused across invocations. modelId comes from env
 * BEDROCK_MODEL_ID inside runAgent; with no model id the agent returns the template.
 */
import { z } from 'zod';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DemoEventSchema, type AlertCardData } from '@gridrisk/shared';
import { BEDROCK_DEFAULTS, type ConverseClient } from './bedrock';
import { runAgent } from './runAgent';

export const RunAgentEventSchema = z.object({
  zoneId: z.string().min(1),
  events: z.array(DemoEventSchema),
});

/** One client per container, reused across warm invocations. */
let client: ConverseClient | undefined;
function getClient(): ConverseClient {
  client ??= new BedrockRuntimeClient({
    region: process.env.AWS_REGION || BEDROCK_DEFAULTS.region,
  });
  return client;
}

export async function handler(event: unknown): Promise<{ alert: AlertCardData | null }> {
  const input = RunAgentEventSchema.parse(event);
  // Only hand the client over when there is a model id; otherwise stay fully offline.
  const bedrockClient = process.env.BEDROCK_MODEL_ID ? getClient() : undefined;
  return { alert: await runAgent(input, { bedrockClient }) };
}
