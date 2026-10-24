import { Duration, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import type { Construct } from 'constructs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * GridRisk backend: persistent event/shelter stores and scheduled data ingestion.
 *
 * Remaining cloud work (see todo/darsh-cloud.md):
 *  Task 10 – DynamoDB (events w/ stream, alerts), HTTP API + Cognito JWT authorizer on ALL routes,
 *            Lambdas for /events /alerts /simulate/{scenario} /simulate/reset,
 *            Amazon Location API key (referrer-restricted), CORS limited to the web origin.
 *  Task 11 – Step Functions: RunAgent -> SaveAlert -> WaitForApproval (.waitForTaskToken)
 *            -> Dispatch (SNS + shelter + drone) -> MarkDispatched; POST /alerts/{id}/approve.
 *  Task 12 – EventBridge Scheduler -> ingest Lambda. ✅
 */
export class GridRiskStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    Tags.of(this).add('project', 'gridrisk');

    const events = new Table(this, 'EventsTable', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const shelters = new Table(this, 'SheltersTable', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const snapshots = new Table(this, 'SnapshotsTable', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const ingest = new NodejsFunction(this, 'IngestFunction', {
      entry: resolve(repoRoot, 'packages/engine/src/ingest/handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      timeout: Duration.seconds(60),
      memorySize: 512,
      environment: {
        GRIDRISK_EVENTS_TABLE: events.tableName,
        GRIDRISK_SHELTERS_TABLE: shelters.tableName,
        GRIDRISK_SNAPSHOTS_TABLE: snapshots.tableName,
        GRIDRISK_CENTERPOINT_OUTAGES_URL: process.env.GRIDRISK_CENTERPOINT_OUTAGES_URL ?? '',
        DRIVETEXAS_API_KEY: process.env.DRIVETEXAS_API_KEY ?? '',
        GRIDRISK_ALLOW_SYNTHETIC_UTILITY: process.env.GRIDRISK_ALLOW_SYNTHETIC_UTILITY ?? 'false',
        GRIDRISK_SYNTHETIC_ZONE_ID: process.env.GRIDRISK_SYNTHETIC_ZONE_ID ?? 'zone-a',
      },
    });
    events.grantWriteData(ingest);
    shelters.grantWriteData(ingest);
    snapshots.grantWriteData(ingest);

    new Rule(this, 'IngestSchedule', {
      schedule: Schedule.rate(Duration.minutes(5)),
      targets: [new LambdaFunction(ingest)],
    });
  }
}
