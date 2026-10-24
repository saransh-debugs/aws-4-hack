import type {
  AlertCardData,
  DemoEvent,
  RoadSegment,
  ScenarioName,
  Shelter,
  Zone,
} from '@gridrisk/shared';

/**
 * The only way the UI talks to data (handoff H8). Two implementations:
 *   MockAdapter – in-memory, built on @gridrisk/engine buildScenario + fixtures (Bushra, Task 2)
 *   LiveAdapter – HTTP API from docs/CONTRACTS.md with Cognito auth (Bushra + Darsh, Task 13)
 * Both must pass the same contract test suite.
 */
export interface DataAdapter {
  getEvents(): Promise<DemoEvent[]>;
  getAlerts(): Promise<AlertCardData[]>;
  getMapData(): Promise<{ zones: Zone[]; roads: RoadSegment[]; shelters: Shelter[] }>;
  /** Approve a subset of an alert's proposed actions. Resolves to the updated alert. */
  approve(alertId: string, actionIds: string[]): Promise<AlertCardData>;
  /** Inject a scenario's events. Resolves to the full current event list. */
  simulate(scenario: ScenarioName): Promise<DemoEvent[]>;
  /** Back to the calm baseline; clears alerts. */
  reset(): Promise<void>;
}

export type DataMode = 'mock' | 'live';
