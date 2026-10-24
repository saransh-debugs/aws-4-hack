import type { DemoEvent, EngineResult, MapData } from '@gridrisk/shared';
import { analyze, type AnalyzeOptions } from './analyze';
import { validateDataQuality, type DataQualityIssue } from './dataQuality';
import { assessFreshness, type FreshnessStatus } from './freshness';
import type { PatientCount } from './tools';

export interface FreshWorkflowInput {
  events: DemoEvent[];
  geography: MapData;
  patientCounts?: PatientCount[];
  providerFetchedAt: Record<string, string>;
  now?: Date;
  maxAgeMinutes?: number;
  analysis?: Omit<AnalyzeOptions, 'patientCounts' | 'shelters' | 'roads'>;
}

export interface FreshWorkflowProof {
  ready: boolean;
  freshness: FreshnessStatus[];
  qualityIssues: DataQualityIssue[];
  blockingReasons: string[];
  results: EngineResult[];
}

/** Contract-level proof for the live data -> geography -> analysis path. */
export function proveFreshWorkflow(input: FreshWorkflowInput): FreshWorkflowProof {
  const now = input.now ?? new Date();
  const maxAgeMinutes = input.maxAgeMinutes ?? 15;
  const freshness = Object.entries(input.providerFetchedAt).map(([source, fetchedAt]) =>
    assessFreshness(source, fetchedAt, maxAgeMinutes, now),
  );
  const qualityIssues = validateDataQuality(
    input.events,
    input.geography.zones,
    input.geography.roads,
    input.geography.shelters,
    { now, maxEventAgeMinutes: maxAgeMinutes },
  );
  const results = analyze(input.events, input.geography.zones, {
    ...input.analysis,
    shelters: input.geography.shelters,
    roads: input.geography.roads,
    patientCounts: input.patientCounts,
  });
  const blockingReasons = [
    ...freshness.filter((source) => source.stale).map((source) => `${source.source} is stale`),
    ...(qualityIssues.length ? ['data-quality issues are present'] : []),
    ...(input.geography.shelters.length ? [] : ['no current shelter capacity/status is available']),
    ...(results.length ? [] : ['no decision result was produced']),
  ];
  return {
    ready: blockingReasons.length === 0,
    freshness,
    qualityIssues,
    blockingReasons,
    results,
  };
}
