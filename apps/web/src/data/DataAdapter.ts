import type { AlertCardData, ApiError, DemoEvent, ScenarioName } from '@gridrisk/shared';

/**
 * The only way the UI talks to data (handoff H8). Two implementations:
 *   MockAdapter – in-memory, built on @gridrisk/engine buildScenario + fixtures (Bushra, Task 2)
 *   LiveAdapter – HTTP API from docs/CONTRACTS.md with Cognito auth (Bushra + Darsh, Task 13)
 * Both must pass the same contract test suite.
 */
export interface DataAdapter {
  getEvents(): Promise<DemoEvent[]>;
  getAlerts(): Promise<AlertCardData[]>;
  /** Approve a subset of an alert's proposed actions. Resolves to the updated alert. */
  approve(alertId: string, actionIds: string[]): Promise<AlertCardData>;
  /** Inject a scenario's events. Resolves to the full current event list. */
  simulate(scenario: ScenarioName): Promise<DemoEvent[]>;
  /** Back to the calm baseline; clears alerts. */
  reset(): Promise<void>;
}

export type DataMode = 'mock' | 'live';

/**
 * What every adapter throws, so the UI and the shared contract suite handle MockAdapter and
 * LiveAdapter the same way. `code` is the API's error code (409 -> CONFLICT, 404 -> NOT_FOUND).
 */
export class AdapterError extends Error {
  readonly code: ApiError['error']['code'];

  constructor(code: ApiError['error']['code'], message: string) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
  }
}
