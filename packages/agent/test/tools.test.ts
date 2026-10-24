/**
 * A1 – Tool registry tests (owner: Tanisha).
 *
 * Each tool's output equals a direct @gridrisk/engine call for the escalation scenario.
 * Unknown tool, unknown zone and bad input each return `{ ok: false }` without throwing.
 */
import { describe, expect, it } from 'vitest';
import { SHELTERS, ZONE_A, ZONES } from '@gridrisk/shared/fixtures';
import {
  analyze,
  checkIsolation,
  computeIsolationWindow,
  correlate,
  DEFAULT_CONFIG,
  dependentPatients,
  findShelters,
  buildScenario,
} from '@gridrisk/engine';
import { executeTool, TOOL_NAMES, TOOL_SPECS, type ToolContext } from '../src';

const events = buildScenario('escalation');
const ctx: ToolContext = { events, zones: ZONES, shelters: SHELTERS, config: DEFAULT_CONFIG };
const z = { zoneId: ZONE_A.id };
const engineResult = analyze(events, ZONES, { config: DEFAULT_CONFIG, shelters: SHELTERS }).find(
  (r) => r.zoneId === ZONE_A.id,
)!;

function expectOk(name: string, input: unknown): Record<string, unknown> {
  const out = executeTool(name, input, ctx);
  expect(out.ok).toBe(true);
  return (out as { ok: true; output: Record<string, unknown> }).output;
}

describe('TOOL_SPECS', () => {
  it('covers every tool name and drops $schema', () => {
    expect(TOOL_SPECS.map((s) => s.name)).toEqual([...TOOL_NAMES]);
    for (const spec of TOOL_SPECS) expect(spec.inputSchema?.json).not.toHaveProperty('$schema');
  });
});

describe('executeTool matches a direct engine call (escalation)', () => {
  it('get_active_events (all, then one zone)', () => {
    expect(expectOk('get_active_events', {})).toEqual({ events });
    expect(expectOk('get_active_events', z)).toEqual({
      events: events.filter((e) => e.zoneId === ZONE_A.id),
    });
  });

  it('correlate_zone', () => {
    const [c] = correlate(events, [ZONE_A]);
    expect(expectOk('correlate_zone', z)).toEqual({
      zoneId: c!.zoneId,
      outageEventIds: c!.outageEventIds,
      closureEventIds: c!.closureEventIds,
      emergencyEventIds: c!.emergencyEventIds,
    });
  });

  it('check_isolation (over the zone correlated closures)', () => {
    const byId = new Map(events.map((e) => [e.id, e]));
    const [c] = correlate(events, [ZONE_A]);
    const closures = c!.closureEventIds.map((id) => byId.get(id)!).filter(Boolean);
    const iso = checkIsolation(ZONE_A, closures);
    expect(expectOk('check_isolation', z)).toEqual({
      isolated: iso.isolated,
      closedAccessRoadIds: iso.closedAccessRoadIds,
    });
  });

  it('get_dependent_patients', () => {
    expect(expectOk('get_dependent_patients', z)).toEqual({
      zoneId: ZONE_A.id,
      dependentPatients: dependentPatients(ZONE_A),
    });
  });

  it('find_shelters', () => {
    expect(expectOk('find_shelters', z)).toEqual({ shelters: findShelters(ZONE_A, SHELTERS) });
  });

  it('compute_isolation_window (numbers from config, not the model)', () => {
    expect(expectOk('compute_isolation_window', z)).toEqual({
      avgBackupMinutes: DEFAULT_CONFIG.avgBackupMinutes,
      estimatedResponseMinutes: DEFAULT_CONFIG.estimatedResponseMinutes,
      isolationWindowMinutes: computeIsolationWindow(DEFAULT_CONFIG),
    });
    expect(engineResult.isolationWindowMinutes).toBe(computeIsolationWindow(DEFAULT_CONFIG));
  });
});

describe('executeTool error paths (never throws)', () => {
  it('unknown tool', () => {
    expect(executeTool('launch_missiles', z, ctx)).toEqual({
      ok: false,
      error: 'Unknown tool: launch_missiles',
    });
  });

  it('submit_alert is not executable here', () => {
    expect(executeTool('submit_alert', {}, ctx).ok).toBe(false);
  });

  it('unknown zone', () => {
    const out = executeTool('check_isolation', { zoneId: 'zone-z' }, ctx);
    expect(out).toEqual({ ok: false, error: 'Unknown zone: zone-z' });
  });

  it('bad input (wrong type / missing zoneId)', () => {
    expect(executeTool('check_isolation', { zoneId: 42 }, ctx).ok).toBe(false);
    expect(executeTool('correlate_zone', {}, ctx).ok).toBe(false);
  });
});
