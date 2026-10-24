/**
 * POST /alerts/{id}/approve  body { actionIds: string[] (>=1) } -> { alert: AlertCardData }
 *
 * Validates actionIds, then resumes the waiting Step Functions execution via
 * SendTaskSuccess using the task token stored on the alert record.
 *   404 unknown alert id
 *   409 alert already approved or dispatched
 *   400 empty or unknown actionIds
 * See CONTRACTS.md.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import { ApproveRequestSchema, type AlertCardData } from '@gridrisk/shared';
import { ddb, ALERTS_TABLE } from './shared/ddb';
import { fail, isAuthenticated, ok, parseJsonBody, withErrorHandling } from './shared/http';

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

    // Mark approved and resume the waiting execution. Dispatch + MarkDispatched
    // run inside the state machine, which will flip status to 'dispatched'.
    const updated = await ddb.send(
      new UpdateCommand({
        TableName: ALERTS_TABLE(),
        Key: { id },
        UpdateExpression: 'SET #s = :approved, approvedActionIds = :ids',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':approved': 'approved', ':ids': actionIds },
        ReturnValues: 'ALL_NEW',
      }),
    );

    if (alert.taskToken) {
      await sfn.send(
        new SendTaskSuccessCommand({
          taskToken: alert.taskToken,
          output: JSON.stringify({ alertId: id, actionIds }),
        }),
      );
    }

    return ok({ alert: toCardData(updated.Attributes as StoredAlert) });
  },
);
