import { CfnOutput, Duration, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as location from 'aws-cdk-lib/aws-location';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import { HttpApi, HttpMethod, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAMBDA_DIR = path.join(__dirname, '..', 'lambda');
const REPO_ROOT = path.join(__dirname, '..', '..');

export interface GridRiskStackProps extends StackProps {
  /** Web origin allowed by CORS and the Location API key referrer restriction. */
  readonly webOrigin?: string;
  /** Email to subscribe to the dispatch SNS topic (demo notifications). */
  readonly dispatchEmail?: string;
  /** Bedrock model id granted to RunAgent (Task 14). Defaults to a Claude id. */
  readonly bedrockModelId?: string;
}

/**
 * GridRisk backend (owner: Darsh). See todo/darsh-cloud.md.
 *
 * Task 10 – DynamoDB (events w/ stream, alerts), Cognito + HTTP API JWT authorizer on ALL routes,
 *           read/simulate Lambdas, Amazon Location API key + route calculator, CORS to the web origin.
 * Task 11 – Step Functions human-approval workflow + POST /alerts/{id}/approve + stream trigger.
 * Task 12 – EventBridge Scheduler -> ingest Lambda (least privilege).
 * Task 14 – RunAgent granted bedrock:InvokeModel on a single model, 30s timeout.
 */
export class GridRiskStack extends Stack {
  constructor(scope: Construct, id: string, props: GridRiskStackProps = {}) {
    super(scope, id, props);
    Tags.of(this).add('project', 'gridrisk');

    const webOrigin = props.webOrigin ?? 'http://localhost:5173';
    const bedrockModelId = props.bedrockModelId ?? 'anthropic.claude-3-5-sonnet-20240620-v1:0';

    // ---------------------------------------------------------------------
    // Task 10: DynamoDB
    // ---------------------------------------------------------------------
    const eventsTable = new dynamodb.Table(this, 'EventsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const sheltersTable = new dynamodb.Table(this, 'SheltersTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const snapshotsTable = new dynamodb.Table(this, 'SnapshotsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const alertsTable = new dynamodb.Table(this, 'AlertsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    // Lets the stream trigger debounce per zone.
    alertsTable.addGlobalSecondaryIndex({
      indexName: 'zoneId-index',
      partitionKey: { name: 'zoneId', type: dynamodb.AttributeType.STRING },
    });

    // ---------------------------------------------------------------------
    // Task 10: Cognito user pool + app client (JWT authorizer source)
    // ---------------------------------------------------------------------
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: { userPassword: true, userSrp: true },
      generateSecret: false,
    });

    const authorizer = new HttpJwtAuthorizer(
      'JwtAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      { jwtAudience: [userPoolClient.userPoolClientId] },
    );

    // ---------------------------------------------------------------------
    // Shared Lambda defaults (Node 22, esbuild bundling via NodejsFunction)
    // ---------------------------------------------------------------------
    const commonLambda = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      bundling: { format: OutputFormat.ESM, target: 'node22' },
    } as const;

    const mkFn = (fnId: string, entry: string, env: Record<string, string> = {}) =>
      new NodejsFunction(this, fnId, {
        ...commonLambda,
        entry: path.join(LAMBDA_DIR, entry),
        handler: 'handler',
        // Explicit log group (one week). Avoids the deprecated `logRetention`
        // custom resource, which would add an extra Lambda + role.
        logGroup: new logs.LogGroup(this, `${fnId}Logs`, {
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        environment: {
          EVENTS_TABLE: eventsTable.tableName,
          ALERTS_TABLE: alertsTable.tableName,
          ...env,
        },
      });

    // ---------------------------------------------------------------------
    // Task 10: read + simulate Lambdas
    // ---------------------------------------------------------------------
    const getEventsFn = mkFn('GetEventsFn', 'getEvents.ts');
    const getAlertsFn = mkFn('GetAlertsFn', 'getAlerts.ts');
    const getMapDataFn = mkFn('GetMapDataFn', 'getMapData.ts');
    const simulateFn = mkFn('SimulateFn', 'simulate.ts');

    eventsTable.grantReadData(getEventsFn);
    alertsTable.grantReadData(getAlertsFn);
    // simulate rewrites events and clears alerts + debounce locks.
    eventsTable.grantReadWriteData(simulateFn);
    alertsTable.grantReadWriteData(simulateFn);

    // ---------------------------------------------------------------------
    // Task 11: Step Functions task Lambdas
    // ---------------------------------------------------------------------
    const dispatchTopic = new sns.Topic(this, 'DispatchTopic', {
      displayName: 'GridRisk dispatch notifications',
    });
    if (props.dispatchEmail) {
      dispatchTopic.addSubscription(new subscriptions.EmailSubscription(props.dispatchEmail));
    }

    const runAgentFn = mkFn('RunAgentFn', 'sfn/runAgent.ts', {
      BEDROCK_MODEL_ID: bedrockModelId,
    });
    // Task 14: real agent uses Bedrock. 30s timeout, single-model invoke permission.
    runAgentFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/${bedrockModelId}`,
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${bedrockModelId}`,
        ],
      }),
    );
    (runAgentFn.node.defaultChild as lambda.CfnFunction).timeout = 30;
    eventsTable.grantReadData(runAgentFn);

    const saveAlertFn = mkFn('SaveAlertFn', 'sfn/saveAlert.ts');
    alertsTable.grantWriteData(saveAlertFn);

    const notifyFn = mkFn('NotifyFn', 'sfn/notify.ts', {
      DISPATCH_TOPIC_ARN: dispatchTopic.topicArn,
    });
    alertsTable.grantReadData(notifyFn);
    dispatchTopic.grantPublish(notifyFn);

    const activateShelterFn = mkFn('ActivateShelterFn', 'sfn/activateShelter.ts');
    alertsTable.grantReadWriteData(activateShelterFn);

    const droneMissionFn = mkFn('DroneMissionFn', 'sfn/droneMission.ts');
    alertsTable.grantReadWriteData(droneMissionFn);

    const markDispatchedFn = mkFn('MarkDispatchedFn', 'sfn/markDispatched.ts');
    alertsTable.grantReadWriteData(markDispatchedFn);

    // ---------------------------------------------------------------------
    // Task 11: state machine
    //   RunAgent -> (raised?) -> SaveAlert (.waitForTaskToken)
    //            -> Dispatch (parallel) -> MarkDispatched
    // ---------------------------------------------------------------------
    const runAgentTask = new tasks.LambdaInvoke(this, 'RunAgent', {
      lambdaFunction: runAgentFn,
      payloadResponseOnly: true,
    });

    const saveAlertTask = new tasks.LambdaInvoke(this, 'SaveAlert', {
      lambdaFunction: saveAlertFn,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      payload: sfn.TaskInput.fromObject({
        'alert.$': '$.alert',
        taskToken: sfn.JsonPath.taskToken,
      }),
      taskTimeout: sfn.Timeout.duration(Duration.hours(1)),
      resultPath: '$.approval',
    });

    const dispatchParallel = new sfn.Parallel(this, 'Dispatch', {
      resultPath: '$.dispatch',
    })
      .branch(
        new tasks.LambdaInvoke(this, 'NotifyDispatch', {
          lambdaFunction: notifyFn,
          payload: sfn.TaskInput.fromObject({ 'alertId.$': '$.approval.alertId' }),
          payloadResponseOnly: true,
        }),
      )
      .branch(
        new tasks.LambdaInvoke(this, 'ActivateShelter', {
          lambdaFunction: activateShelterFn,
          payload: sfn.TaskInput.fromObject({ 'alertId.$': '$.approval.alertId' }),
          payloadResponseOnly: true,
        }),
      )
      .branch(
        new tasks.LambdaInvoke(this, 'WriteDroneMission', {
          lambdaFunction: droneMissionFn,
          payload: sfn.TaskInput.fromObject({ 'alertId.$': '$.approval.alertId' }),
          payloadResponseOnly: true,
        }),
      );

    const markDispatchedTask = new tasks.LambdaInvoke(this, 'MarkDispatched', {
      lambdaFunction: markDispatchedFn,
      payload: sfn.TaskInput.fromObject({ 'alertId.$': '$.approval.alertId' }),
      payloadResponseOnly: true,
    });

    const definition = runAgentTask.next(
      new sfn.Choice(this, 'Raised?')
        .when(
          sfn.Condition.booleanEquals('$.raised', true),
          saveAlertTask.next(dispatchParallel).next(markDispatchedTask),
        )
        .otherwise(new sfn.Succeed(this, 'NoAlert')),
    );

    const stateMachine = new sfn.StateMachine(this, 'ApprovalStateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: Duration.hours(2),
      tracingEnabled: true,
    });

    // ---------------------------------------------------------------------
    // Task 11: events stream -> trigger Lambda -> state machine (debounced)
    // ---------------------------------------------------------------------
    const streamTriggerFn = mkFn('StreamTriggerFn', 'streamTrigger.ts', {
      STATE_MACHINE_ARN: stateMachine.stateMachineArn,
    });
    // Writes a per-zone debounce lock item (conditional put).
    alertsTable.grantReadWriteData(streamTriggerFn);
    stateMachine.grantStartExecution(streamTriggerFn);
    streamTriggerFn.addEventSourceMapping('EventsStreamMapping', {
      eventSourceArn: eventsTable.tableStreamArn!,
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 10,
      retryAttempts: 2,
      bisectBatchOnError: true,
    });
    eventsTable.grantStreamRead(streamTriggerFn);

    // ---------------------------------------------------------------------
    // Task 11: POST /alerts/{id}/approve handler (resumes the execution)
    // ---------------------------------------------------------------------
    const approveFn = mkFn('ApproveFn', 'approve.ts');
    alertsTable.grantReadWriteData(approveFn);
    approveFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['states:SendTaskSuccess'],
        resources: ['*'], // task tokens are opaque; SendTaskSuccess has no resource-level scoping
      }),
    );

    // ---------------------------------------------------------------------
    // Task 10: HTTP API with JWT authorizer on EVERY route + CORS to the web origin
    // ---------------------------------------------------------------------
    const httpApi = new HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: [webOrigin],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
        allowHeaders: ['authorization', 'content-type'],
        maxAge: Duration.hours(1),
      },
      defaultAuthorizer: authorizer,
    });

    httpApi.addRoutes({
      path: '/events',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetEventsIntegration', getEventsFn),
    });
    httpApi.addRoutes({
      path: '/alerts',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetAlertsIntegration', getAlertsFn),
    });
    httpApi.addRoutes({
      path: '/map-data',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetMapDataIntegration', getMapDataFn),
    });
    httpApi.addRoutes({
      path: '/alerts/{id}/approve',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ApproveIntegration', approveFn),
    });
    httpApi.addRoutes({
      path: '/simulate/{scenario}',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SimulateIntegration', simulateFn),
    });
    httpApi.addRoutes({
      path: '/simulate/reset',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SimulateResetIntegration', simulateFn),
    });

    const apiUrl = httpApi.apiEndpoint;

    // ---------------------------------------------------------------------
    // Task 10: Amazon Location – referrer-restricted API key + route calculator
    // ---------------------------------------------------------------------
    const routeCalculator = new location.CfnRouteCalculator(this, 'RouteCalculator', {
      calculatorName: `${this.stackName}-routes`,
      dataSource: 'Esri',
    });

    const mapName = `${this.stackName}-map`;
    const locationMap = new location.CfnMap(this, 'LocationMap', {
      mapName,
      configuration: { style: 'VectorEsriDarkGrayCanvas' },
    });

    const referer = `${webOrigin.replace(/\/+$/, '')}/*`;
    const locationApiKey = new location.CfnAPIKey(this, 'LocationApiKey', {
      keyName: `${this.stackName}-web-key`,
      noExpiry: true,
      restrictions: {
        allowActions: ['geo:GetMap*'],
        allowResources: [locationMap.attrArn],
        allowReferers: [referer],
      },
    });
    locationApiKey.addDependency(locationMap);

    // ---------------------------------------------------------------------
    // Task 12: EventBridge Scheduler every 5 min -> ingest Lambda (least privilege)
    // ---------------------------------------------------------------------
    const ingestFn = new NodejsFunction(this, 'IngestFn', {
      ...commonLambda,
      memorySize: 512,
      timeout: Duration.seconds(60),
      entry: path.join(REPO_ROOT, 'packages/engine/src/ingest/handler.ts'),
      handler: 'handler',
      logGroup: new logs.LogGroup(this, 'IngestFnLogs', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        EVENTS_TABLE: eventsTable.tableName,
        ALERTS_TABLE: alertsTable.tableName,
        GRIDRISK_EVENTS_TABLE: eventsTable.tableName,
        GRIDRISK_SHELTERS_TABLE: sheltersTable.tableName,
        GRIDRISK_SNAPSHOTS_TABLE: snapshotsTable.tableName,
        GRIDRISK_CENTERPOINT_OUTAGES_URL: process.env.GRIDRISK_CENTERPOINT_OUTAGES_URL ?? '',
        DRIVETEXAS_API_KEY: process.env.DRIVETEXAS_API_KEY ?? '',
        GRIDRISK_ALLOW_SYNTHETIC_UTILITY: process.env.GRIDRISK_ALLOW_SYNTHETIC_UTILITY ?? 'false',
        GRIDRISK_SYNTHETIC_ZONE_ID: process.env.GRIDRISK_SYNTHETIC_ZONE_ID ?? 'zone-a',
      },
    });
    eventsTable.grantReadWriteData(ingestFn);
    sheltersTable.grantWriteData(ingestFn);
    snapshotsTable.grantWriteData(ingestFn);

    const schedulerRole = new iam.Role(this, 'IngestSchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    // Least privilege: invoke only the ingest function.
    ingestFn.grantInvoke(schedulerRole);

    new scheduler.CfnSchedule(this, 'IngestSchedule', {
      flexibleTimeWindow: { mode: 'OFF' },
      scheduleExpression: 'rate(5 minutes)',
      target: {
        arn: ingestFn.functionArn,
        roleArn: schedulerRole.roleArn,
      },
    });

    // ---------------------------------------------------------------------
    // H6: publish values to SSM Parameter Store (documented in .env.example)
    // ---------------------------------------------------------------------
    const ssmParams: Record<string, string> = {
      '/gridrisk/api-url': apiUrl,
      '/gridrisk/cognito-user-pool-id': userPool.userPoolId,
      '/gridrisk/cognito-client-id': userPoolClient.userPoolClientId,
      // CloudFormation does not return the raw key value for CfnAPIKey; store the
      // key name and resolve the value at deploy time with `aws location describe-key`.
      '/gridrisk/location-api-key-name': locationApiKey.keyName,
      '/gridrisk/route-calculator-name': routeCalculator.calculatorName!,
      '/gridrisk/location-map-name': mapName,
    };
    for (const [name, value] of Object.entries(ssmParams)) {
      new ssm.StringParameter(this, `Param${name.replace(/\W+/g, '')}`, {
        parameterName: name,
        stringValue: value,
      });
    }

    // ---------------------------------------------------------------------
    // Stack outputs (convenient for the curl demo)
    // ---------------------------------------------------------------------
    new CfnOutput(this, 'ApiUrl', { value: apiUrl });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, 'LocationApiKeyName', { value: locationApiKey.keyName });
    new CfnOutput(this, 'RouteCalculatorName', {
      value: routeCalculator.calculatorName ?? '',
    });
    new CfnOutput(this, 'DispatchTopicArn', { value: dispatchTopic.topicArn });
    new CfnOutput(this, 'StateMachineArn', { value: stateMachine.stateMachineArn });
  }
}
