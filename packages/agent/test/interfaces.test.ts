/** A0: every frozen agent interface is importable and its stub returns contract-valid data. */
import { describe, expect, it } from 'vitest';
import { AlertCardDataSchema } from '@gridrisk/shared';
import {
  ESCALATION_ENGINE_RESULT,
  SAMPLE_ALERT,
  SHELTERS,
  ZONE_A,
  ZONES,
} from '@gridrisk/shared/fixtures';
import { DEFAULT_CONFIG, buildScenario, dependentPatients } from '@gridrisk/engine';
import {
  AgentError,
  assembleAlert,
  buildProposedActions,
  checkGrounding,
  executeTool,
  runBedrockLoop,
  SubmitAlertSchema,
  TOOL_NAMES,
  TOOL_SPECS,
  type ToolContext,
} from '../src';
import { handler } from '../src/handler';
import { createStubModel } from '../scripts/stub-model';

const ctx: ToolContext = {
  events: buildScenario('escalation'),
  zones: ZONES,
  shelters: SHELTERS,
  config: DEFAULT_CONFIG,
};
const submission = SubmitAlertSchema.parse({
  title: SAMPLE_ALERT.title,
  points: SAMPLE_ALERT.points,
  actionTypes: ['activate_shelter', 'dispatch_drone'],
});

describe('A1 tools (stub)', () => {
  it('has a Bedrock spec for every tool name, without $schema', () => {
    expect(TOOL_SPECS.map((s) => s.name)).toEqual([...TOOL_NAMES]);
    for (const spec of TOOL_SPECS) expect(spec.inputSchema?.json).not.toHaveProperty('$schema');
  });

  it('returns live engine data for a known zone', () => {
    expect(executeTool('get_dependent_patients', { zoneId: ZONE_A.id }, ctx)).toEqual({
      ok: true,
      output: { zoneId: ZONE_A.id, dependentPatients: dependentPatients(ZONE_A) },
    });
  });

  it('returns errors instead of throwing', () => {
    expect(executeTool('nope', {}, ctx).ok).toBe(false);
    expect(executeTool('check_isolation', { zoneId: 'zone-z' }, ctx).ok).toBe(false);
    expect(executeTool('check_isolation', { zoneId: 42 }, ctx).ok).toBe(false);
  });
});

describe('A2 output and grounding (stub)', () => {
  const opts = { zone: ZONE_A, shelters: SHELTERS, now: new Date(SAMPLE_ALERT.createdAt) };

  it('builds actions with stable ids', () => {
    const actions = buildProposedActions(['activate_shelter', 'dispatch_drone', 'send_alert'], {
      ...opts,
      result: ESCALATION_ENGINE_RESULT,
    });
    expect(actions.map((a) => a.id)).toEqual([
      'act-shelter-b',
      'act-drone-zone-a',
      'act-alert-zone-a',
    ]);
  });

  it('assembles a parseable alert that passes grounding', () => {
    const alert = assembleAlert(submission, ESCALATION_ENGINE_RESULT, {
      ...opts,
      id: SAMPLE_ALERT.id,
    });
    expect(AlertCardDataSchema.parse(alert)).toEqual(SAMPLE_ALERT);
    expect(checkGrounding(alert, ESCALATION_ENGINE_RESULT, opts).ok).toBe(true);
  });
});

describe('A3 loop (stub)', () => {
  it('returns a valid submission', async () => {
    const out = await runBedrockLoop({
      client: createStubModel(),
      modelId: 'stub',
      zone: ZONE_A,
      ctx,
    });
    expect(SubmitAlertSchema.parse(out.submission)).toEqual(out.submission);
  });

  it('AgentError carries a code', () => {
    expect(new AgentError('timeout', 'slow').code).toBe('timeout');
  });
});

describe('A4 handler (stub)', () => {
  it('rejects bad input and returns null for calm', async () => {
    await expect(handler({ zoneId: '' })).rejects.toThrow();
    expect(await handler({ zoneId: ZONE_A.id, events: buildScenario('calm') })).toEqual({
      alert: null,
    });
  });

  it('returns an alert for escalation', async () => {
    const { alert } = await handler({ zoneId: ZONE_A.id, events: buildScenario('escalation') });
    expect(AlertCardDataSchema.parse(alert).zoneId).toBe(ZONE_A.id);
  });
});
