import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { AlertStatusUpdateSchema, type AlertCardData } from '@gridrisk/shared';
import { ddb, ALERTS_TABLE, requireEnv } from './shared/ddb';
import {
  fail,
  isAuthenticated,
  isOperator,
  isSupervisor,
  ok,
  withErrorHandling,
} from './shared/http';

export const handler = withErrorHandling(
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    if (!isAuthenticated(event)) return fail('UNAUTHENTICATED', 'Missing or invalid token');
    const rawStatus = event.rawPath?.endsWith('/escalate') ? 'escalated' : 'acknowledged';
    if (rawStatus === 'escalated' ? !isSupervisor(event) : !isOperator(event)) {
      return fail('FORBIDDEN', `${rawStatus} role required`);
    }
    const id = event.pathParameters?.id;
    if (!id) return fail('BAD_REQUEST', 'Missing alert id');
    const parsed = AlertStatusUpdateSchema.safeParse({ status: rawStatus });
    if (!parsed.success) return fail('BAD_REQUEST', 'Invalid alert status');
    const current = await ddb.send(new GetCommand({ TableName: ALERTS_TABLE(), Key: { id } }));
    if (!current.Item) return fail('NOT_FOUND', `Unknown alert: ${id}`);
    const claims =
      (event.requestContext as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } })
        .authorizer?.jwt?.claims ?? {};
    const actor = String(claims.email ?? claims.sub ?? 'unknown');
    const timestamp = new Date().toISOString();
    const updated = await ddb.send(
      new UpdateCommand({
        TableName: ALERTS_TABLE(),
        Key: { id },
        UpdateExpression:
          'SET #s = :status, statusUpdatedAt = :timestamp, statusUpdatedBy = :actor',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':status': parsed.data.status,
          ':timestamp': timestamp,
          ':actor': actor,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    await ddb.send(
      new UpdateCommand({
        TableName: requireEnv('AUDIT_TABLE'),
        Key: { id: `status#${id}#${timestamp}` },
        UpdateExpression:
          'SET alertId = :alertId, status = :status, actor = :actor, createdAt = :createdAt',
        ExpressionAttributeValues: {
          ':alertId': id,
          ':status': parsed.data.status,
          ':actor': actor,
          ':createdAt': timestamp,
        },
      }),
    );
    return ok({ alert: updated.Attributes as AlertCardData });
  },
);
