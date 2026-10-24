/**
 * Shared HTTP helpers for API Gateway (HTTP API v2) Lambda handlers.
 * Responses and errors follow docs/CONTRACTS.md.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

export type ApiErrorCode =
  'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST' | 'INTERNAL';

const ERROR_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BAD_REQUEST: 400,
  INTERNAL: 500,
};

const COMMON_HEADERS = {
  'content-type': 'application/json',
} as const;

export function ok(body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: COMMON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function fail(code: ApiErrorCode, message: string): APIGatewayProxyResultV2 {
  return {
    statusCode: ERROR_STATUS[code],
    headers: COMMON_HEADERS,
    body: JSON.stringify({ error: { code, message } }),
  };
}

/** HTTP API JWT authorizer guarantees a verified claim, but guard anyway. */
export function isAuthenticated(event: APIGatewayProxyEventV2): boolean {
  const authorizer = (event.requestContext as { authorizer?: unknown }).authorizer;
  if (!authorizer || typeof authorizer !== 'object') return false;
  const jwt = (authorizer as { jwt?: { claims?: Record<string, unknown> } }).jwt;
  return Boolean(jwt?.claims && Object.keys(jwt.claims).length > 0);
}

/** Simulation mutates the shared demo tables and is disabled in live deployments. */
export function isDemoMode(): boolean {
  return process.env.GRIDRISK_DEMO_MODE === 'true' || process.env.NODE_ENV === 'test';
}

/** Mutation role check. Cognito groups are included in the verified JWT claims. */
export function isOperator(event: APIGatewayProxyEventV2): boolean {
  if (process.env.GRIDRISK_REQUIRE_OPERATOR_ROLE !== 'true') return true;
  const claims = (
    event.requestContext as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } }
  ).authorizer?.jwt?.claims;
  const groups = claims?.['cognito:groups'];
  const values = Array.isArray(groups)
    ? groups
    : typeof groups === 'string'
      ? groups.split(',')
      : [];
  return values.includes(process.env.GRIDRISK_OPERATOR_GROUP ?? 'gridrisk-operator');
}

/** Parse a JSON body, returning undefined when the body is empty or invalid JSON. */
export function parseJsonBody(event: APIGatewayProxyEventV2): unknown {
  if (!event.body) return undefined;
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** Wrap a handler so uncaught errors become a CONTRACTS-shaped 500 instead of a raw stack. */
export function withErrorHandling(
  handler: (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>,
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2> {
  return async (event) => {
    try {
      return await handler(event);
    } catch (err) {
      console.error('Unhandled handler error', err);
      return fail('INTERNAL', 'Internal server error');
    }
  };
}
