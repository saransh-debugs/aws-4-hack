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

  it('Task 10: CORS allows only the configured web origin', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: Match.objectLike({
        AllowOrigins: ['https://app.example.com'],
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
        AllowReferers: ['https://app.example.com/*'],
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

  it('Task 14: RunAgent is granted bedrock:InvokeModel and a 30s timeout', () => {
    const { template } = synth();
    // A function with a 30s timeout exists (RunAgent).
    template.hasResourceProperties('AWS::Lambda::Function', { Timeout: 30 });
    // An IAM policy grants bedrock:InvokeModel.
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([Match.objectLike({ Action: 'bedrock:InvokeModel' })]),
      }),
    });
  });
});
