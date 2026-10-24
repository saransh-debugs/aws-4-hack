import { mkdir, writeFile } from 'node:fs/promises';
import { fetchSnapshotBundle } from '../sources/refresh';
import { ZONES } from '@gridrisk/shared/fixtures';

const snapshotDir = new URL('../../snapshots/', import.meta.url);

async function main(): Promise<void> {
  const bundle = await fetchSnapshotBundle(ZONES.flatMap((zone) => zone.zips));
  await mkdir(snapshotDir, { recursive: true });
  await Promise.all([
    writeFile(new URL('nws.json', snapshotDir), `${JSON.stringify(bundle.nws, null, 2)}\n`),
    writeFile(new URL('empower.json', snapshotDir), `${JSON.stringify(bundle.empower, null, 2)}\n`),
    writeFile(
      new URL('manifest.json', snapshotDir),
      `${JSON.stringify({ generatedAt: bundle.generatedAt, sources: { nws: bundle.nws.length, empower: bundle.empower.length } }, null, 2)}\n`,
    ),
  ]);
  console.log(
    `Wrote ${bundle.nws.length} NWS events and ${bundle.empower.length} emPOWER ZIP rows.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
