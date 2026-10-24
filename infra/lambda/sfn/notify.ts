/**
 * Step Functions Dispatch branch: SNS publish.
 * Publishes the approved alert to the dispatch SNS topic (email/SMS subscription).
 */
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import type { AlertCardData } from '@gridrisk/shared';
import { ddb, ALERTS_TABLE, requireEnv } from '../shared/ddb';

const sns = new SNSClient({});

interface Input {
  alertId: string;
}

export async function handler(input: Input): Promise<{ published: boolean }> {
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
    `Approved actions: ${alert.proposedActions.map((a) => a.label).join('; ')}`,
  ];

  await sns.send(
    new PublishCommand({
      TopicArn: topicArn,
      Subject: alert.title.slice(0, 100),
      Message: lines.join('\n'),
    }),
  );

  return { published: true };
}
