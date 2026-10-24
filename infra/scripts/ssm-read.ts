/**
 * Tiny SSM reader used by scripts/deploy.sh (the aws CLI is not installed).
 *
 * Usage: tsx scripts/ssm-read.ts <parameter-name>
 * Prints the parameter value to stdout, or nothing (exit 0) if it does not exist, so the
 * caller can fall back to a default without treating a missing param as a hard error.
 */
import { SSMClient, GetParameterCommand, ParameterNotFound } from '@aws-sdk/client-ssm';

async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name) {
    process.stderr.write('usage: ssm-read.ts <parameter-name>\n');
    process.exit(2);
  }

  const client = new SSMClient({
    region: process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  });

  try {
    const res = await client.send(new GetParameterCommand({ Name: name }));
    process.stdout.write(res.Parameter?.Value ?? '');
  } catch (err) {
    if (err instanceof ParameterNotFound) {
      // Not deployed yet: print nothing, succeed.
      return;
    }
    throw err;
  }
}

main().catch((err) => {
  process.stderr.write(`ssm-read failed: ${String(err)}\n`);
  process.exit(1);
});
