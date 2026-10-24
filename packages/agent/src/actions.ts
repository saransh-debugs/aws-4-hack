/**
 * A2 – Proposed actions (owner: Bushra). Must stay free of AWS SDK imports: the web app
 * bundles it through ./template.
 *
 * A0 STUB. TODO(Bushra): move the action building out of template.ts into here (template
 * must still equal SAMPLE_ALERT), de-duplicate types, and skip activate_shelter when the
 * engine found no shelter.
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
  return types.flatMap((type): ProposedAction[] => {
    switch (type) {
      case 'activate_shelter':
        return shelter
          ? [
              {
                id: `act-${shelter.id}`,
                type,
                label: `Activate ${shelter.name} (Capacity: ${shelter.capacity})`,
                params: { shelterId: shelter.id },
              },
            ]
          : [];
      case 'dispatch_drone':
        return [
          {
            id: `act-drone-${zone.id}`,
            type,
            label: `Dispatch Aerial Recon Drone to ${zone.name}`,
            params: { zoneId: zone.id },
          },
        ];
      case 'send_alert':
        return [
          {
            id: `act-alert-${zone.id}`,
            type,
            label: `Send public alert to ${zone.name}`,
            params: { zoneId: zone.id },
          },
        ];
    }
  });
}
