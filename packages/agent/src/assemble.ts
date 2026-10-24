/**
 * A2 – Turn Claude's narrow submission into an AlertCardData (owner: Bushra).
 *
 * The model contributes only `title`, `points` and `actionTypes`. Every id, number, status
 * and related-event id is filled in here from the EngineResult – the model's text is never
 * the source of any structured value. ./validate then rejects any number in the text that the
 * engine did not produce. SDK-free.
 */
import type { AlertCardData, EngineResult, Shelter, ToolTraceEntry, Zone } from '@gridrisk/shared';
import { buildProposedActions } from './actions';
import type { SubmitAlertInput } from './submit';

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
  const { zone, shelters } = opts;
  const now = opts.now ?? new Date();

  return {
    id: opts.id ?? `alert-${zone.id}-${now.getTime()}`,
    zoneId: zone.id,
    title: sub.title,
    points: sub.points,
    isolationWindowMinutes: result.isolationWindowMinutes,
    ...(result.isolationWindowRangeMinutes
      ? { isolationWindowRangeMinutes: result.isolationWindowRangeMinutes }
      : {}),
    ...(result.uncertainty ? { uncertainty: result.uncertainty } : {}),
    proposedActions: buildProposedActions(sub.actionTypes, { zone, shelters, result }),
    relatedEventIds: [
      ...result.outageEventIds,
      ...result.closureEventIds,
      ...result.emergencyEventIds,
    ],
    status: 'pending',
    createdAt: now.toISOString(),
    ...(opts.toolTrace ? { toolTrace: opts.toolTrace } : {}),
  };
}
