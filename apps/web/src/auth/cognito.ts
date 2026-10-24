/**
 * Task 13b – Cognito auth (owner: Bushra, with Darsh).
 *
 * Minimal USER_PASSWORD_AUTH sign-in against the Cognito IDP endpoint with a plain `fetch`, so
 * the web bundle stays free of aws-amplify. The ID token (and its expiry) is kept in
 * sessionStorage; `getValidToken` returns it until it expires. NEW_PASSWORD_REQUIRED and other
 * challenges surface as an error — the demo user has a permanent password.
 */

const STORAGE_KEY = 'gridrisk.auth';
/** Refresh a little early so a request started near expiry still carries a valid token. */
const EXPIRY_SKEW_MS = 30_000;

export interface AuthSession {
  idToken: string;
  email: string;
  /** Epoch ms when the token expires. */
  expiresAt: number;
}

export class CognitoAuthError extends Error {
  override readonly name = 'CognitoAuthError';
}

export interface CognitoConfig {
  region: string;
  clientId: string;
}

/** Reads the Cognito config from Vite env; throws if live mode is missing it. */
export function readCognitoConfig(
  region: string | undefined = import.meta.env.VITE_AWS_REGION,
  clientId: string | undefined = import.meta.env.VITE_COGNITO_CLIENT_ID,
): CognitoConfig {
  if (!region || !clientId) {
    throw new CognitoAuthError('Missing VITE_AWS_REGION or VITE_COGNITO_CLIENT_ID for live mode');
  }
  return { region, clientId };
}

function endpoint(region: string): string {
  return `https://cognito-idp.${region}.amazonaws.com/`;
}

/** Decode a JWT payload without verifying it (verification happens server-side). */
function decodeJwtExp(idToken: string): number | undefined {
  const payload = idToken.split('.')[1];
  if (!payload) return undefined;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return typeof json.exp === 'number' ? json.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

interface InitiateAuthResponse {
  AuthenticationResult?: { IdToken?: string; ExpiresIn?: number };
  ChallengeName?: string;
}

/**
 * Sign in with email + password. On success, stores the session and returns it. A challenge
 * (e.g. NEW_PASSWORD_REQUIRED) or any non-2xx becomes a CognitoAuthError.
 */
export async function signIn(
  email: string,
  password: string,
  config: CognitoConfig = readCognitoConfig(),
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<AuthSession> {
  let res: Response;
  try {
    res = await fetchImpl(endpoint(config.region), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: config.clientId,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      }),
    });
  } catch (err) {
    throw new CognitoAuthError(`Network error during sign-in: ${String(err)}`);
  }

  const body = (await res.json().catch(() => ({}))) as InitiateAuthResponse & { message?: string };

  if (!res.ok) {
    throw new CognitoAuthError(body.message ?? 'Sign-in failed. Check your email and password.');
  }
  if (body.ChallengeName) {
    throw new CognitoAuthError(
      `Additional step required (${body.ChallengeName}). Ask an admin to set a permanent password.`,
    );
  }
  const idToken = body.AuthenticationResult?.IdToken;
  if (!idToken) {
    throw new CognitoAuthError('Sign-in succeeded but no ID token was returned.');
  }

  const expFromJwt = decodeJwtExp(idToken);
  const expiresIn = body.AuthenticationResult?.ExpiresIn;
  const expiresAt =
    expFromJwt ?? (expiresIn ? Date.now() + expiresIn * 1000 : Date.now() + 3_600_000);

  const session: AuthSession = { idToken, email, expiresAt };
  storeSession(session);
  return session;
}

export function storeSession(session: AuthSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Non-fatal: the app still works for the current tab via the returned session.
  }
}

export function loadSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (typeof parsed.idToken === 'string' && typeof parsed.expiresAt === 'number') return parsed;
    return null;
  } catch {
    return null;
  }
}

/** The stored ID token, or null when signed out or (about to be) expired. */
export function getValidToken(now: number = Date.now()): string | null {
  const session = loadSession();
  if (!session) return null;
  if (session.expiresAt - EXPIRY_SKEW_MS <= now) return null;
  return session.idToken;
}

export function signOut(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
