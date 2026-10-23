/**
 * TODO(Saransh): Bedrock tool registry (Task 8).
 *
 * Each tool wraps a deterministic @gridrisk/engine function. The model can only *read* via
 * these tools and *propose* via submit_alert – it never dispatches anything (a human
 * approves through Step Functions).
 *
 * Planned tools:
 *   get_active_events        -> events for a zone / all zones
 *   correlate_zone           -> engine.correlate
 *   check_isolation          -> engine.checkIsolation
 *   get_dependent_patients   -> engine.dependentPatients (HHS emPOWER)
 *   find_shelters            -> engine.findShelters
 *   compute_isolation_window -> engine.computeIsolationWindow
 *   submit_alert             -> final answer; JSON schema generated from AlertCardDataSchema
 *                               (z.toJSONSchema), then validated + number-checked.
 */
export const TOOL_NAMES = [
  'get_active_events',
  'correlate_zone',
  'check_isolation',
  'get_dependent_patients',
  'find_shelters',
  'compute_isolation_window',
  'submit_alert',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
