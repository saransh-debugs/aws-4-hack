/**
 * POST /alerts/{id}/approve  body { actionIds: string[] (>=1) } -> { alert: AlertCardData }
 *
 * Validates actionIds, then resumes the waiting Step Functions execution via
 * SendTaskSuccess using the task token stored on the alert record.
 *   404 unknown alert id
 *   409 alert already approved or dispatched
 *   400 empty or unknown actionIds
 * See CONTRACTS.md.
 *
 * The pending -> approved update is conditional, so two concurrent approvals cannot both
 * resume the execution: the loser gets 409. If SendTaskSuccess fails, the alert goes back to
 * pending so the operator can retry instead of it being stuck at "approved".
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import { ApproveRequestSchema, type AlertCardData } from '@gridrisk/shared';
import { ddb, ALERTS_TABLE, requireEnv } from './shared/ddb';
import {
  fail,
  isAuthenticated,
  isOperator,
  ok,
  parseJsonBody,
  withErrorHandling,
} from './shared/http';

const sfn = new SFNClient({});

interface StoredAlert extends AlertCardData {
  taskToken?: string;
}

function toCardData(item: StoredAlert): AlertCardData {
  const { taskToken: _taskToken, ...card } = item;
  return card;
}

export const handler = withErrorHandling(
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    if (!isAuthenticated(event)) return fail('UNAUTHENTICATED', 'Missing or invalid token');
    if (!isOperator(event)) return fail('FORBIDDEN', 'Operator role required to approve requests');

    const id = event.pathParameters?.id;
    if (!id) return fail('BAD_REQUEST', 'Missing alert id');

    const parsed = ApproveRequestSchema.safeParse(parseJsonBody(event));
    if (!parsed.success) return fail('BAD_REQUEST', 'actionIds must be a non-empty array');
    const { actionIds } = parsed.data;

    const res = await ddb.send(new GetCommand({ TableName: ALERTS_TABLE(), Key: { id } }));
    const alert = res.Item as StoredAlert | undefined;
    if (!alert) return fail('NOT_FOUND', `Unknown alert: ${id}`);

    if (alert.status !== 'pending') {
      return fail('CONFLICT', `Alert is already ${alert.status}`);
    }

    // Every requested action must exist on the alert.
    const known = new Set(alert.proposedActions.map((a) => a.id));
    const unknown = actionIds.filter((a) => !known.has(a));
    if (unknown.length > 0) {
      return fail('BAD_REQUEST', `Unknown actionIds: ${unknown.join(', ')}`);
    }

    // Mark approved (only if still pending) and resume the waiting execution. Dispatch +
    // MarkDispatched run inside the state machine, which will flip status to 'dispatched'.
    let updated;
    try {
      updated = await ddb.send(
        new UpdateCommand({
          TableName: ALERTS_TABLE(),
          Key: { id },
          UpdateExpression: 'SET #s = :approved, approvedActionIds = :ids',
          ConditionExpression: '#s = :pending',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':approved': 'approved',
            ':pending': 'pending',
            ':ids': actionIds,
          },
          ReturnValues: 'ALL_NEW',
        }),
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return fail('CONFLICT', 'Alert was approved by someone else');
      }
      throw err;
    }

    if (alert.taskToken) {
      try {
        await sfn.send(
          new SendTaskSuccessCommand({
            taskToken: alert.taskToken,
            output: JSON.stringify({ alertId: id, actionIds }),
          }),
        );
      } catch (err) {
        // Roll back so the alert is approvable again, then surface a 500.
        await ddb.send(
          new UpdateCommand({
            TableName: ALERTS_TABLE(),
            Key: { id },
            UpdateExpression: 'SET #s = :pending REMOVE approvedActionIds',
            ConditionExpression: '#s = :approved',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':pending': 'pending', ':approved': 'approved' },
          }),
        );
        throw err;
      }
    }

    try {
      const claims = (
        event.requestContext as {
          authorizer?: { jwt?: { claims?: Record<string, unknown> } };
        }
      ).authorizer?.jwt?.claims ?? {};
      await ddb.send(
        new UpdateCommand({
          TableName: requireEnv('AUDIT_TABLE'),
          Key: { id: `approval#${id}#${Date.now()}` },
          UpdateExpression: 'SET alertId = :alertId, actionIds = :actionIds, actor = :actor, createdAt = :createdAt',
          ExpressionAttributeValues: {
            ':alertId': id,
            ':actionIds': actionIds,
            ':actor': String(claims.email ?? claims.sub ?? 'unknown'),
            ':createdAt': new Date().toISOString(),
          },
        }),
      );
    } catch (auditError) {
      console.error('Approval succeeded but audit write failed', auditError);
    }

    return ok({ alert: toCardData(updated.Attributes as StoredAlert) });
  },
);
