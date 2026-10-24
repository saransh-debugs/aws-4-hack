/**
 * Engine configuration.
 *
 * ASSUMPTIONS – these are NOT from any dataset. HHS emPOWER gives counts of
 * electricity-dependent patients, but no source publishes device battery backup times.
 * Keep them configurable and say "assumed" wherever they are shown.
 */
export interface EngineConfig {
  /** Assumed average battery backup of home medical devices (minutes). */
  avgBackupMinutes: number;
  /** Assumed time to get help into an isolated zone (minutes). */
  estimatedResponseMinutes: number;
  /** Planning range for backup duration; not a validated clinical distribution yet. */
  backupRangeMinutes?: { min: number; max: number };
  /** Planning range for response duration; not a validated operational distribution yet. */
  responseRangeMinutes?: { min: number; max: number };
}

export const DEFAULT_CONFIG: EngineConfig = {
  avgBackupMinutes: 120,
  estimatedResponseMinutes: 75,
  backupRangeMinutes: { min: 60, max: 180 },
  responseRangeMinutes: { min: 45, max: 120 },
};

export function validateEngineConfig(config: EngineConfig): void {
  for (const [name, value] of Object.entries(config)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`${name} must be a finite non-negative number`);
    }
  }
  for (const [name, range] of [
    ['backupRangeMinutes', config.backupRangeMinutes],
    ['responseRangeMinutes', config.responseRangeMinutes],
  ] as const) {
    if (!range) continue;
    if (
      !Number.isFinite(range.min) ||
      !Number.isFinite(range.max) ||
      range.min < 0 ||
      range.max < range.min
    ) {
      throw new Error(`${name} must contain a valid non-negative min/max range`);
    }
  }
  if (
    config.backupRangeMinutes &&
    (config.avgBackupMinutes < config.backupRangeMinutes.min ||
      config.avgBackupMinutes > config.backupRangeMinutes.max)
  ) {
    throw new Error('avgBackupMinutes must fall inside backupRangeMinutes');
  }
  if (
    config.responseRangeMinutes &&
    (config.estimatedResponseMinutes < config.responseRangeMinutes.min ||
      config.estimatedResponseMinutes > config.responseRangeMinutes.max)
  ) {
    throw new Error('estimatedResponseMinutes must fall inside responseRangeMinutes');
  }
}
