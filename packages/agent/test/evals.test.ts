/**
 * A3 – Agent evals (owner: Saransh). End to end through runAgent:
 *   calm -> null, partial -> null, escalation -> grounded alert with a trace, reopened -> null.
 *
 * Runs with the scripted stub model in CI. Set RUN_BEDROCK=1 (plus BEDROCK_MODEL_ID and AWS
 * credentials) to run the same evals against real Claude on Bedrock.
 */
import { describe, expect, it } from 'vitest';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { AlertCardDataSchema, type DemoEvent } from '@gridrisk/shared';
import { ESCALATION_ENGINE_RESULT, SHELTERS, ZONE_A } from '@gridrisk/shared/fixtures';
import { analyze, buildScenario } from '@gridrisk/engine';
import {
  BEDROCK_DEFAULTS,
  buildTemplateAlert,
  checkGrounding,
  runAgent,
  type ConverseClient,
} from '../src';
import { createStubModel } from '../scripts/stub-model';

const NOW = new Date('2026-10-23T14:15:00.000Z');

// TODO(Tanisha): switch to buildScenario('partial' | 'reopened') once the engine adds them.
/** Outage and 911 calls, but the bridge is still open: not isolated. */
const partialEvents = (): DemoEvent[] =>
  buildScenario('escalation').filter((e) => e.type !== 'road_closure');

/** Escalation, but the bridge closure has since been downgraded to a low-severity reopening. */
const reopenedEvents = (): DemoEvent[] =>
  buildScenario('escalation').map((e) =>
    e.id === 'evt-closure-bridge'
      ? { ...e, severity: 'low', description: 'Buffalo Bayou access bridge reopened' }
      : e,
  );

function evals(label: string, makeClient: () => ConverseClient, modelId: string) {
  const deps = () => ({ bedrockClient: makeClient(), modelId, now: () => NOW });
  const run = (events: DemoEvent[]) => runAgent({ zoneId: ZONE_A.id, events }, deps());

  describe(label, () => {
    it('calm -> null', async () => {
      expect(await run(buildScenario('calm'))).toBeNull();
    });

    it('partial (bridge open) -> null', async () => {
      expect(await run(partialEvents())).toBeNull();
    });

    it('reopened bridge -> null', async () => {
      expect(await run(reopenedEvents())).toBeNull();
    });

    it('escalation -> grounded alert with a tool trace', async () => {
      const events = buildScenario('escalation');
      const alert = await run(events);
      expect(alert).not.toBeNull();
      const parsed = AlertCardDataSchema.parse(alert);

      // A trace proves the model path ran rather than the template fallback.
      expect(parsed.toolTrace?.length).toBeGreaterThan(0);
      expect(parsed.toolTrace?.at(-1)?.tool).not.toBe('submit_alert');

      const result = analyze(events, [ZONE_A], { shelters: SHELTERS }).find(
        (r) => r.zoneId === ZONE_A.id,
      )!;
      expect(checkGrounding(parsed, result, { zone: ZONE_A, shelters: SHELTERS })).toEqual({
        ok: true,
        errors: [],
      });

      // Ids and numbers come from the engine, not the model.
      const template = buildTemplateAlert(result, { zone: ZONE_A, shelters: SHELTERS, now: NOW });
      expect(parsed.isolationWindowMinutes).toBe(ESCALATION_ENGINE_RESULT.isolationWindowMinutes);
      expect(parsed.relatedEventIds).toEqual(template.relatedEventIds);
      expect(parsed.status).toBe('pending');
      expect(parsed.title).toMatch(/ZONE A/i);
      expect(parsed.points.join(' ')).toContain(String(result.dependentPatients));
      for (const action of parsed.proposedActions) {
        expect(['activate_shelter', 'dispatch_drone', 'send_alert']).toContain(action.type);
      }
    }, 30_000);
  });
}

evals('evals: stub model', () => createStubModel(), 'stub');

const modelId = process.env.BEDROCK_MODEL_ID ?? '';
describe.runIf(process.env.RUN_BEDROCK === '1' && modelId !== '')('real Bedrock', () => {
  evals(
    `evals: ${modelId}`,
    () => new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? BEDROCK_DEFAULTS.region }),
    modelId,
  );
});
