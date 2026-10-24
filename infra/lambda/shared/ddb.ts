/**
 * Shared DynamoDB document client and env lookups for Lambda handlers.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const base = new DynamoDBClient({});

export const ddb = DynamoDBDocumentClient.from(base, {
  marshallOptions: { removeUndefinedValues: true },
});

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const EVENTS_TABLE = (): string => requireEnv('EVENTS_TABLE');
export const ALERTS_TABLE = (): string => requireEnv('ALERTS_TABLE');
export const HEALTH_TABLE = (): string => requireEnv('HEALTH_TABLE');
