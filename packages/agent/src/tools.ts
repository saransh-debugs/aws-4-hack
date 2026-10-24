/**
 * A1 – Tool registry (owner: Tanisha).
 *
 * Each tool wraps a deterministic @gridrisk/engine function. The model can only *read* via
 * these tools and *propose* via submit_alert – it never dispatches anything (a human
 * approves through Step Functions).
 *
 * One zod input schema per tool: the same schema generates the Bedrock JSON spec
 * (`z.toJSONSchema`, minus the `$schema` key) and validates the model's input in
 * `executeTool`, so the model can never pass a number into the engine.
 *
 * Output shapes:
 *   get_active_events        -> { events: DemoEvent[] }
 *   correlate_zone           -> ZoneCorrelation
 *   check_isolation          -> IsolationResult (over the zone's correlated closures)
 *   get_dependent_patients   -> { zoneId, dependentPatients }
 *   find_shelters            -> { shelters: Shelter[] }
 *   compute_isolation_window -> { avgBackupMinutes, estimatedResponseMinutes, isolationWindowMinutes }
 *   submit_alert             -> handled by the Converse loop (./bedrock), never executed here
 */
import { z } from 'zod';
import type { ToolSpecification } from '@aws-sdk/client-bedrock-runtime';
import type { DemoEvent, Shelter, Zone } from '@gridrisk/shared';
import { analyze, type EngineConfig } from '@gridrisk/engine';
import { SubmitAlertSchema } from './submit';

export const TOOL_NAMES = [
  'get_active_events',
  'correlate_zone',
  'check_isolation',
  'get_dependent_patients',
  'find_shelters',
  'compute_isolation_window',
  'submit_alert',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export function isToolName(name: unknown): name is ToolName {
  return typeof name === 'string' && (TOOL_NAMES as readonly string[]).includes(name);
}

export interface ToolContext {
  events: DemoEvent[];
  zones: Zone[];
  shelters: Shelter[];
  config: EngineConfig;
}

export type ToolExecution =
  { ok: true; output: Record<string, unknown> } | { ok: false; error: string };

// ---------- One zod input schema per tool ----------

const zoneIdField = z.string().describe('Zone id, e.g. "zone-a"');

/** Most investigation tools take just the zone id. */
const ZoneInput = z.object({ zoneId: zoneIdField });

/** get_active_events may list every active event, or narrow to one zone. */
const ActiveEventsInput = z.object({ zoneId: zoneIdField.optional() });

/**
 * compute_isolation_window takes NO numbers from the model – the window is derived from
 * `ctx.config` alone. It still accepts the zone id so the model's call shape is uniform.
 */
const IsolationWindowInput = z.object({ zoneId: zoneIdField });

/** Input schema used both for the Bedrock spec and for runtime validation, per tool. */
const INPUT_SCHEMAS: Record<Exclude<ToolName, 'submit_alert'>, z.ZodType> = {
  get_active_events: ActiveEventsInput,
  correlate_zone: ZoneInput,
  check_isolation: ZoneInput,
  get_dependent_patients: ZoneInput,
  find_shelters: ZoneInput,
  compute_isolation_window: IsolationWindowInput,
};

/** JSON schema for Bedrock, without the `$schema` key (Bedrock rejects it). */
function toInputSchema(schema: z.ZodType): ToolSpecification['inputSchema'] {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema) as Record<string, unknown>;
  return { json: json as Record<string, never> };
}

const DESCRIPTIONS: Record<ToolName, string> = {
  get_active_events:
    'List active events (outages, road closures, weather), optionally for one zone.',
  correlate_zone: 'Group the outage and road-closure event ids that belong to a zone.',
  check_isolation: 'Check whether every access road into the zone is closed.',
  get_dependent_patients: 'Count electricity-dependent patients in the zone (HHS emPOWER).',
  find_shelters: 'List shelters that can take evacuees from the zone, best first.',
  compute_isolation_window:
    'Minutes left before patient backup power runs out, after the assumed response time.',
  submit_alert:
    'Final step. Propose an alert for a human to approve: a title, short points and action types. Do not include ids.',
};

export const TOOL_SPECS: ToolSpecification[] = TOOL_NAMES.map((name) => ({
  name,
  description: DESCRIPTIONS[name],
  inputSchema: toInputSchema(name === 'submit_alert' ? SubmitAlertSchema : INPUT_SCHEMAS[name]),
}));

/**
 * Run one tool. Never throws: unknown tools, unknown zones and bad input return `{ ok: false }`.
 *
 * Answers come from the deterministic engine run over `ctx`, so the model sees the same numbers
 * the grounding check uses.
 */
export function executeTool(name: string, input: unknown, ctx: ToolContext): ToolExecution {
  if (!isToolName(name) || name === 'submit_alert') {
    return { ok: false, error: `Unknown tool: ${name}` };
  }

  const parsed = INPUT_SCHEMAS[name].safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const { zoneId } = parsed.data as { zoneId?: string };
  if (zoneId !== undefined && !ctx.zones.some((z) => z.id === zoneId)) {
    return { ok: false, error: `Unknown zone: ${zoneId}` };
  }

  if (name === 'get_active_events') {
    return {
      ok: true,
      output: { events: ctx.events.filter((e) => !zoneId || e.zoneId === zoneId) },
    };
  }

  // A zone with no correlated events has no engine result: report it as quiet.
  const r = analyze(ctx.events, ctx.zones, { config: ctx.config, shelters: ctx.shelters }).find(
    (x) => x.zoneId === zoneId,
  ) ?? {
    zoneId: zoneId!,
    isolated: false,
    closedAccessRoadIds: [],
    outageEventIds: [],
    closureEventIds: [],
    emergencyEventIds: [],
    dependentPatients: 0,
    avgBackupMinutes: ctx.config.avgBackupMinutes,
    estimatedResponseMinutes: ctx.config.estimatedResponseMinutes,
    isolationWindowMinutes: 0,
    candidateShelterIds: [],
  };
  switch (name) {
    case 'correlate_zone':
      return {
        ok: true,
        output: {
          zoneId: r.zoneId,
          outageEventIds: r.outageEventIds,
          closureEventIds: r.closureEventIds,
          emergencyEventIds: r.emergencyEventIds,
        },
      };
    case 'check_isolation':
      // Uses the closure events `correlate` found for this zone (via `analyze`).
      return {
        ok: true,
        output: { isolated: r.isolated, closedAccessRoadIds: r.closedAccessRoadIds },
      };
    case 'get_dependent_patients':
      return { ok: true, output: { zoneId: r.zoneId, dependentPatients: r.dependentPatients } };
    case 'find_shelters':
      return {
        ok: true,
        output: { shelters: ctx.shelters.filter((s) => r.candidateShelterIds.includes(s.id)) },
      };
    case 'compute_isolation_window':
      // No numbers come from the model; the window is derived from ctx.config only.
      return {
        ok: true,
        output: {
          avgBackupMinutes: r.avgBackupMinutes,
          estimatedResponseMinutes: r.estimatedResponseMinutes,
          isolationWindowMinutes: r.isolationWindowMinutes,
        },
      };
  }
}
