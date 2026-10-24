import type {
  AlertCardData,
  DemoEvent,
  ScenarioName,
  Shelter,
  SourceHealth,
  Zone,
} from '@gridrisk/shared';
import { SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import { analyze, buildScenario } from '@gridrisk/engine';
// Subpath on purpose: the package root pulls in the Bedrock SDK, which must not reach the browser.
import { buildTemplateAlert } from '@gridrisk/agent/template';
import { AdapterError, type DataAdapter } from './DataAdapter';

export interface MockAdapterOptions {
  zones?: Zone[];
  shelters?: Shelter[];
  now?: () => Date;
}

/**
 * Handoff H8. In-memory DataAdapter for offline mode. Behaves like the HTTP API in
 * docs/CONTRACTS.md, including its errors (404, 409, 400).
 */
export class MockAdapter implements DataAdapter {
  private readonly zones: Zone[];
  private readonly shelters: Shelter[];
  private readonly now: () => Date;
  private events: DemoEvent[];
  private alerts: AlertCardData[] = [];

  constructor(options: MockAdapterOptions = {}) {
    this.zones = options.zones ?? ZONES;
    this.shelters = options.shelters ?? SHELTERS;
    this.now = options.now ?? (() => new Date());
    this.events = buildScenario('calm');
  }

  async getEvents(): Promise<DemoEvent[]> {
    return structuredClone(this.events);
  }

  async getAlerts(): Promise<AlertCardData[]> {
    return structuredClone(this.alerts);
  }

  async getHealth(): Promise<SourceHealth[]> {
    const now = this.now().toISOString();
    return [
      {
        source: 'demo-scenario',
        status: 'healthy',
        fetchedAt: now,
        lastSuccessAt: now,
        recordCount: this.events.length,
        maxAgeMinutes: 60,
      },
    ];
  }

  async approve(alertId: string, actionIds: string[]): Promise<AlertCardData> {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) throw new AdapterError('NOT_FOUND', `Unknown alert: ${alertId}`);
    if (alert.status !== 'pending') {
      throw new AdapterError('CONFLICT', `Alert ${alertId} is already ${alert.status}`);
    }
    const known = new Set(alert.proposedActions.map((a) => a.id));
    if (actionIds.length === 0 || actionIds.some((id) => !known.has(id))) {
      throw new AdapterError('BAD_REQUEST', 'actionIds must be a non-empty subset of the alert');
    }
    alert.status = 'dispatched';
    return structuredClone(alert);
  }

  async simulate(scenario: ScenarioName): Promise<DemoEvent[]> {
    // Like the API (infra/lambda/shared/scenario.ts): a new scenario replaces the events and
    // clears the old alerts, so each scenario starts fresh.
    this.events = buildScenario(scenario);
    this.alerts = [];

    for (const result of analyze(this.events, this.zones, { shelters: this.shelters })) {
      const zone = this.zones.find((z) => z.id === result.zoneId);
      if (!zone || !result.isolated) continue;
      if (this.alerts.some((a) => a.zoneId === zone.id)) continue;
      this.alerts.push(
        buildTemplateAlert(result, { zone, shelters: this.shelters, now: this.now() }),
      );
    }
    return structuredClone(this.events);
  }

  async reset(): Promise<void> {
    this.events = buildScenario('calm');
    this.alerts = [];
  }
}
