import { buildScenario, analyze } from '../index';
import { SHELTERS, ZONES } from '@gridrisk/shared/fixtures';

const name = process.argv[2] ?? 'escalation';
if (!['calm', 'escalation', 'partial', 'reopened'].includes(name)) {
  throw new Error(`Unknown scenario: ${name}`);
}

const results = analyze(
  buildScenario(name as 'calm' | 'escalation' | 'partial' | 'reopened'),
  ZONES,
  {
    shelters: SHELTERS,
  },
);
console.log(JSON.stringify(results, null, 2));
