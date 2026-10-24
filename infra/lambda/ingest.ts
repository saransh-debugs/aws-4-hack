/**
 * Ingest Lambda (Task 12). Invoked every 5 minutes by EventBridge Scheduler.
 *
 * H4 PLACEHOLDER: Tanisha's NWS normalizer lands here. Until then this is a no-op
 * that logs, so the schedule + least-privilege IAM wiring can be tested and deployed.
 */
export async function handler(): Promise<{ ingested: number }> {
  console.log('Ingest tick: no normalizer wired yet (H4 pending).');
  return { ingested: 0 };
}
