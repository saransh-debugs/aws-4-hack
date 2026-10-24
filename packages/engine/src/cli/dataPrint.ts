import { readFile } from 'node:fs/promises';

async function main(): Promise<void> {
  for (const name of ['manifest.json', 'nws.json', 'empower.json']) {
    const contents = await readFile(new URL(`../../snapshots/${name}`, import.meta.url), 'utf8');
    console.log(`--- ${name} ---\n${JSON.stringify(JSON.parse(contents), null, 2)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
