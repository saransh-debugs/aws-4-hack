/**
 * A2 – Proposed actions (owner: Bushra). Must stay free of AWS SDK imports: the web app
 * bundles it through ./template.
 *
 * The single source of truth for action ids, labels and params. Both ./template (the
 * deterministic fallback) and ./assemble (the model path) build their actions here.
 *   - `activate_shelter` is skipped when the engine found no candidate shelter.
 *   - action types are de-duplicated, preserving first-seen order.
 */
import type { ActionType, EngineResult, ProposedAction, Shelter, Zone } from '@gridrisk/shared';

export interface ActionContext {
  zone: Zone;
  shelters: Shelter[];
  result: EngineResult;
}

export function buildProposedActions(types: ActionType[], ctx: ActionContext): ProposedAction[] {
  const { zone, shelters, result } = ctx;
  const shelter = shelters.find((s) => s.id === result.candidateShelterIds[0]);
  const seen = new Set<ActionType>();
  return types.flatMap((type): ProposedAction[] => {
    if (seen.has(type)) return [];
    seen.add(type);
    switch (type) {
      case 'activate_shelter':
        return shelter
          ? [
              {
                id: `act-${shelter.id}`,
                type,
                label: `Record shelter activation request: ${shelter.name} (Capacity: ${shelter.capacity})`,
                params: { shelterId: shelter.id },
              },
            ]
          : [];
      case 'dispatch_drone':
        return [
          {
            id: `act-drone-${zone.id}`,
            type,
            label: `Create drone mission request for ${zone.name}`,
            params: { zoneId: zone.id },
          },
        ];
      case 'send_alert':
        return [
          {
            id: `act-alert-${zone.id}`,
            type,
            label: `Create notification for ${zone.name}`,
            params: { zoneId: zone.id },
          },
        ];
    }
  });
}
