import { performance } from 'node:perf_hooks';
import type { ScenarioName } from '@gridrisk/shared';
import { SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import { analyze } from './analyze';
import { buildScenario, SCENARIO_NAMES } from './scenarios';

/**
 * A labeled evaluation case. Labels describe the expected operational outcome,
 * not what the engine happened to produce.
 *
 * These labels are currently synthetic and based on the scenario story. They
 * are useful for regression testing, but must not be presented as field accuracy.
 */
export interface EvaluationCase {
  id: string;
  scenario: ScenarioName;
  expectedIsolatedZoneIds: string[];
  labelSource: 'synthetic-scenario-spec';
}

export const EVALUATION_CASES: readonly EvaluationCase[] = [
  {
    id: 'case-calm',
    scenario: 'calm',
    expectedIsolatedZoneIds: [],
    labelSource: 'synthetic-scenario-spec',
  },
  {
    id: 'case-partial',
    scenario: 'partial',
    expectedIsolatedZoneIds: [],
    labelSource: 'synthetic-scenario-spec',
  },
  {
    id: 'case-escalation',
    scenario: 'escalation',
    expectedIsolatedZoneIds: ['zone-a'],
    labelSource: 'synthetic-scenario-spec',
  },
  {
    id: 'case-reopened',
    scenario: 'reopened',
    expectedIsolatedZoneIds: [],
    labelSource: 'synthetic-scenario-spec',
  },
  {
    id: 'case-zone-b',
    scenario: 'zone-b',
    expectedIsolatedZoneIds: ['zone-b'],
    labelSource: 'synthetic-scenario-spec',
  },
  {
    id: 'case-multi-zone',
    scenario: 'multi-zone',
    expectedIsolatedZoneIds: ['zone-a', 'zone-b'],
    labelSource: 'synthetic-scenario-spec',
  },
  {
    id: 'case-storm',
    scenario: 'storm',
    expectedIsolatedZoneIds: ['zone-a'],
    labelSource: 'synthetic-scenario-spec',
  },
];

export interface ClassificationMetrics {
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  falseAlertRate: number;
  missedAlertRate: number;
}

export interface EvaluationCaseResult {
  id: string;
  scenario: ScenarioName;
  expectedIsolatedZoneIds: string[];
  predictedIsolatedZoneIds: string[];
  correct: boolean;
  latencyMs: number;
}

export interface EvaluationReport {
  generatedAt: string;
  benchmark: {
    name: string;
    labelSource: 'synthetic-scenario-spec';
    cases: number;
    zonesPerCase: number;
  };
  classification: ClassificationMetrics;
  latencyMs: { min: number; median: number; p95: number; max: number };
  cases: EvaluationCaseResult[];
}

const rate = (numerator: number, denominator: number): number =>
  denominator === 0 ? 1 : numerator / denominator;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * p));
  return sorted[index] ?? 0;
}

export function runEvaluation(
  cases: readonly EvaluationCase[] = EVALUATION_CASES,
): EvaluationReport {
  const results = cases.map((evaluationCase): EvaluationCaseResult => {
    const started = performance.now();
    const predicted = analyze(buildScenario(evaluationCase.scenario), ZONES, {
      shelters: SHELTERS,
    })
      .filter((result) => result.isolated)
      .map((result) => result.zoneId)
      .sort();
    const latencyMs = Number((performance.now() - started).toFixed(3));
    const expected = [...evaluationCase.expectedIsolatedZoneIds].sort();
    return {
      id: evaluationCase.id,
      scenario: evaluationCase.scenario,
      expectedIsolatedZoneIds: expected,
      predictedIsolatedZoneIds: predicted,
      correct: JSON.stringify(expected) === JSON.stringify(predicted),
      latencyMs,
    };
  });

  let truePositives = 0;
  let trueNegatives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  for (const [index, result] of results.entries()) {
    const expected = new Set(cases[index]?.expectedIsolatedZoneIds ?? []);
    const predicted = new Set(result.predictedIsolatedZoneIds);
    for (const zone of ZONES) {
      const actual = expected.has(zone.id);
      const detected = predicted.has(zone.id);
      if (actual && detected) truePositives += 1;
      else if (!actual && !detected) trueNegatives += 1;
      else if (!actual && detected) falsePositives += 1;
      else falseNegatives += 1;
    }
  }
  const precision = rate(truePositives, truePositives + falsePositives);
  const recall = rate(truePositives, truePositives + falseNegatives);
  const f1 = rate(2 * precision * recall, precision + recall);
  const negativeCases = trueNegatives + falsePositives;
  const positiveCases = truePositives + falseNegatives;
  const latencies = results.map((result) => result.latencyMs);

  return {
    generatedAt: new Date().toISOString(),
    benchmark: {
      name: 'GridRisk synthetic isolation regression benchmark',
      labelSource: 'synthetic-scenario-spec',
      cases: cases.length,
      zonesPerCase: ZONES.length,
    },
    classification: {
      truePositives,
      trueNegatives,
      falsePositives,
      falseNegatives,
      precision,
      recall,
      f1,
      falseAlertRate: rate(falsePositives, negativeCases),
      missedAlertRate: rate(falseNegatives, positiveCases),
    },
    latencyMs: {
      min: latencies.length ? Math.min(...latencies) : 0,
      median: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: latencies.length ? Math.max(...latencies) : 0,
    },
    cases: results,
  };
}

export function assertEvaluationCasesAreComplete(): void {
  const expected = new Set<string>(SCENARIO_NAMES);
  const actual = new Set<string>(EVALUATION_CASES.map((evaluationCase) => evaluationCase.scenario));
  if (expected.size !== actual.size || [...expected].some((name) => !actual.has(name))) {
    throw new Error('Evaluation cases must cover every built-in scenario');
  }
}
