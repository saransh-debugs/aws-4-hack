import { Stack, Tags, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

/**
 * GridRisk backend. M0: intentionally empty.
 *
 * TODO(Darsh), see todo/darsh-cloud.md:
 *  Task 10 – DynamoDB (events w/ stream, alerts), HTTP API + Cognito JWT authorizer on ALL routes,
 *            Lambdas for /events /alerts /simulate/{scenario} /simulate/reset,
 *            Amazon Location API key (referrer-restricted), CORS limited to the web origin.
 *  Task 11 – Step Functions: RunAgent -> SaveAlert -> WaitForApproval (.waitForTaskToken)
 *            -> Dispatch (SNS + shelter + drone) -> MarkDispatched; POST /alerts/{id}/approve.
 *  Task 12 – EventBridge Scheduler -> ingest Lambda.
 */
export class GridRiskStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    Tags.of(this).add('project', 'gridrisk');
  }
}
