/**
 * A3 – Bedrock Converse tool-use loop (owner: Saransh).
 *
 *   send(messages + tools) -> run every toolUse in the reply, record it in the trace
 *   -> send all toolResults back in one user message -> repeat
 *   until submit_alert is accepted, or maxTurns is reached.
 *
 * Unknown tools and invalid submissions get an error toolResult so Claude can retry.
 * Grounding, timeouts and the template fallback live in ./runAgent (A4).
 */
import {
  ConverseCommand,
  type ContentBlock,
  type ConverseCommandOutput,
  type Message,
  type ToolUseBlock,
} from '@aws-sdk/client-bedrock-runtime';
import { z } from 'zod';
import type { ToolTraceEntry, Zone } from '@gridrisk/shared';
import { buildInitialMessage, buildSystemPrompt } from './prompt';
import { SubmitAlertSchema, type SubmitAlertInput } from './submit';
import { executeTool, TOOL_SPECS, type ToolContext } from './tools';

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

type ToolResultBlock = Extract<ContentBlock, { toolResult: unknown }>;
/** Smithy's JSON document type, as used by toolUse.input and toolResult json. */
export type BedrockDocument = NonNullable<ToolUseBlock['input']>;

function okResult(toolUseId: string | undefined, json: Record<string, unknown>): ToolResultBlock {
  return {
    toolResult: { toolUseId, status: 'success', content: [{ json: json as BedrockDocument }] },
  };
}

function errorResult(toolUseId: string | undefined, text: string): ToolResultBlock {
  return { toolResult: { toolUseId, status: 'error', content: [{ text }] } };
}

export async function runBedrockLoop(o: BedrockLoopOptions): Promise<BedrockLoopResult> {
  const maxTurns = o.maxTurns ?? BEDROCK_DEFAULTS.maxTurns;
  const system = [{ text: buildSystemPrompt() }];
  const tools = TOOL_SPECS.map((toolSpec) => ({ toolSpec }));
  const messages: Message[] = [{ role: 'user', content: [{ text: buildInitialMessage(o.zone) }] }];
  const trace: ToolTraceEntry[] = [];

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (o.signal?.aborted) throw new AgentError('aborted', `Aborted before turn ${turn}`);

    const command = new ConverseCommand({
      modelId: o.modelId,
      system,
      // Copy so later pushes don't mutate the input recorded by mocks.
      messages: [...messages],
      // `any` makes Claude call a tool every turn, so it can't end with plain text.
      toolConfig: { tools, toolChoice: { any: {} } },
      inferenceConfig: {
        temperature: BEDROCK_DEFAULTS.temperature,
        maxTokens: BEDROCK_DEFAULTS.maxTokens,
      },
    });

    let response: ConverseCommandOutput;
    try {
      response = await o.client.send(command, { abortSignal: o.signal });
    } catch (err) {
      if (o.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        throw new AgentError('aborted', `Aborted during turn ${turn}`, { cause: err });
      }
      const detail = err instanceof Error ? err.message : String(err);
      throw new AgentError('model_error', `Bedrock call failed: ${detail}`, { cause: err });
    }

    const reply = response.output?.message;
    if (!reply) throw new AgentError('model_error', `Turn ${turn}: response has no message`);
    messages.push(reply);

    const toolUses = (reply.content ?? []).flatMap((b) => (b.toolUse ? [b.toolUse] : []));
    if (toolUses.length === 0) {
      throw new AgentError(
        'no_submit',
        `Turn ${turn}: model stopped (${response.stopReason ?? 'unknown'}) without calling submit_alert`,
      );
    }

    const results: ToolResultBlock[] = [];
    let submission: SubmitAlertInput | undefined;
    let submitError: string | undefined;

    for (const use of toolUses) {
      const name = use.name ?? '';
      if (name === 'submit_alert') {
        const parsed = SubmitAlertSchema.safeParse(use.input);
        if (parsed.success) {
          submission ??= parsed.data;
          results.push(okResult(use.toolUseId, { accepted: true }));
        } else {
          submitError = z.prettifyError(parsed.error);
          results.push(errorResult(use.toolUseId, `Invalid submit_alert input:\n${submitError}`));
        }
        continue;
      }

      const exec = executeTool(name, use.input, o.ctx);
      trace.push({
        tool: name,
        input: use.input,
        output: exec.ok ? exec.output : { error: exec.error },
      });
      results.push(
        exec.ok ? okResult(use.toolUseId, exec.output) : errorResult(use.toolUseId, exec.error),
      );
    }

    if (submission) return { submission, trace, turns: turn };
    if (submitError !== undefined && turn === maxTurns) {
      throw new AgentError('invalid_submit', `Last submit_alert was invalid:\n${submitError}`);
    }
    messages.push({ role: 'user', content: results });
  }

  throw new AgentError('max_turns', `No valid submit_alert after ${maxTurns} turns`);
}
