export interface FreshnessStatus {
  source: string;
  fetchedAt: string;
  ageMinutes: number;
  stale: boolean;
}

export function assessFreshness(
  source: string,
  fetchedAt: string,
  maxAgeMinutes: number,
  now = new Date(),
): FreshnessStatus {
  const ageMinutes = (now.getTime() - Date.parse(fetchedAt)) / 60_000;
  return {
    source,
    fetchedAt,
    ageMinutes,
    stale: !Number.isFinite(ageMinutes) || ageMinutes > maxAgeMinutes,
  };
}
