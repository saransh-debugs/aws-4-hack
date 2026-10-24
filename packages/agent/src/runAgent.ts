import type { AlertCardData, DemoEvent, Shelter, Zone } from '@gridrisk/shared';
import { AlertCardDataSchema } from '@gridrisk/shared';
import { SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import { analyze, DEFAULT_CONFIG, type EngineConfig } from '@gridrisk/engine';
import { assembleAlert } from './assemble';
import { runBedrockLoop, type ConverseClient } from './bedrock';
import { buildTemplateAlert } from './template';
import { checkGrounding } from './validate';

export interface RunAgentInput {
  zoneId: string;
  events: DemoEvent[];
}

export interface AgentLogger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
}

export interface RunAgentDeps {
  zones?: Zone[];
  shelters?: Shelter[];
  now?: () => Date;
  config?: EngineConfig;
  bedrockClient?: ConverseClient;
  /** Defaults to env BEDROCK_MODEL_ID (A4). No model id -> template, so CI stays offline. */
  modelId?: string;
  timeoutMs?: number;
  logger?: AgentLogger;
}

/**
 * Handoff H5. Returns a proposed alert for the zone, or null if there is nothing to raise.
 *
 * A0 STUB (owner: Darsh, A4). Wired just enough for the A3 evals: if a client and model id
 * are passed, run the Converse loop and fall back to the template on any error.
 * TODO(Darsh): env BEDROCK_MODEL_ID + default client (handler), 8 s AbortController timeout,
 * log the fallback reason, AgentError('ungrounded').
 */
export async function runAgent(
  input: RunAgentInput,
  deps: RunAgentDeps = {},
): Promise<AlertCardData | null> {
  const zones = deps.zones ?? ZONES;
  const shelters = deps.shelters ?? SHELTERS;
  const config = deps.config ?? DEFAULT_CONFIG;
  const zone = zones.find((z) => z.id === input.zoneId);
  if (!zone) return null;

  const result = analyze(input.events, zones, { config, shelters }).find(
    (r) => r.zoneId === zone.id,
  );
  if (!result?.isolated) return null;

  const now = deps.now?.();
  const template = () => buildTemplateAlert(result, { zone, shelters, now });
  if (!deps.bedrockClient || !deps.modelId) return template();

  try {
    const { submission, trace } = await runBedrockLoop({
      client: deps.bedrockClient,
      modelId: deps.modelId,
      zone,
      ctx: { events: input.events, zones, shelters, config },
    });
    const alert = AlertCardDataSchema.parse(
      assembleAlert(submission, result, { zone, shelters, now, toolTrace: trace }),
    );
    const grounding = checkGrounding(alert, result, { zone, shelters });
    if (!grounding.ok) {
      deps.logger?.warn('agent: ungrounded alert, using template', { errors: grounding.errors });
      return template();
    }
    return alert;
  } catch (err) {
    deps.logger?.warn('agent: falling back to template', { error: String(err) });
    return template();
  }
}
