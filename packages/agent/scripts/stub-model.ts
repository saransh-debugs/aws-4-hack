/**
 * A3 – Scripted fake Claude (owner: Saransh) for offline demos and tests.
 *
 * Stateless: each call looks at how many assistant turns are already in the conversation.
 *   turn 1: get_active_events + correlate_zone + check_isolation
 *   turn 2: get_dependent_patients + find_shelters + compute_isolation_window
 *   turn 3: submit_alert, worded from the tool results it was sent
 * `hallucinate: true` writes a made-up patient count (500) so the grounding check and the
 * template fallback can be demoed.
 */
import type {
  ContentBlock,
  ConverseCommand,
  ConverseCommandOutput,
  Message,
} from '@aws-sdk/client-bedrock-runtime';
import type { ActionType } from '@gridrisk/shared';
import type { BedrockDocument, ConverseClient } from '../src/bedrock';
import type { SubmitAlertInput } from '../src/submit';
import { formatDuration } from '../src/template';

export interface StubModelOptions {
  hallucinate?: boolean;
}

export const HALLUCINATED_PATIENTS = 500;

type ToolOutputs = Record<string, Record<string, unknown> | undefined>;

function firstText(messages: Message[]): string {
  return messages[0]?.content?.find((b) => b.text !== undefined)?.text ?? '';
}

/** Tool name -> latest successful JSON output, matched through toolUseId. */
function collectOutputs(messages: Message[]): ToolOutputs {
  const names = new Map<string, string>();
  const outputs: ToolOutputs = {};
  for (const m of messages) {
    for (const b of m.content ?? []) {
      if (b.toolUse?.toolUseId && b.toolUse.name) names.set(b.toolUse.toolUseId, b.toolUse.name);
      const r = b.toolResult;
      if (r?.toolUseId && r.status !== 'error') {
        const json = r.content?.find((c) => c.json !== undefined)?.json;
        const name = names.get(r.toolUseId);
        if (name && json && typeof json === 'object')
          outputs[name] = json as Record<string, unknown>;
      }
    }
  }
  return outputs;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

function compose(zoneName: string, out: ToolOutputs, hallucinate: boolean): SubmitAlertInput {
  const isolation = out.check_isolation;
  const correlation = out.correlate_zone;
  const patients = hallucinate
    ? HALLUCINATED_PATIENTS
    : num(out.get_dependent_patients?.dependentPatients);
  const window = out.compute_isolation_window;
  const shelterCount = len(out.find_shelters?.shelters);

  const points: string[] = [];
  const closed = len(isolation?.closedAccessRoadIds);
  if (isolation?.isolated === true) {
    points.push(
      closed === 1
        ? `Flooding has closed the only access road into ${zoneName}.`
        : `Flooding has closed every access road into ${zoneName}.`,
    );
  }
  if (len(correlation?.outageEventIds) > 0) points.push(`Power is out across ${zoneName}.`);
  const calls = len(correlation?.emergencyEventIds);
  if (calls > 0) points.push(`${calls} water-rescue 911 calls are open in the zone.`);
  if (patients !== undefined) {
    const backup = num(window?.avgBackupMinutes);
    points.push(
      backup === undefined
        ? `${patients} electricity-dependent patients live here.`
        : `${patients} electricity-dependent patients live here, with an assumed backup of ${formatDuration(backup)}.`,
    );
  }
  const minutes = num(window?.isolationWindowMinutes);
  if (minutes !== undefined) {
    points.push(
      `About ${minutes} minutes remain before backup power runs out (assumed response time).`,
    );
  }

  const actionTypes: ActionType[] = [
    ...(shelterCount > 0 ? (['activate_shelter'] as const) : []),
    'dispatch_drone',
    'send_alert',
  ];
  return {
    title: `${zoneName.toUpperCase()} ISOLATED: ACTION REQUIRED`,
    points: points.length > 0 ? points : [`${zoneName} needs review.`],
    actionTypes,
  };
}

function reply(turn: number, calls: [name: string, input: object][]): ContentBlock[] {
  return calls.map(([name, input], i) => ({
    toolUse: { toolUseId: `stub-${turn}-${i}`, name, input: input as BedrockDocument },
  }));
}

export function createStubModel(o: StubModelOptions = {}): ConverseClient {
  return {
    async send(cmd: ConverseCommand, opts?: { abortSignal?: AbortSignal }) {
      if (opts?.abortSignal?.aborted) {
        throw Object.assign(new Error('Request aborted'), { name: 'AbortError' });
      }
      const messages = cmd.input.messages ?? [];
      const prompt = firstText(messages);
      const zoneId = /zoneId: "([^"]+)"/.exec(prompt)?.[1] ?? '';
      const zoneName = /zoneName: "([^"]+)"/.exec(prompt)?.[1] ?? zoneId;
      const turn = messages.filter((m) => m.role === 'assistant').length + 1;
      const z = { zoneId };

      let content: ContentBlock[];
      if (turn === 1) {
        content = reply(turn, [
          ['get_active_events', z],
          ['correlate_zone', z],
          ['check_isolation', z],
        ]);
      } else if (turn === 2) {
        content = reply(turn, [
          ['get_dependent_patients', z],
          ['find_shelters', z],
          ['compute_isolation_window', z],
        ]);
      } else {
        const submission = compose(zoneName, collectOutputs(messages), o.hallucinate ?? false);
        content = reply(turn, [['submit_alert', submission]]);
      }

      const output: ConverseCommandOutput = {
        $metadata: { httpStatusCode: 200 },
        output: { message: { role: 'assistant', content } },
        stopReason: 'tool_use',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        metrics: { latencyMs: 0 },
      };
      return output;
    },
  };
}
