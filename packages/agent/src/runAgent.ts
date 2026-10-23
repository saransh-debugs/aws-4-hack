import type { AlertCardData, DemoEvent, Shelter, Zone } from '@gridrisk/shared';
import { SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import { analyze } from '@gridrisk/engine';
import { buildTemplateAlert } from './template';

export interface RunAgentInput {
  zoneId: string;
  events: DemoEvent[];
}

export interface RunAgentDeps {
  zones?: Zone[];
  shelters?: Shelter[];
  now?: () => Date;
}

/**
 * Handoff H5. Returns a proposed alert for the zone, or null if there is nothing to raise.
 *
 * M0 STUB: no model call – runs the engine and fills the deterministic template.
 * TODO(Saransh): call the Bedrock loop (./bedrock) first and fall back to this template path.
 */
export async function runAgent(
  input: RunAgentInput,
  deps: RunAgentDeps = {},
): Promise<AlertCardData | null> {
  const zones = deps.zones ?? ZONES;
  const shelters = deps.shelters ?? SHELTERS;
  const zone = zones.find((z) => z.id === input.zoneId);
  if (!zone) return null;

  const result = analyze(input.events, zones, { shelters }).find((r) => r.zoneId === zone.id);
  if (!result?.isolated) return null;

  return buildTemplateAlert(result, { zone, shelters, now: deps.now?.() });
}
