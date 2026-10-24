import { buildTemplateAlert } from '@gridrisk/agent/template';
import { analyze, buildScenario } from '@gridrisk/engine';
import type { AlertCardData, DemoEvent, ScenarioName } from '@gridrisk/shared';
import { SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import type { DataAdapter } from './DataAdapter';
import { DataAdapterError } from './errors';

/**
 * Browser-safe deterministic adapter for the prototype. It mirrors the API contract and keeps
 * its state in memory so the map/feed can use the same path as the live API.
 */
export class MockAdapter implements DataAdapter {
  private events: DemoEvent[] = buildScenario('calm');
  private alerts: AlertCardData[] = [];

  async getEvents(): Promise<DemoEvent[]> {
    return this.events.map((event) => ({ ...event }));
  }

  async getAlerts(): Promise<AlertCardData[]> {
    return this.alerts.map((alert) => ({
      ...alert,
      points: [...alert.points],
      proposedActions: alert.proposedActions.map((action) => ({ ...action })),
      relatedEventIds: [...alert.relatedEventIds],
    }));
  }

  async approve(alertId: string, actionIds: string[]): Promise<AlertCardData> {
    const alert = this.alerts.find((candidate) => candidate.id === alertId);
    if (!alert) throw new DataAdapterError('NOT_FOUND', `Unknown alert: ${alertId}`, 404);
    if (alert.status !== 'pending') {
      throw new DataAdapterError('CONFLICT', `Alert ${alert.id} is already ${alert.status}`, 409);
    }
    if (actionIds.length === 0) {
      throw new DataAdapterError(
        'BAD_REQUEST',
        'actionIds must be a non-empty array of strings',
        400,
      );
    }
    const knownActionIds = new Set(alert.proposedActions.map((action) => action.id));
    const unknown = actionIds.filter((id) => !knownActionIds.has(id));
    if (unknown.length > 0) {
      throw new DataAdapterError('BAD_REQUEST', `Unknown actionIds: ${unknown.join(', ')}`, 400);
    }
    alert.status = 'dispatched';
    return (await this.getAlerts()).find((candidate) => candidate.id === alertId)!;
  }

  async simulate(scenario: ScenarioName): Promise<DemoEvent[]> {
    this.events = buildScenario(scenario);
    for (const result of analyze(this.events, ZONES, { shelters: SHELTERS })) {
      if (!result.isolated || this.alerts.some((alert) => alert.zoneId === result.zoneId)) continue;
      const zone = ZONES.find((candidate) => candidate.id === result.zoneId);
      if (zone) this.alerts.push(buildTemplateAlert(result, { zone, shelters: SHELTERS }));
    }
    return this.getEvents();
  }

  async reset(): Promise<void> {
    this.events = buildScenario('calm');
    this.alerts = [];
  }
}
