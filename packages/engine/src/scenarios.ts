import type { DemoEvent, ScenarioName } from '@gridrisk/shared';
import { CALM_EVENTS, ESCALATION_EVENTS } from '@gridrisk/shared/fixtures';

/**
 * Handoff H2. Returns a fresh copy of the events for a scenario, so callers may mutate freely.
 *   calm       -> calm background events
 *   escalation -> calm + escalation events
 * "Reset" is simply buildScenario('calm').
 *
 * TODO(Tanisha): add more scenarios (partial, bridge reopened) for the agent evals.
 */
export function buildScenario(name: ScenarioName): DemoEvent[] {
  switch (name) {
    case 'calm':
      return structuredClone(CALM_EVENTS);
    case 'escalation':
      return structuredClone([...CALM_EVENTS, ...ESCALATION_EVENTS]);
    case 'partial':
      return structuredClone([
        ...CALM_EVENTS.filter((event) => event.type !== 'road_closure'),
        ESCALATION_EVENTS[0]!,
      ]);
    case 'reopened':
      return structuredClone([
        ...CALM_EVENTS.filter((event) => event.type !== 'road_closure'),
        ESCALATION_EVENTS[0]!,
      ]);
  }
}

/** Scenario helpers kept explicit so tests and demos can build variants without mutating fixtures. */
export const buildPartialScenario = (): DemoEvent[] => buildScenario('partial');
export const buildReopenedScenario = (): DemoEvent[] => buildScenario('reopened');
