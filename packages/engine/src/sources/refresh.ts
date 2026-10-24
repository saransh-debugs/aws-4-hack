import { fetchEmpower, type EmpowerCount } from './empower';
import { fetchNwsAlerts } from './nws';
import type { DemoEvent } from '@gridrisk/shared';

export interface SnapshotBundle {
  generatedAt: string;
  nws: DemoEvent[];
  empower: EmpowerCount[];
}

/** Fetch every external snapshot together so a scheduled job can publish one consistent bundle. */
export async function fetchSnapshotBundle(
  zips: string[],
  dependencies: {
    fetchNws?: () => Promise<DemoEvent[]>;
    fetchEmpower?: (zips: string[]) => Promise<EmpowerCount[]>;
    now?: () => Date;
  } = {},
): Promise<SnapshotBundle> {
  const [nws, empower] = await Promise.all([
    (dependencies.fetchNws ?? fetchNwsAlerts)(),
    (dependencies.fetchEmpower ?? fetchEmpower)(zips),
  ]);
  return {
    generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    nws,
    empower,
  };
}
