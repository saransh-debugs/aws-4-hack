import { App } from 'aws-cdk-lib';
import { GridRiskStack } from '../lib/gridrisk-stack';

const app = new App();

new GridRiskStack(app, 'GridRiskStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
  },
  // Deploy-time config (see .github/workflows/deploy.yml). Safe local defaults.
  webOrigin: process.env.WEB_ORIGIN || undefined,
  dispatchEmail: process.env.DISPATCH_EMAIL || undefined,
  bedrockModelId: process.env.BEDROCK_MODEL_ID || undefined,
});
