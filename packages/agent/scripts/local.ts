/**
 * A4 – Local runner (owner: Darsh).
 *
 *   npm run agent:local -- <calm|escalation|partial|reopened> [--stub] [--hallucinate]
 *
 * Prints which path ran and the alert JSON:
 *   none     -> the zone is not isolated, so no alert is raised
 *   bedrock  -> a model-worded, grounded alert (has a toolTrace)
 *   template -> the deterministic fallback (no toolTrace)
 *
 * --stub         use the offline scripted model instead of real Bedrock
 * --hallucinate  make the stub invent a patient count, so the grounding fallback is demoed
 *
 * With `--stub`, no AWS call is made. Without it, set BEDROCK_MODEL_ID (and AWS creds, region
 * us-east-1) to exercise real Claude; with no model id the agent uses the template.
 */
import { ScenarioNameSchema, type ScenarioName } from '@gridrisk/shared';
import { ZONE_A } from '@gridrisk/shared/fixtures';
import { buildScenario } from '@gridrisk/engine';
import type { ConverseClient } from '../src/bedrock';
import { runAgent, type AgentLogger } from '../src/runAgent';
import { createStubModel } from './stub-model';

function parseArgs(argv: string[]): {
  scenario: ScenarioName;
  stub: boolean;
  hallucinate: boolean;
} {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const scenario = ScenarioNameSchema.parse(positional[0] ?? 'escalation');
  return {
    scenario,
    stub: flags.has('--stub'),
    hallucinate: flags.has('--hallucinate'),
  };
}

async function main(): Promise<void> {
  const { scenario, stub, hallucinate } = parseArgs(process.argv.slice(2));

  const logs: { path?: string } = {};
  const logger: AgentLogger = {
    info: (msg, data) => {
      if (data?.path) logs.path = String(data.path);
      console.error(`[info] ${msg}`, data ?? {});
    },
    warn: (msg, data) => {
      if (data?.path) logs.path = String(data.path);
      console.error(`[warn] ${msg}`, data ?? {});
    },
  };

  const bedrockClient: ConverseClient | undefined = stub
    ? createStubModel({ hallucinate })
    : undefined;
  // With --stub we always have a model id so the loop runs; otherwise fall back to env.
  const modelId = stub ? 'stub' : process.env.BEDROCK_MODEL_ID;

  const alert = await runAgent(
    { zoneId: ZONE_A.id, events: buildScenario(scenario) },
    { bedrockClient, modelId, logger },
  );

  const path = alert === null ? 'none' : (logs.path ?? (alert.toolTrace ? 'bedrock' : 'template'));

  console.log(`scenario=${scenario} path=${path}`);
  console.log(JSON.stringify(alert, null, 2));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
