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
}

export const DEFAULT_CONFIG: EngineConfig = {
  avgBackupMinutes: 120,
  estimatedResponseMinutes: 75,
};
