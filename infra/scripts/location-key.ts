/**
 * Prints the Amazon Location API key value for the web build (VITE_LOCATION_API_KEY), or
 * nothing if the key doesn't exist yet. The key is referrer-restricted, so it is designed to
 * ship in browser code. Usage: tsx scripts/location-key.ts <key-name>
 */
import { DescribeKeyCommand, LocationClient } from '@aws-sdk/client-location';

const name = process.argv[2];
if (!name) {
  process.stderr.write('usage: location-key.ts <key-name>\n');
  process.exit(2);
}
try {
  const client = new LocationClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  const res = await client.send(new DescribeKeyCommand({ KeyName: name }));
  process.stdout.write(res.Key ?? '');
} catch (err) {
  if (!(err instanceof Error && err.name === 'ResourceNotFoundException')) throw err;
}
