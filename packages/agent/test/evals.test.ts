/**
 * A3 – Agent evals (owner: Saransh). End to end through runAgent:
 *   calm, partial, reopened -> null; escalation, zone-b, multi-zone, storm -> a grounded alert
 *   (with a trace) for exactly the zones the engine finds isolated.
 *
 * Runs with the scripted stub model in CI. Set RUN_BEDROCK=1 (plus BEDROCK_MODEL_ID and AWS
 * credentials) to run the same evals against real Claude on Bedrock.
 */
import { describe, expect, it } from 'vitest';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import {
  AlertCardDataSchema,
  type DemoEvent,
  type ScenarioName,
  type Zone,
} from '@gridrisk/shared';
import { SHELTERS, ZONE_A, ZONE_B, ZONES } from '@gridrisk/shared/fixtures';
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

function evals(label: string, makeClient: () => ConverseClient, modelId: string) {
  const deps = () => ({ bedrockClient: makeClient(), modelId, now: () => NOW });
  const run = (events: DemoEvent[]) => runAgent({ zoneId: ZONE_A.id, events }, deps());

  describe(label, () => {
    it('calm -> null', async () => {
      expect(await run(buildScenario('calm'))).toBeNull();
    });

    it('partial (bridge open) -> null', async () => {
      expect(await run(buildScenario('partial'))).toBeNull();
    });

    it('reopened bridge -> null', async () => {
      expect(await run(buildScenario('reopened'))).toBeNull();
    });

    /** Runs the agent for one zone and checks the alert is model-written and fully grounded. */
    async function expectGroundedAlert(scenario: ScenarioName, zone: Zone) {
      const events = buildScenario(scenario);
      const alert = await runAgent({ zoneId: zone.id, events }, deps());
      expect(alert, `${scenario}/${zone.id}`).not.toBeNull();
      const parsed = AlertCardDataSchema.parse(alert);

      // A trace proves the model path ran rather than the template fallback.
      expect(parsed.toolTrace?.length).toBeGreaterThan(0);
      expect(parsed.toolTrace?.at(-1)?.tool).not.toBe('submit_alert');

      const result = analyze(events, ZONES, { shelters: SHELTERS }).find(
        (r) => r.zoneId === zone.id,
      )!;
      expect(checkGrounding(parsed, result, { zone, shelters: SHELTERS })).toEqual({
        ok: true,
        errors: [],
      });

      // Ids and numbers come from the engine, not the model.
      const template = buildTemplateAlert(result, { zone, shelters: SHELTERS, now: NOW });
      expect(parsed.zoneId).toBe(zone.id);
      expect(parsed.isolationWindowMinutes).toBe(result.isolationWindowMinutes);
      expect(parsed.relatedEventIds).toEqual(template.relatedEventIds);
      expect(parsed.status).toBe('pending');
      expect(parsed.title.toUpperCase()).toContain(zone.name.toUpperCase());
      expect(parsed.points.join(' ')).toContain(String(result.dependentPatients));
      for (const action of parsed.proposedActions) {
        expect(['activate_shelter', 'dispatch_drone', 'send_alert']).toContain(action.type);
      }
    }

    it('escalation -> grounded alert with a tool trace', async () => {
      await expectGroundedAlert('escalation', ZONE_A);
      expect(
        await runAgent({ zoneId: ZONE_B.id, events: buildScenario('escalation') }, deps()),
      ).toBeNull();
    }, 30_000);

    it('zone-b -> grounded Zone B alert (real emPOWER count), Zone A quiet', async () => {
      await expectGroundedAlert('zone-b', ZONE_B);
      expect(await run(buildScenario('zone-b'))).toBeNull();
    }, 30_000);

    it('multi-zone -> a grounded alert for each zone', async () => {
      await Promise.all([
        expectGroundedAlert('multi-zone', ZONE_A),
        expectGroundedAlert('multi-zone', ZONE_B),
      ]);
    }, 60_000);

    it('storm -> Zone A alert through the noise; Zone B (route open) quiet', async () => {
      await expectGroundedAlert('storm', ZONE_A);
      expect(
        await runAgent({ zoneId: ZONE_B.id, events: buildScenario('storm') }, deps()),
      ).toBeNull();
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
