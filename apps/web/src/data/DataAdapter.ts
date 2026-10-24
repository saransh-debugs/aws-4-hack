import type {
  AlertCardData,
  ApiError,
  DemoEvent,
  MapData,
  ScenarioName,
  SourceHealth,
} from '@gridrisk/shared';
import { DataAdapterError } from './errors';

/**
 * The only way the UI talks to data (handoff H8). Two implementations:
 *   MockAdapter – in-memory, built on @gridrisk/engine buildScenario + fixtures (Bushra, Task 2)
 *   LiveAdapter – HTTP API from docs/CONTRACTS.md with Cognito auth (Bushra + Darsh, Task 13)
 * Both must pass the same contract test suite.
 */
export interface DataAdapter {
  getEvents(): Promise<DemoEvent[]>;
  getAlerts(): Promise<AlertCardData[]>;
  /** Provider freshness and error status. Optional for backwards-compatible adapters. */
  getHealth?(): Promise<SourceHealth[]>;
  getMapData?(): Promise<MapData>;
  /** Approve a subset of an alert's proposed actions. Resolves to the updated alert. */
  approve(alertId: string, actionIds: string[]): Promise<AlertCardData>;
  /** Inject a scenario's events. Resolves to the full current event list. */
  simulate(scenario: ScenarioName): Promise<DemoEvent[]>;
  /** Back to the calm baseline; clears alerts. */
  reset(): Promise<void>;
}

export type DataMode = 'mock' | 'live';

/**
 * What MockAdapter throws. It extends {@link DataAdapterError} so the UI and the shared contract
 * suite can treat a mock-mode error exactly like a live-mode one (both are `instanceof
 * DataAdapterError` and expose `code`). `code` is the API's error code (409 -> CONFLICT,
 * 404 -> NOT_FOUND).
 */
export class AdapterError extends DataAdapterError {
  constructor(code: ApiError['error']['code'], message: string) {
    super(code, message);
  }
}
