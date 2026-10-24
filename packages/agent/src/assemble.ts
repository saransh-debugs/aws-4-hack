/**
 * A2 – Turn Claude's narrow submission into an AlertCardData (owner: Bushra).
 * Every id and number comes from the EngineResult; only title and points come from Claude.
 *
 * A0 STUB: reuses the template for ids/numbers. TODO(Bushra): build it directly.
 */
import type { AlertCardData, EngineResult, Shelter, ToolTraceEntry, Zone } from '@gridrisk/shared';
import { buildProposedActions } from './actions';
import type { SubmitAlertInput } from './submit';
import { buildTemplateAlert } from './template';

export interface AssembleOptions {
  zone: Zone;
  shelters: Shelter[];
  now?: Date;
  id?: string;
  toolTrace?: ToolTraceEntry[];
}

export function assembleAlert(
  sub: SubmitAlertInput,
  result: EngineResult,
  opts: AssembleOptions,
): AlertCardData {
  const base = buildTemplateAlert(result, opts);
  return {
    ...base,
    title: sub.title,
    points: sub.points,
    proposedActions: buildProposedActions(sub.actionTypes, {
      zone: opts.zone,
      shelters: opts.shelters,
      result,
    }),
    ...(opts.toolTrace ? { toolTrace: opts.toolTrace } : {}),
  };
}
