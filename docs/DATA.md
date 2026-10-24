# GridRisk data sources and readiness

This document is the source-of-truth summary for the data used by the deterministic risk engine.
The engine combines external snapshots with synthetic demo data so the project remains reproducible
offline.

## Current sources

| Source                                 | Link                                                                                                                                        | What it provides                                                                                  | How GridRisk uses it                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| National Weather Service active alerts | [NWS Harris County alerts](https://api.weather.gov/alerts/active?zone=TXC201)                                                               | Active weather hazards, descriptions, severity, geometry, and timestamps                          | Normalizes alerts into `DemoEvent` weather events for the event feed and zone context.                                                  |
| HHS emPOWER                            | [HHS emPOWER ZIP layer](https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/ArcGIS/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer/1) | ZIP-code counts of Medicare beneficiaries using electricity-dependent medical equipment           | Sums counts for a zone's ZIP codes to estimate vulnerable patients during a power outage.                                               |
| TxDOT DriveTexas                       | [DriveTexas API](https://api.drivetexas.org/api-docs)                                                                                       | Texas road conditions and closures, refreshed about every five minutes; API key approval required | Normalizes road conditions into `road_closure` events and correlates them with zone access roads.                                       |
| FEMA National Shelter System           | [FEMA open-shelter layer](https://gis.fema.gov/arcgis/rest/services/NSS/FEMA_NSS/MapServer/0)                                               | Open shelter locations, status, and evacuation/post-impact capacity                               | Replaces static shelter capacity when current FEMA records are available.                                                               |
| Synthetic Houston fixtures             | [`packages/shared/src/fixtures/houston.ts`](../packages/shared/src/fixtures/houston.ts)                                                     | Zone A, its access bridge, Shelter B, and simulated weather, outage, and road-closure events      | Provides deterministic offline scenarios for the demo, tests, and fallback behavior.                                                    |
| Engine assumptions                     | [`packages/engine/src/config.ts`](../packages/engine/src/config.ts)                                                                         | Assumed 120-minute device backup and 75-minute response time                                      | Calculates the isolation window: `max(0, backup time - response time)`, currently 45 minutes. These are assumptions, not observed data. |

Utility outages still have no dependable public CenterPoint machine-readable outage feed identified for
this project. The engine supports a configurable utility endpoint and an explicitly opt-in synthetic outage
fallback; it never silently invents a live outage. Operational feeds are supported through configurable adapters in
[`packages/engine/src/sources/operational.ts`](../packages/engine/src/sources/operational.ts). They accept
approved provider endpoints for utility outages, road closures, and shelter records, but no
provider endpoint is hard-coded because those integrations require an agency-approved source and access
policy.

The intended deployment configuration keys are listed in [`.env.example`](../.env.example): utility
outages, road closures, shelter records, the DynamoDB events table, and the maximum allowed
snapshot age. Empty feed URLs intentionally keep the application in fixture mode.

## Offline snapshots

The committed snapshots used by the engine are in [`packages/engine/snapshots`](../packages/engine/snapshots):

- `nws.json`: one captured NWS alert at the time of the latest snapshot.
- `empower.json`: 45 patients in ZIP 77002 and 11 in ZIP 77010, 56 total.

Refresh them with:

```bash
npm run data:snapshot
npm run data:print
```

The refresh operation fetches NWS and emPOWER as one snapshot bundle and writes a manifest with the
generation time and row counts. The freshness helper in
[`packages/engine/src/freshness.ts`](../packages/engine/src/freshness.ts) can mark a source stale when
that manifest or an event timestamp exceeds its configured age limit.

The engine uses the emPOWER snapshot when it is available and falls back to 340 for Zone A when the
snapshot is missing, preserving the original synthetic demo behavior.

## Readiness assessment

The data engine is ready for the offline demo and deterministic tests. It has live-source adapters and
AWS scheduling/persistence, but it is not yet ready to be treated as a complete live emergency decision
system. The remaining data work is:

- Configure an approved utility outage feed, including outage footprint, start time, estimated restoration
  time, and confidence; the public CenterPoint tracker is not currently a documented machine-readable API.
- Request and configure a DriveTexas API key for live road conditions, then map its road geometries to the
  local access-road registry. The adapter and scheduled ingestion are implemented.
- Filter and validate FEMA shelter records for the incident and region; the adapter and scheduled ingestion
  are implemented, but current capacity still needs to be
  interpreted carefully because FEMA publishes evacuation/post-impact capacity rather than guaranteed
  real-time available beds.
- Monitor the scheduled NWS, DriveTexas, FEMA, and emPOWER refreshes with freshness timestamps and alerts
  when a source fails or becomes stale. EventBridge, Lambda, and DynamoDB persistence are wired in CDK.
- Validate the assumed backup and response times with emergency-management or clinical guidance;
  they must remain visibly labeled as assumptions until validated.
- Expand beyond Zone A and verify all zone polygons, access roads, ZIP mappings, and shelter locations.
- Add data-quality checks for duplicate events, invalid coordinates, stale timestamps, missing geometry,
  and conflicting source reports.

The engine now includes DriveTexas/FEMA adapters, configurable utility-feed support, multi-zone/road-aware analysis,
assumption validation, snapshot freshness assessment, data-quality validation, and scheduled AWS persistence.
The remaining work is to obtain the DriveTexas key, select an approved utility feed, and empirically validate
the response-time assumptions.

The scheduled NWS ingest handler is implemented in
[`packages/engine/src/ingest/handler.ts`](../packages/engine/src/ingest/handler.ts). Wiring it to
EventBridge, DynamoDB permissions, and the remaining live feeds belongs to the infrastructure/API
workstream.
