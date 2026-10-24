/**
 * Create or update a Cognito demo user without the aws CLI.
 *
 * Reads the user pool id from SSM (/gridrisk/cognito-user-pool-id) unless COGNITO_USER_POOL_ID
 * is set. Username and password come from env:
 *   DEMO_EMAIL     (default demo@example.com)
 *   DEMO_PASSWORD  (required; must satisfy the pool password policy)
 *
 * Idempotent: admin-create-user with SUPPRESS (no email), then a permanent password. If the
 * user already exists, it just (re)sets the permanent password.
 *
 * Usage: DEMO_PASSWORD='...' npm run demo-user -w @gridrisk/infra
 */
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const REGION = process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? 'us-east-1';

async function resolveUserPoolId(): Promise<string> {
  if (process.env.COGNITO_USER_POOL_ID) return process.env.COGNITO_USER_POOL_ID;
  const ssm = new SSMClient({ region: REGION });
  const res = await ssm.send(new GetParameterCommand({ Name: '/gridrisk/cognito-user-pool-id' }));
  const value = res.Parameter?.Value;
  if (!value) {
    throw new Error(
      'Could not resolve the user pool id. Set COGNITO_USER_POOL_ID or deploy the stack first.',
    );
  }
  return value;
}

async function main(): Promise<void> {
  const email = process.env.DEMO_EMAIL ?? 'demo@example.com';
  const password = process.env.DEMO_PASSWORD;
  if (!password) {
    throw new Error('DEMO_PASSWORD is required (it is never logged).');
  }

  const userPoolId = await resolveUserPoolId();
  const client = new CognitoIdentityProviderClient({ region: REGION });

  try {
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        MessageAction: 'SUPPRESS',
      }),
    );
    process.stdout.write(`created user ${email}\n`);
  } catch (err) {
    if (err instanceof UsernameExistsException) {
      process.stdout.write(`user ${email} already exists; resetting password\n`);
    } else {
      throw err;
    }
  }

  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: email,
      Password: password,
      Permanent: true,
    }),
  );
  process.stdout.write(`set permanent password for ${email}\n`);
}

main().catch((err) => {
  process.stderr.write(`demo-user failed: ${String(err)}\n`);
  process.exit(1);
});
