import { describe, expect, it } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { GridRiskStack } from '../lib/gridrisk-stack';

describe('GridRiskStack', () => {
  it('synthesizes (M0: no resources yet)', () => {
    const app = new App();
    const stack = new GridRiskStack(app, 'TestStack', { env: { region: 'us-east-1' } });
    const template = Template.fromStack(stack);

    expect(stack.region).toBe('us-east-1');
    // Pattern for Task 10: template.resourceCountIs('AWS::DynamoDB::Table', 2);
    template.resourceCountIs('AWS::DynamoDB::Table', 0);
  });
});
