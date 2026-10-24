/**
 * A2 – Grounding check (owner: Bushra): every number in the alert text must come from the
 * EngineResult, unit-aware (for example, a duration must not be confused with a count).
 *
 * A0 STUB: always passes. TODO(Bushra): real check.
 */
import type { AlertCardData, EngineResult, Shelter, Zone } from '@gridrisk/shared';

export interface GroundingContext {
  zone: Zone;
  shelters: Shelter[];
}

export interface GroundingResult {
  ok: boolean;
  errors: string[];
}

export function checkGrounding(
  _alert: AlertCardData,
  _result: EngineResult,
  _ctx: GroundingContext,
): GroundingResult {
  return { ok: true, errors: [] };
}
