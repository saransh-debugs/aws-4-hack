/**
 * A4 – RunAgent Lambda entry (owner: Darsh). Exported as `@gridrisk/agent/handler`.
 *
 * A0 STUB: validates the event and runs the agent in template mode.
 * TODO(Darsh): one BedrockRuntimeClient per container + BEDROCK_MODEL_ID, logger.
 */
import { z } from 'zod';
import { DemoEventSchema, type AlertCardData } from '@gridrisk/shared';
import { runAgent } from './runAgent';

export const RunAgentEventSchema = z.object({
  zoneId: z.string().min(1),
  events: z.array(DemoEventSchema),
});

export async function handler(event: unknown): Promise<{ alert: AlertCardData | null }> {
  const input = RunAgentEventSchema.parse(event);
  return { alert: await runAgent(input) };
}
