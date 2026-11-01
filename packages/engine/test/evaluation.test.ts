import { describe, expect, it } from 'vitest';
import { assertEvaluationCasesAreComplete, EVALUATION_CASES, runEvaluation } from '../src';

describe('evaluation benchmark', () => {
  it('covers every built-in scenario and has a holdout split', () => {
    expect(() => assertEvaluationCasesAreComplete()).not.toThrow();
    expect(EVALUATION_CASES).toHaveLength(7);
    expect(EVALUATION_CASES.some((evaluationCase) => evaluationCase.split === 'holdout')).toBe(
      true,
    );
  });

  it('reports classification, uncertainty, robustness, and reproducibility metadata', () => {
    const report = runEvaluation();
    expect(report.benchmark).toMatchObject({
      version: '2026-11-01.v2',
      cases: 7,
      zonesPerCase: 2,
      developmentCases: 4,
      holdoutCases: 3,
      fieldAccuracyAvailable: false,
    });
    expect(report.overall).toMatchObject({
      truePositives: 5,
      trueNegatives: 9,
      falsePositives: 0,
      falseNegatives: 0,
      accuracy: 1,
      precision: 1,
      recall: 1,
      specificity: 1,
      f1: 1,
      balancedAccuracy: 1,
    });
    expect(report.overall.precision95.lower95).toBeLessThan(1);
    expect(report.overall.recall95.lower95).toBeLessThan(1);
    expect(report.robustness).toMatchObject({ checks: 14, passed: 14 });
    expect(report.benchmark.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.latencyMs.p99).toBeGreaterThanOrEqual(report.latencyMs.p95);
  });
});
