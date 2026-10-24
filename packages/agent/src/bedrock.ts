/**
 * A3 – Bedrock Converse tool-use loop (owner: Saransh).
 *
 * A0 STUB: returns a fixed submission worded like SAMPLE_ALERT, with an empty trace.
 * TODO(Saransh): ConverseCommand loop over TOOL_SPECS until submit_alert or maxTurns.
 */
import type {
  ConverseCommand,
  ConverseCommandOutput,
  ToolUseBlock,
} from '@aws-sdk/client-bedrock-runtime';
import type { ToolTraceEntry, Zone } from '@gridrisk/shared';
import { SAMPLE_ALERT } from '@gridrisk/shared/fixtures';
import type { SubmitAlertInput } from './submit';
import type { ToolContext } from './tools';

export const BEDROCK_DEFAULTS = {
  region: 'us-east-1',
  maxTurns: 8,
  timeoutMs: 8_000,
  temperature: 0,
  maxTokens: 1_024,
} as const;

export type AgentErrorCode =
  | 'max_turns'
  | 'no_submit'
  | 'invalid_submit'
  | 'aborted'
  | 'timeout'
  | 'model_error'
  | 'ungrounded';

export class AgentError extends Error {
  override readonly name = 'AgentError';
  constructor(
    readonly code: AgentErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** The slice of BedrockRuntimeClient the loop needs, so tests and the stub model can stand in. */
export interface ConverseClient {
  send(cmd: ConverseCommand, opts?: { abortSignal?: AbortSignal }): Promise<ConverseCommandOutput>;
}

/** Smithy's JSON document type, as used by toolUse.input and toolResult json. */
export type BedrockDocument = NonNullable<ToolUseBlock['input']>;

export interface BedrockLoopOptions {
  client: ConverseClient;
  modelId: string;
  zone: Pick<Zone, 'id' | 'name'>;
  ctx: ToolContext;
  maxTurns?: number;
  signal?: AbortSignal;
}

export interface BedrockLoopResult {
  submission: SubmitAlertInput;
  /** Investigative tool calls in call order (submit_alert is not included). */
  trace: ToolTraceEntry[];
  /** Number of model calls made. */
  turns: number;
}

export async function runBedrockLoop(o: BedrockLoopOptions): Promise<BedrockLoopResult> {
  if (o.signal?.aborted) throw new AgentError('aborted', 'Aborted before turn 1');
  return {
    submission: {
      title: SAMPLE_ALERT.title,
      points: [...SAMPLE_ALERT.points],
      actionTypes: SAMPLE_ALERT.proposedActions.map((a) => a.type),
    },
    trace: [],
    turns: 0,
  };
}
