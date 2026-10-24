import { mkdir, writeFile } from 'node:fs/promises';
import { fetchEmpower } from '../sources/empower';
import { fetchNwsAlerts } from '../sources/nws';
import { ZONE_A } from '@gridrisk/shared/fixtures';

const snapshotDir = new URL('../../snapshots/', import.meta.url);

async function main(): Promise<void> {
  const [nws, empower] = await Promise.all([fetchNwsAlerts(), fetchEmpower(ZONE_A.zips)]);
  await mkdir(snapshotDir, { recursive: true });
  await Promise.all([
    writeFile(new URL('nws.json', snapshotDir), `${JSON.stringify(nws, null, 2)}\n`),
    writeFile(new URL('empower.json', snapshotDir), `${JSON.stringify(empower, null, 2)}\n`),
  ]);
  console.log(`Wrote ${nws.length} NWS events and ${empower.length} emPOWER ZIP rows.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
