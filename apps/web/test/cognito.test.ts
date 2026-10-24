import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CognitoAuthError,
  getValidToken,
  loadSession,
  signIn,
  signOut,
  type CognitoConfig,
} from '../src/auth/cognito';

const CONFIG: CognitoConfig = { region: 'us-east-1', clientId: 'client-123' };

/** A JWT whose payload sets `exp` to `expSeconds`. Signature is irrelevant (not verified here). */
function fakeJwt(expSeconds: number): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64({ exp: expSeconds })}.sig`;
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('signIn', () => {
  it('stores the ID token and expiry on success', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = fakeJwt(exp);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ AuthenticationResult: { IdToken: token } }));

    const session = await signIn('demo@example.com', 'pw', CONFIG, fetchImpl as typeof fetch);

    expect(session.idToken).toBe(token);
    expect(session.email).toBe('demo@example.com');
    expect(loadSession()?.idToken).toBe(token);

    // The request shape matches Cognito's InitiateAuth.
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://cognito-idp.us-east-1.amazonaws.com/');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Amz-Target']).toBe('AWSCognitoIdentityProviderService.InitiateAuth');
    expect(headers['Content-Type']).toBe('application/x-amz-json-1.1');
    expect(JSON.parse(init.body as string)).toMatchObject({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: 'client-123',
      AuthParameters: { USERNAME: 'demo@example.com', PASSWORD: 'pw' },
    });
  });

  it('throws a CognitoAuthError on a non-2xx response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: 'Incorrect username or password.' }, false, 400));
    await expect(signIn('a@b.c', 'bad', CONFIG, fetchImpl as typeof fetch)).rejects.toBeInstanceOf(
      CognitoAuthError,
    );
  });

  it('surfaces NEW_PASSWORD_REQUIRED as an error', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ChallengeName: 'NEW_PASSWORD_REQUIRED' }));
    await expect(signIn('a@b.c', 'pw', CONFIG, fetchImpl as typeof fetch)).rejects.toThrow(
      /NEW_PASSWORD_REQUIRED/,
    );
    expect(loadSession()).toBeNull();
  });
});

describe('getValidToken / signOut', () => {
  it('returns the token until it expires, then null', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = fakeJwt(exp);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ AuthenticationResult: { IdToken: token } }));
    await signIn('a@b.c', 'pw', CONFIG, fetchImpl as typeof fetch);

    expect(getValidToken()).toBe(token);
    // Far in the future → treated as expired.
    expect(getValidToken(Date.now() + 4_000_000)).toBeNull();
  });

  it('signOut clears the stored token', async () => {
    const token = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ AuthenticationResult: { IdToken: token } }));
    await signIn('a@b.c', 'pw', CONFIG, fetchImpl as typeof fetch);
    signOut();
    expect(getValidToken()).toBeNull();
    expect(loadSession()).toBeNull();
  });
});
