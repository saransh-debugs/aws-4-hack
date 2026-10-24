/**
 * A3 – Scripted fake Claude (owner: Saransh) for offline demos and tests.
 *
 * A0 STUB: immediately calls submit_alert with SAMPLE_ALERT's wording.
 * TODO(Saransh): investigate with the tools first; `hallucinate` writes a made-up number.
 */
import type { ConverseCommand, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { SAMPLE_ALERT } from '@gridrisk/shared/fixtures';
import type { BedrockDocument, ConverseClient } from '../src/bedrock';

export interface StubModelOptions {
  hallucinate?: boolean;
}

export const HALLUCINATED_PATIENTS = 500;

export function createStubModel(_o: StubModelOptions = {}): ConverseClient {
  return {
    async send(_cmd: ConverseCommand): Promise<ConverseCommandOutput> {
      const input = {
        title: SAMPLE_ALERT.title,
        points: SAMPLE_ALERT.points,
        actionTypes: SAMPLE_ALERT.proposedActions.map((a) => a.type),
      };
      return {
        $metadata: { httpStatusCode: 200 },
        output: {
          message: {
            role: 'assistant',
            content: [
              {
                toolUse: {
                  toolUseId: 'stub-1-0',
                  name: 'submit_alert',
                  input: input as unknown as BedrockDocument,
                },
              },
            ],
          },
        },
        stopReason: 'tool_use',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        metrics: { latencyMs: 0 },
      };
    },
  };
}
