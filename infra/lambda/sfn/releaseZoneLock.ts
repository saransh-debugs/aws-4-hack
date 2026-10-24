import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, ALERTS_TABLE } from '../shared/ddb';

export async function handler(input: { zoneId: string }): Promise<{ released: boolean }> {
  await ddb.send(
    new DeleteCommand({ TableName: ALERTS_TABLE(), Key: { id: `zone-lock#${input.zoneId}` } }),
  );
  return { released: true };
}
