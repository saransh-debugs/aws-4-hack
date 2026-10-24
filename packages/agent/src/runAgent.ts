/**
 * A4 – Orchestration and fallback (owner: Darsh). Handoff H5.
 *
 * runAgent analyses the zone, and:
 *   - not isolated          -> null (Bedrock is never called)
 *   - no model id           -> deterministic template (CI / mock mode stay offline)
 *   - model id, no client   -> lazily creates one BedrockRuntimeClient
 *   - model path            -> Converse loop -> assemble -> schema parse -> checkGrounding
 *   - any AgentError, schema failure, or failed grounding -> log the reason, return the template
 *
 * The loop is wrapped in an AbortController with `deps.timeoutMs ?? BEDROCK_DEFAULTS.timeoutMs`.
 *
 * NOTE: the BedrockRuntimeClient import is dynamic so that `./template`'s import graph stays
 * SDK-free (the web app bundles the template via `@gridrisk/agent/template`).
 */
import type { AlertCardData, DemoEvent, Shelter, Zone } from '@gridrisk/shared';
import { AlertCardDataSchema } from '@gridrisk/shared';
import { SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import { analyze, DEFAULT_CONFIG, type EngineConfig } from '@gridrisk/engine';
import { assembleAlert } from './assemble';
import { AgentError, BEDROCK_DEFAULTS, runBedrockLoop, type ConverseClient } from './bedrock';
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
  /** Defaults to env BEDROCK_MODEL_ID. No model id -> template, so CI stays offline. */
  modelId?: string;
  timeoutMs?: number;
  logger?: AgentLogger;
}

/** Lazily build a real BedrockRuntimeClient without pulling the SDK into the template graph. */
async function createBedrockClient(): Promise<ConverseClient> {
  const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
  const region = process.env.AWS_REGION || BEDROCK_DEFAULTS.region;
  return new BedrockRuntimeClient({ region });
}

/**
 * Handoff H5. Returns a proposed alert for the zone, or null if there is nothing to raise.
 */
export async function runAgent(
  input: RunAgentInput,
  deps: RunAgentDeps = {},
): Promise<AlertCardData | null> {
  const zones = deps.zones ?? ZONES;
  const shelters = deps.shelters ?? SHELTERS;
  const config = deps.config ?? DEFAULT_CONFIG;
  const logger = deps.logger;

  const zone = zones.find((z) => z.id === input.zoneId);
  if (!zone) return null;

  const result = analyze(input.events, zones, { config, shelters }).find(
    (r) => r.zoneId === zone.id,
  );
  if (!result?.isolated) return null;

  const now = deps.now?.();
  const template = (): AlertCardData => buildTemplateAlert(result, { zone, shelters, now });

  const modelId = deps.modelId ?? process.env.BEDROCK_MODEL_ID;
  if (!modelId) {
    logger?.info('agent: no model id, using template', { path: 'template', zoneId: zone.id });
    return template();
  }

  const client = deps.bedrockClient ?? (await createBedrockClient());

  const controller = new AbortController();
  const timeoutMs = deps.timeoutMs ?? BEDROCK_DEFAULTS.timeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { submission, trace, turns } = await runBedrockLoop({
      client,
      modelId,
      zone,
      ctx: { events: input.events, zones, shelters, config },
      signal: controller.signal,
    });

    const alert = AlertCardDataSchema.parse(
      assembleAlert(submission, result, { zone, shelters, now, toolTrace: trace }),
    );

    const grounding = checkGrounding(alert, result, { zone, shelters });
    if (!grounding.ok) {
      throw new AgentError('ungrounded', `Grounding failed: ${grounding.errors.join('; ')}`);
    }

    logger?.info('agent: model-worded alert', { path: 'bedrock', zoneId: zone.id, turns });
    return alert;
  } catch (err) {
    // A timeout surfaces as an AbortError inside the loop ('aborted'); relabel it.
    const reason =
      controller.signal.aborted && !(err instanceof AgentError && err.code === 'ungrounded')
        ? new AgentError('timeout', `Agent timed out after ${timeoutMs}ms`, { cause: err })
        : err;
    logger?.warn('agent: falling back to template', {
      path: 'template',
      zoneId: zone.id,
      code: reason instanceof AgentError ? reason.code : 'unknown',
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    return template();
  } finally {
    clearTimeout(timer);
  }
}
