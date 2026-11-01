import { describe, expect, it } from 'vitest';
import { assertEvaluationCasesAreComplete, EVALUATION_CASES, runEvaluation } from '../src';

describe('evaluation benchmark', () => {
  it('covers every built-in scenario', () => {
    expect(() => assertEvaluationCasesAreComplete()).not.toThrow();
    expect(EVALUATION_CASES).toHaveLength(7);
  });

  it('reports the expected results for the synthetic benchmark', () => {
    const report = runEvaluation();
    expect(report.classification).toMatchObject({
      truePositives: 5,
      trueNegatives: 9,
      falsePositives: 0,
      falseNegatives: 0,
      precision: 1,
      recall: 1,
      f1: 1,
      falseAlertRate: 0,
      missedAlertRate: 0,
    });
    expect(report.cases.every((result) => result.correct)).toBe(true);
    expect(report.latencyMs.max).toBeGreaterThanOrEqual(report.latencyMs.min);
  });
});
