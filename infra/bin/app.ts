import { App } from 'aws-cdk-lib';
import { GridRiskStack } from '../lib/gridrisk-stack';

const app = new App();

new GridRiskStack(app, 'GridRiskStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
  },
});
