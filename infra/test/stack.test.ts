import { describe, expect, it } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { GridRiskStack } from '../lib/gridrisk-stack';

function synth() {
  const app = new App();
  const stack = new GridRiskStack(app, 'TestStack', {
    env: { account: '111111111111', region: 'us-east-1' },
    webOrigin: 'https://app.example.com',
    dispatchEmail: 'ops@example.com',
  });
  return { stack, template: Template.fromStack(stack) };
}

describe('GridRiskStack', () => {
  it('synthesizes in us-east-1', () => {
    const { stack } = synth();
    expect(stack.region).toBe('us-east-1');
  });

  it('Task 10: has event, alert, shelter, and snapshot tables', () => {
    const { template } = synth();
    template.resourceCountIs('AWS::DynamoDB::Table', 4);
  });

  it('Task 10: the events table enables a NEW_IMAGE stream', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      StreamSpecification: { StreamViewType: 'NEW_IMAGE' },
    });
  });

  it('Task 10: has a Cognito user pool and JWT authorizer', () => {
    const { template } = synth();
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
    });
  });

  it('Task 10: the JWT authorizer is attached to EVERY route', () => {
    const { template } = synth();
    const routes = template.findResources('AWS::ApiGatewayV2::Route');
    const routeKeys = Object.values(routes).map(
      (r) => (r.Properties as { RouteKey: string }).RouteKey,
    );

    // Our five contract routes must all be present.
    expect(routeKeys).toEqual(
      expect.arrayContaining([
        'GET /events',
        'GET /alerts',
        'POST /alerts/{id}/approve',
        'POST /simulate/{scenario}',
        'POST /simulate/reset',
      ]),
    );

    // No route is left without the JWT authorizer.
    for (const route of Object.values(routes)) {
      const props = route.Properties as { AuthorizationType?: string; AuthorizerId?: unknown };
      expect(props.AuthorizationType).toBe('JWT');
      expect(props.AuthorizerId).toBeDefined();
    }
  });

  it('Task 10: CORS allows the configured web origin plus localhost dev', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: Match.objectLike({
        AllowOrigins: ['http://localhost:5173', 'https://app.example.com'],
      }),
    });
  });

  it('Task 10: Lambdas run on Node 22', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
    });
  });

  it('Task 10: Amazon Location API key is referrer-restricted + a route calculator exists', () => {
    const { template } = synth();
    template.resourceCountIs('AWS::Location::RouteCalculator', 1);
    template.hasResourceProperties('AWS::Location::APIKey', {
      Restrictions: Match.objectLike({
        AllowActions: ['geo-maps:GetStaticMap', 'geo-maps:GetTile', 'geo-routes:CalculateRoutes'],
        AllowReferers: Match.arrayWith(['http://localhost:5173/*', 'https://app.example.com/*']),
      }),
    });
  });

  it('Task 10: H6 values are published to SSM Parameter Store', () => {
    const { template } = synth();
    const params = template.findResources('AWS::SSM::Parameter');
    const names = Object.values(params).map((p) => (p.Properties as { Name: string }).Name);
    expect(names).toEqual(
      expect.arrayContaining([
        '/gridrisk/api-url',
        '/gridrisk/cognito-user-pool-id',
        '/gridrisk/cognito-client-id',
        '/gridrisk/location-api-key-name',
      ]),
    );
  });

  it('Task 11: has a Step Functions state machine with WaitForApproval + Dispatch', () => {
    const { template } = synth();
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);

    const machines = template.findResources('AWS::StepFunctions::StateMachine');
    const defn = Object.values(machines)[0]?.Properties as {
      DefinitionString: unknown;
    };
    const defnStr = JSON.stringify(defn.DefinitionString);

    // Named states from Task 11.
    expect(defnStr).toContain('RunAgent');
    expect(defnStr).toContain('SaveAlert');
    expect(defnStr).toContain('Dispatch');
    expect(defnStr).toContain('MarkDispatched');
    // WaitForApproval uses .waitForTaskToken.
    expect(defnStr).toContain('.waitForTaskToken');
  });

  it('Task 11: the events stream is wired to a trigger via an event source mapping', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      StartingPosition: 'LATEST',
    });
  });

  it('Task 12: EventBridge Scheduler runs every 5 minutes against the ingest Lambda', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: 'rate(5 minutes)',
    });
  });

  it('Task 14: RunAgent has the default model env, a 30s timeout and 512 MB memory', () => {
    const { template } = synth();
    // Default cross-region inference profile, 30 s timeout, 512 MB.
    template.hasResourceProperties('AWS::Lambda::Function', {
      Timeout: 30,
      MemorySize: 512,
      Environment: Match.objectLike({
        Variables: Match.objectLike({ BEDROCK_MODEL_ID: 'us.anthropic.claude-sonnet-4-6' }),
      }),
    });
  });

  it('Task 14: RunAgent IAM policy grants bedrock:InvokeModel on exactly the scoped ARNs', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'bedrock:InvokeModel',
            Effect: 'Allow',
            Resource: [
              'arn:aws:bedrock:us-east-1:111111111111:inference-profile/us.anthropic.claude-sonnet-4-6',
              'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-6',
              'arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-sonnet-4-6',
              'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-sonnet-4-6',
            ],
          }),
        ]),
      }),
    });
  });

  it('Task 15: a private S3 web bucket blocks all public access', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('Task 15: a CloudFront distribution uses OAC and has an /api/* behavior', () => {
    const { template } = synth();
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    // Origin Access Control resource exists.
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);

    const dists = template.findResources('AWS::CloudFront::Distribution');
    const config = (
      Object.values(dists)[0]?.Properties as {
        DistributionConfig: {
          DefaultRootObject: string;
          DefaultCacheBehavior: { ViewerProtocolPolicy: string };
          CacheBehaviors?: Array<{ PathPattern: string }>;
          CustomErrorResponses?: Array<{ ErrorCode: number; ResponseCode: number }>;
        };
      }
    ).DistributionConfig;

    expect(config.DefaultRootObject).toBe('index.html');
    expect(config.DefaultCacheBehavior.ViewerProtocolPolicy).toBe('redirect-to-https');
    const patterns = (config.CacheBehaviors ?? []).map((b) => b.PathPattern);
    expect(patterns).toContain('/api/*');
    // SPA fallback: 403 and 404 -> 200 /index.html.
    const errorCodes = (config.CustomErrorResponses ?? []).map((e) => e.ErrorCode).sort();
    expect(errorCodes).toEqual([403, 404]);
  });

  it('Task 15: a CloudFront Function strips the /api prefix on viewer-request', () => {
    const { template } = synth();
    template.resourceCountIs('AWS::CloudFront::Function', 1);
    const fns = template.findResources('AWS::CloudFront::Function');
    const code = (Object.values(fns)[0]?.Properties as { FunctionCode: string }).FunctionCode;
    expect(code).toContain('/api');
  });

  it('Task 15: the stack outputs WebUrl and publishes /gridrisk/web-url to SSM', () => {
    const { template } = synth();
    template.hasOutput('WebUrl', {});
    const params = template.findResources('AWS::SSM::Parameter');
    const names = Object.values(params).map((p) => (p.Properties as { Name: string }).Name);
    expect(names).toContain('/gridrisk/web-url');
  });
});
