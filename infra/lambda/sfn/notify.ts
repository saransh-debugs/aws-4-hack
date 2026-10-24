/**
 * Step Functions Dispatch branch: SNS publish.
 * Publishes the approved notification request to the dispatch SNS topic (email/SMS subscription).
 */
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import type { AlertCardData } from '@gridrisk/shared';
import { ddb, ALERTS_TABLE, requireEnv } from '../shared/ddb';

const sns = new SNSClient({});

interface Input {
  alertId: string;
}

export async function handler(input: Input): Promise<{
  requestId: string;
  status: string;
  createdAt: string;
}> {
  const topicArn = requireEnv('DISPATCH_TOPIC_ARN');

  const res = await ddb.send(
    new GetCommand({ TableName: ALERTS_TABLE(), Key: { id: input.alertId } }),
  );
  const alert = res.Item as AlertCardData | undefined;
  if (!alert) throw new Error(`Alert not found: ${input.alertId}`);

  const lines = [
    alert.title,
    '',
    ...alert.points.map((p) => `- ${p}`),
    '',
    `Isolation window (assumed): ${alert.isolationWindowMinutes} min`,
    `Approved requests: ${alert.proposedActions.map((a) => a.label).join('; ')}`,
  ];

  const result = await sns.send(
    new PublishCommand({
      TopicArn: topicArn,
      Subject: alert.title.slice(0, 100),
      Message: lines.join('\n'),
    }),
  );

  const createdAt = new Date().toISOString();
  const requestId = result.MessageId ?? `notification-request#${input.alertId}`;
  await ddb.send(
    new PutCommand({
      TableName: ALERTS_TABLE(),
      Item: {
        id: `notification-request#${input.alertId}`,
        kind: 'notification_request',
        requestId,
        alertId: input.alertId,
        status: 'sent',
        createdAt,
      },
      ConditionExpression: 'attribute_not_exists(id)',
    }),
  );
  return { requestId, status: 'sent', createdAt };
}
