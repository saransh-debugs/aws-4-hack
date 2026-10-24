import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ConverseCommandOutput,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';
import { DEFAULT_CONFIG, buildScenario, dependentPatients } from '@gridrisk/engine';
import { SHELTERS, ZONE_A, ZONES } from '@gridrisk/shared/fixtures';
import {
  AgentError,
  BEDROCK_DEFAULTS,
  runBedrockLoop,
  type BedrockDocument,
  type ToolContext,
} from '../src';
import { createStubModel, HALLUCINATED_PATIENTS } from '../scripts/stub-model';

const bedrock = mockClient(BedrockRuntimeClient);
const client = new BedrockRuntimeClient({ region: BEDROCK_DEFAULTS.region });
const ctx: ToolContext = {
  events: buildScenario('escalation'),
  zones: ZONES,
  shelters: SHELTERS,
  config: DEFAULT_CONFIG,
};
const zone = { id: ZONE_A.id, name: ZONE_A.name };
const MODEL = 'test-model';
/** Real engine count (HHS emPOWER snapshot), not a hard-coded fixture. */
const PATIENTS = dependentPatients(ZONE_A);

const SUBMISSION = {
  title: 'ZONE A ISOLATED: ACTION REQUIRED',
  points: [`${PATIENTS} electricity-dependent patients.`, 'About 45 minutes remain.'],
  actionTypes: ['activate_shelter', 'dispatch_drone'],
};

let ids = 0;
const use = (name: string, input: object = { zoneId: ZONE_A.id }): ContentBlock => ({
  toolUse: { toolUseId: `tu-${++ids}`, name, input: input as BedrockDocument },
});

function turn(...content: ContentBlock[]): ConverseCommandOutput {
  return {
    $metadata: {},
    output: { message: { role: 'assistant', content } },
    stopReason: content.some((b) => b.toolUse) ? 'tool_use' : 'end_turn',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    metrics: { latencyMs: 1 },
  };
}

const run = (extra: Partial<Parameters<typeof runBedrockLoop>[0]> = {}) =>
  runBedrockLoop({ client, modelId: MODEL, zone, ctx, ...extra });

/** The messages sent on the n-th call (0-based). */
const sentMessages = (n: number): Message[] =>
  (bedrock.commandCalls(ConverseCommand)[n]?.args[0].input.messages ?? []) as Message[];

const lastToolResults = (n: number) =>
  (sentMessages(n).at(-1)?.content ?? []).flatMap((b) => (b.toolResult ? [b.toolResult] : []));

async function agentError(p: Promise<unknown>): Promise<AgentError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AgentError);
  return err as AgentError;
}

beforeEach(() => {
  bedrock.reset();
  ids = 0;
});

describe('runBedrockLoop', () => {
  it('runs a scripted tool sequence and returns the submission and trace', async () => {
    bedrock
      .on(ConverseCommand)
      .resolvesOnce(turn({ text: 'Looking.' }, use('correlate_zone'), use('check_isolation')))
      .resolvesOnce(turn(use('get_dependent_patients')))
      .resolvesOnce(turn(use('submit_alert', SUBMISSION)));

    const out = await run();

    expect(out.turns).toBe(3);
    expect(out.submission).toEqual(SUBMISSION);
    expect(out.trace.map((t) => t.tool)).toEqual([
      'correlate_zone',
      'check_isolation',
      'get_dependent_patients',
    ]);
    expect(out.trace[2]).toEqual({
      tool: 'get_dependent_patients',
      input: { zoneId: 'zone-a' },
      output: { zoneId: 'zone-a', dependentPatients: PATIENTS },
    });

    // Both toolUses of turn 1 come back together in one user message.
    const second = sentMessages(1);
    expect(second.at(-1)?.role).toBe('user');
    expect(lastToolResults(1).map((r) => [r.toolUseId, r.status])).toEqual([
      ['tu-1', 'success'],
      ['tu-2', 'success'],
    ]);
  });

  it('sends model id, temperature 0, system prompt and all 7 tools', async () => {
    bedrock.on(ConverseCommand).resolves(turn(use('submit_alert', SUBMISSION)));
    await run();

    const input = bedrock.commandCalls(ConverseCommand)[0]!.args[0].input;
    expect(input.modelId).toBe(MODEL);
    expect(input.inferenceConfig?.temperature).toBe(0);
    expect(input.system?.[0]?.text).toMatch(/never dispatch/i);
    expect(input.toolConfig?.tools).toHaveLength(7);
    expect(input.messages?.[0]?.content?.[0]?.text).toContain('zoneId: "zone-a"');
  });

  it('stops at the turn cap', async () => {
    bedrock.on(ConverseCommand).resolves(turn(use('get_active_events')));

    const err = await agentError(run());
    expect(err.code).toBe('max_turns');
    expect(bedrock.commandCalls(ConverseCommand)).toHaveLength(BEDROCK_DEFAULTS.maxTurns);
  });

  it('honours a custom maxTurns', async () => {
    bedrock.on(ConverseCommand).resolves(turn(use('get_active_events')));
    expect((await agentError(run({ maxTurns: 2 }))).code).toBe('max_turns');
    expect(bedrock.commandCalls(ConverseCommand)).toHaveLength(2);
  });

  it('returns an error toolResult for an unknown tool and keeps going', async () => {
    bedrock
      .on(ConverseCommand)
      .resolvesOnce(turn(use('launch_missiles')))
      .resolvesOnce(turn(use('submit_alert', SUBMISSION)));

    const out = await run();
    expect(out.submission).toEqual(SUBMISSION);
    expect(out.trace).toEqual([
      {
        tool: 'launch_missiles',
        input: { zoneId: 'zone-a' },
        output: { error: 'Unknown tool: launch_missiles' },
      },
    ]);
    const [result] = lastToolResults(1);
    expect(result?.status).toBe('error');
    expect(result?.content?.[0]?.text).toContain('Unknown tool');
  });

  it('lets Claude retry after an invalid submission', async () => {
    bedrock
      .on(ConverseCommand)
      .resolvesOnce(turn(use('submit_alert', { title: 'X', points: [], actionTypes: ['nuke'] })))
      .resolvesOnce(turn(use('submit_alert', SUBMISSION)));

    const out = await run();
    expect(out.turns).toBe(2);
    expect(out.submission).toEqual(SUBMISSION);
    const [result] = lastToolResults(1);
    expect(result?.status).toBe('error');
    expect(result?.content?.[0]?.text).toContain('Invalid submit_alert');
  });

  it('throws invalid_submit when the last turn submits bad input', async () => {
    bedrock.on(ConverseCommand).resolves(turn(use('submit_alert', { title: 'only a title' })));
    expect((await agentError(run({ maxTurns: 2 }))).code).toBe('invalid_submit');
  });

  it('throws no_submit when the model ends without calling submit_alert', async () => {
    bedrock
      .on(ConverseCommand)
      .resolvesOnce(turn(use('check_isolation')))
      .resolvesOnce(turn({ text: 'Zone A looks isolated.' }));

    expect((await agentError(run())).code).toBe('no_submit');
  });

  it('wraps SDK errors as model_error', async () => {
    bedrock.on(ConverseCommand).rejects(new Error('ThrottlingException'));
    const err = await agentError(run());
    expect(err.code).toBe('model_error');
    expect(err.message).toContain('ThrottlingException');
  });

  it('passes the abort signal to client.send', async () => {
    bedrock.on(ConverseCommand).resolves(turn(use('submit_alert', SUBMISSION)));
    const controller = new AbortController();
    await run({ signal: controller.signal });
    // The sinon stub types `send` with one arg; the SDK passes options as the second.
    const [, options] = bedrock.send.firstCall.args as unknown[];
    expect(options).toEqual({ abortSignal: controller.signal });
  });

  it('throws aborted when the signal fires during a call', async () => {
    const controller = new AbortController();
    bedrock
      .on(ConverseCommand)
      .resolvesOnce(turn(use('check_isolation')))
      .callsFake(() => {
        controller.abort();
        throw Object.assign(new Error('Request aborted'), { name: 'AbortError' });
      });

    expect((await agentError(run({ signal: controller.signal }))).code).toBe('aborted');
    expect(bedrock.commandCalls(ConverseCommand)).toHaveLength(2);
  });

  it('throws aborted without calling Bedrock when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await agentError(run({ signal: controller.signal }))).code).toBe('aborted');
    expect(bedrock.commandCalls(ConverseCommand)).toHaveLength(0);
  });
});

describe('createStubModel', () => {
  it('investigates with every tool, then submits a grounded alert', async () => {
    const out = await runBedrockLoop({ client: createStubModel(), modelId: 'stub', zone, ctx });

    expect(out.turns).toBe(3);
    expect(out.trace.map((t) => t.tool)).toEqual([
      'get_active_events',
      'correlate_zone',
      'check_isolation',
      'get_dependent_patients',
      'find_shelters',
      'compute_isolation_window',
    ]);
    expect(out.trace.every((t) => !('error' in (t.output as object)))).toBe(true);
    expect(out.submission.title).toBe('ZONE A ISOLATED: ACTION REQUIRED');
    const text = out.submission.points.join(' ');
    expect(text).toContain(`${PATIENTS} electricity-dependent patients`);
    expect(text).toContain('2 hours');
    expect(text).toContain('45 minutes');
    expect(out.submission.actionTypes).toEqual([
      'activate_shelter',
      'dispatch_drone',
      'send_alert',
    ]);
  });

  it('writes a made-up patient count when hallucinating', async () => {
    const out = await runBedrockLoop({
      client: createStubModel({ hallucinate: true }),
      modelId: 'stub',
      zone,
      ctx,
    });
    const text = out.submission.points.join(' ');
    expect(text).toContain(`${HALLUCINATED_PATIENTS} electricity-dependent patients`);
    expect(text).not.toContain(`${PATIENTS} electricity`);
  });

  it('respects an aborted signal', async () => {
    const controller = new AbortController();
    const send = createStubModel().send(new ConverseCommand({ modelId: 'stub', messages: [] }), {
      abortSignal: (controller.abort(), controller.signal),
    });
    await expect(send).rejects.toThrow('aborted');
  });
});
