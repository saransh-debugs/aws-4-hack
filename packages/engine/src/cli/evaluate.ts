import { assertEvaluationCasesAreComplete, runEvaluation } from '../evaluation';

assertEvaluationCasesAreComplete();
const report = runEvaluation();
console.log(JSON.stringify(report, null, 2));
