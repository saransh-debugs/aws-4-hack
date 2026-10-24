# GridRisk data sources and readiness

This document is the source-of-truth summary for the data used by the deterministic risk engine.
The engine combines external snapshots with synthetic demo data so the project remains reproducible
offline.

## Current sources

| Source                                 | Link                                                                                                                                        | What it provides                                                                                  | How GridRisk uses it                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| National Weather Service active alerts | [NWS Harris County alerts](https://api.weather.gov/alerts/active?zone=TXC201)                                                               | Active weather hazards, descriptions, severity, geometry, and timestamps                          | Normalizes alerts into `DemoEvent` weather events for the event feed and zone context.                                                  |
| HHS emPOWER                            | [HHS emPOWER ZIP layer](https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/ArcGIS/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer/1) | ZIP-code counts of Medicare beneficiaries using electricity-dependent medical equipment           | Sums counts for a zone's ZIP codes to estimate vulnerable patients during a power outage.                                               |
| Synthetic Houston fixtures             | [`packages/shared/src/fixtures/houston.ts`](../packages/shared/src/fixtures/houston.ts)                                                     | Zone A, its access bridge, Shelter B, and simulated weather, outage, road-closure, and 911 events | Provides deterministic offline scenarios for the demo, tests, and fallback behavior.                                                    |
| Engine assumptions                     | [`packages/engine/src/config.ts`](../packages/engine/src/config.ts)                                                                         | Assumed 120-minute device backup and 75-minute response time                                      | Calculates the isolation window: `max(0, backup time - response time)`, currently 45 minutes. These are assumptions, not observed data. |

## Offline snapshots

The committed snapshots used by the engine are in [`packages/engine/snapshots`](../packages/engine/snapshots):

- `nws.json`: one captured NWS alert at the time of the latest snapshot.
- `empower.json`: 45 patients in ZIP 77002 and 11 in ZIP 77010, 56 total.

Refresh them with:

```bash
npm run data:snapshot
npm run data:print
```

The engine uses the emPOWER snapshot when it is available and falls back to 340 for Zone A when the
snapshot is missing, preserving the original synthetic demo behavior.

## Readiness assessment

The data engine is ready for the offline demo and deterministic tests. It is not yet ready to be
treated as a complete live emergency decision system. The remaining data work is:

- Replace synthetic outage events with a utility outage feed, including outage footprint, start time,
  estimated restoration time, and confidence.
- Replace synthetic road closures with a transportation or emergency-management feed, including the
  affected road segment and closure status.
- Replace synthetic 911 events with an approved, privacy-safe public-safety feed or an internal API.
- Connect live shelter capacity and operating status rather than the static Shelter B fixture.
- Refresh and monitor the NWS and emPOWER snapshots on a schedule, with freshness timestamps and
  alerts when a source fails or becomes stale.
- Validate the assumed backup and response times with emergency-management or clinical guidance;
  they must remain visibly labeled as assumptions until validated.
- Expand beyond Zone A and verify all zone polygons, access roads, ZIP mappings, and shelter locations.
- Add data-quality checks for duplicate events, invalid coordinates, stale timestamps, missing geometry,
  and conflicting source reports.

The scheduled NWS ingest handler is implemented in
[`packages/engine/src/ingest/handler.ts`](../packages/engine/src/ingest/handler.ts). Wiring it to
EventBridge, DynamoDB permissions, and the remaining live feeds belongs to the infrastructure/API
workstream.
