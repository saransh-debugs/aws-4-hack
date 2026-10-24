# GridRisk data engine

This is the source of truth for GridRisk's data sources, contracts, ingestion path, stored records,
assumptions, and remaining work. Read this file before changing a provider adapter or deploying the
ingest stack.

## What the engine does

The deterministic engine combines three kinds of data:

1. **Observed provider data**: weather alerts, electricity-dependent patient counts, utility outages,
   Houston TranStar lane closures, and shelter records.
2. **Operational geography**: the persisted, versioned registry produced by
   `packages/engine/src/sources/geography.ts` and stored in `GeographyTable`.
3. **Explicit assumptions and demo fixtures**: battery backup, response time, and offline scenarios.

The engine correlates outage and road-closure events with zones. A zone is isolated when every road in
its `accessRoadIds` list has a qualifying closure. Weather events provide context but do not, by
themselves, isolate a zone. The engine produces an `EngineResult`; it does not dispatch emergency
actions and it does not use 911 calls. The `911` event type was removed from the contract.

## Shared data contract

The frozen event contract is in [`packages/shared/src/schemas.ts`](../packages/shared/src/schemas.ts).

### Events

`DemoEvent` has:

- `id`: stable provider or fixture identifier; used as the DynamoDB key and for idempotent upserts.
- `type`: one of `weather`, `outage`, or `road_closure`.
- `lat`, `lon`: WGS84 coordinates; longitude comes first only in GeoJSON, not in these named fields.
- `description`: human-readable provider or fixture description.
- `severity`: `low`, `high`, or `critical`.
- optional `zoneId` and ISO-8601 `timestamp`.

### Geography and shelters

- `Zone`: polygon, ZIP-code list, and access-road IDs.
- `RoadSegment`: named LineString used by the 50-meter closure correlation check.
- `Shelter`: ID, name, coordinates, non-negative capacity, and `standby`/`active` status.

The first validated operating slice is Downtown Houston, covering ZIPs 77002 and 77010:

| Zone   | ZIPs         | Access road                 | Current status                                    |
| ------ | ------------ | --------------------------- | ------------------------------------------------- |
| Zone A | 77002, 77010 | Buffalo Bayou Access Bridge | First operational slice; one-zone validation gate |

Shelter records are replaced on every successful FEMA snapshot; capacity and active/standby status
are never treated as permanent geography. This is intentionally one operating area until the
end-to-end proof passes in deployment.

## Map/data connection

The frontend map lives in [`apps/web/src/components/MapComponent.tsx`](../apps/web/src/components/MapComponent.tsx).
It consumes the same `DemoEvent`, `Zone`, `RoadSegment`, and `Shelter` objects used by the engine:

- event points are colored by severity and can be clicked to select an event;
- selecting an event in the event feed flies the map to its coordinates;
- zone polygons, access roads, and shelter points are rendered as GeoJSON layers;
- `VITE_LOCATION_API_KEY` plus `VITE_LOCATION_MAP_NAME` selects an Amazon Location style;
- without those values, the map uses the bundled offline dark style and still renders the data layers.

In live mode, the map calls `GET /map-data` and receives a versioned registry from the geography
table. The engine agent reads that same registry, so the map and alert calculation no longer have
separate live geography inputs. Offline mode intentionally falls back to the Houston fixtures.
The first operating slice is explicitly limited to Downtown Houston until the fresh-data proof is
completed in the deployed environment.

Each persisted registry includes `version`, `source`, `publishedAt`, `effectiveFrom`, `effectiveTo`,
`approvedBy`, `zones`, `roads`, `shelters`, `zipToZone`, and `shelterToZone`. The current default
approval value is `pending-emergency-management-review`; deployment must set
`GRIDRISK_GEOGRAPHY_APPROVED_BY` to the reviewing authority before treating the registry as approved.

## Provider sources

| Source                       | Link                                                                                                                                                                                                                                            | Data supplied                                                                                                    | Current use                                                                         | Access / caveat                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| National Weather Service     | [Harris County active alerts](https://api.weather.gov/alerts/active?zone=TXC201)                                                                                                                                                                | Active hazards, descriptions, severity, geometry, and timestamps                                                 | `fetchNwsAlerts` normalizes alerts to `weather` events                              | Public; send a descriptive `User-Agent`; live fetch can fail and the last stored data is retained                                 |
| HHS emPOWER                  | [Public ZIP layer](https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/ArcGIS/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer/1)                                                                                                          | ZIP-level counts of Medicare beneficiaries using electricity-dependent medical equipment                         | `fetchEmpower` produces counts used by `dependentPatients`                          | Public ArcGIS layer; monthly-style population data, not a real-time patient census                                                |
| CenterPoint Energy           | [Official outage tracker](https://www.centerpointenergy.com/en-us/business/customer-service/service-connect/outage-center) and [ArcGIS service](https://gis.centerpointenergy.com/arcgis/rest/services/Outage/OUTAGE_TRACKER_OEP_ALL/MapServer) | Approximate Houston-area outage locations, status, update information, and affected-customer fields when present | `fetchCenterPointOutages` normalizes active records to `outage` events              | No API key; provider availability/schema is not an SLA-backed emergency contract and may be Cloudflare-protected                  |
| TxDOT DriveTexas             | [API documentation](https://api.drivetexas.org/api-docs)                                                                                                                                                                                        | Texas road conditions and closures                                                                               | Optional `fetchDriveTexasConditions` adapter; only fetched when a key is configured | API key required; not available in the default deployment                                                                         |
| Houston TranStar             | [RSS feed documentation](https://traffic.houstontranstar.org/rss/rss_info.aspx) and [lane-closure feed](https://traffic.houstontranstar.org/data/rss/laneclosures_rss.xml)                                                                      | Lane-closure records, descriptions, timestamps, and GeoRSS coordinates                                           | `fetchTranStarLaneClosures` is the approved road provider for the first slice       | Public feed; typically refreshed about every three minutes; format may change, so parser tests and health monitoring are required |
| FEMA National Shelter System | [Open-shelter layer](https://gis.fema.gov/arcgis/rest/services/NSS/FEMA_NSS/MapServer/0)                                                                                                                                                        | Shelter location, status, evacuation capacity, and post-impact capacity                                          | `fetchFemaOpenShelters` writes current records to the shelter table                 | Public; often sparse outside active incidents; capacity is not guaranteed available-bed capacity                                  |
| ERCOT                        | [Public API documentation](https://developer.ercot.com/applications/pubapi/user-guide/using-api/)                                                                                                                                               | Wholesale/resource outage and grid-market reports                                                                | Not used for customer outage locations; possible supplemental grid context          | Registration/authentication and different geographic semantics; not a CenterPoint substitute                                      |

### Provider normalization files

All currently implemented adapters are in
[`packages/engine/src/sources/`](../packages/engine/src/sources/):

- `nws.ts`: NWS GeoJSON to `weather` events; polygon centroid; Extreme → critical, Severe → high,
  other severities → low.
- `empower.ts`: ArcGIS rows to `{ zip, electricityDependentCount }`.
- `operational.ts`: CenterPoint ArcGIS, Houston TranStar RSS, FEMA ArcGIS, DriveTexas fallback,
  generic adapters, and the explicit synthetic outage constructor.
- `refresh.ts`: consistent NWS + emPOWER snapshot bundle for the local snapshot command.

The deployed Lambda uses the provider-specific CenterPoint, TranStar, FEMA, NWS, and emPOWER fetchers.
The generic functions remain reusable seams, but adding an arbitrary URL does not activate a feed without
a provider-specific normalizer and tests.

Road records expose provider ID, mapped road ID, active status, closure type, source, observed, and
updated timestamps. TranStar records without a known road mapping are discarded rather than assigned
an invented coordinate.

## Runtime ingestion path

The deployed path is implemented in
[`packages/engine/src/ingest/handler.ts`](../packages/engine/src/ingest/handler.ts):

1. EventBridge invokes the Lambda every five minutes.
2. NWS alerts are fetched and normalized.
3. CenterPoint outages are fetched from the default ArcGIS query URL, or from
   `GRIDRISK_CENTERPOINT_OUTAGES_URL` if supplied.
4. Houston TranStar's public lane-closure RSS feed is fetched every scheduled run; DriveTexas is not
   required for the first operating slice.
5. A synthetic outage is added only when `GRIDRISK_ALLOW_SYNTHETIC_UTILITY=true`.
6. All resulting events are written with `PutItem` to the events table, keyed by event ID.
7. FEMA shelters are fetched and written to the shelters table when that table is configured. A
   successful empty result deletes prior shelter records and persists an empty shelter registry;
   failed fetches retain last-known records but mark the provider unhealthy.
8. emPOWER for Zone A's ZIPs is fetched and written as a JSON payload in the snapshots table.
9. A provider failure is logged and existing DynamoDB records are retained; the handler does not clear
   a table after a failed fetch.
10. The validated Downtown Houston geography registry, with the latest successful shelter snapshot,
    is written to `GeographyTable` and served through `GET /map-data`; the agent loads that same
    record before correlating events.

This is an idempotent upsert pattern for stable IDs with provider reconciliation: after a successful
fetch, records for that provider absent from the new snapshot are deleted. A failed fetch does not
delete data; the health record and CloudWatch alarm identify the failure instead. Newly ingested event
records also have a 30-minute expiry as a second safety boundary.

## AWS resources and stored records

[`infra/lib/gridrisk-stack.ts`](../infra/lib/gridrisk-stack.ts) creates:

| Resource         | Key / contents                                                                                                       | Retention                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `EventsTable`    | Partition key `id`; event fields stored as strings: type, lat, lon, description, severity, optional zoneId/timestamp | DynamoDB on-demand, point-in-time recovery, retained on stack deletion    |
| `AlertsTable`    | Alert records and approval/debounce state used by the agent and human-approval workflow                              | DynamoDB on-demand; managed by the cloud/agent track                      |
| `SheltersTable`  | Partition key `id`; name, lat, lon, capacity, status                                                                 | DynamoDB on-demand, point-in-time recovery, retained                      |
| `SnapshotsTable` | Partition key `id`; `generatedAt` and serialized `payload`                                                           | DynamoDB on-demand, point-in-time recovery, retained                      |
| `HealthTable`    | One record per provider with status, fetch timestamp, age threshold, count, and error                                | DynamoDB on-demand, point-in-time recovery, retained                      |
| `GeographyTable` | Versioned serialized zones, roads, and shelters used by the map and agent                                            | DynamoDB on-demand, point-in-time recovery, retained                      |
| `AuditTable`     | Approval actor, alert, action ids, and timestamp                                                                     | DynamoDB on-demand, point-in-time recovery, retained                      |
| `IngestFn`       | Node.js 22 Lambda, 512 MB, 60-second timeout                                                                         | Runs the engine ingest handler and writes events, shelters, and snapshots |
| `IngestSchedule` | EventBridge Scheduler, every five minutes                                                                            | Invokes `IngestFn`                                                        |

The stack also provisions API Gateway/Cognito, alert persistence, Step Functions approval, and SNS
dispatch for the broader application. Those resources are outside the deterministic data engine, but the
ingest handler now runs inside the same deployed stack.

## Configuration

Copy `.env.example` to `.env` for local work. CDK environment values are read during synthesis and passed
to the Lambda where explicitly listed below.

| Variable                              | Used by              | Meaning                                                                                     |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| `GRIDRISK_EVENTS_TABLE`               | Lambda               | Required events table name                                                                  |
| `GRIDRISK_SHELTERS_TABLE`             | Lambda               | Optional shelter table name                                                                 |
| `GRIDRISK_SNAPSHOTS_TABLE`            | Lambda               | Optional snapshot table name                                                                |
| `GRIDRISK_CENTERPOINT_OUTAGES_URL`    | Lambda               | Optional override for the CenterPoint ArcGIS query endpoint; default is in `operational.ts` |
| `DRIVETEXAS_API_KEY`                  | CDK + Lambda         | Optional DriveTexas key; empty means no DriveTexas request                                  |
| `GRIDRISK_ALLOW_SYNTHETIC_UTILITY`    | CDK + Lambda         | Must be exactly `true` to add the synthetic outage                                          |
| `GRIDRISK_SYNTHETIC_ZONE_ID`          | CDK + Lambda         | Zone assigned to the synthetic outage; default `zone-a`                                     |
| `GRIDRISK_UTILITY_OUTAGES_URL`        | Generic adapter only | Reserved configurable utility feed URL; not automatically wired                             |
| `GRIDRISK_TRANSTAR_LANE_CLOSURES_URL` | Lambda               | Approved Houston TranStar RSS endpoint; defaults to the public lane-closure feed            |
| `GRIDRISK_GEOGRAPHY_APPROVED_BY` | CDK + ingest | Reviewing authority recorded on the geography version; default blocks approval claims |
| `GRIDRISK_EMPOWER_COVERAGE_FROM/TO` | Ingest | Optional emPOWER population coverage interval |
| `GRIDRISK_SHELTER_ACTION_URL` / `GRIDRISK_DRONE_ACTION_URL` | Action Lambdas | Optional approved external action endpoints; idempotent POSTs return external request IDs |
| `GRIDRISK_SHELTERS_URL`               | Generic adapter only | Reserved configurable shelter feed URL; not automatically wired                             |
| `GRIDRISK_SNAPSHOT_MAX_AGE_MINUTES`   | Ingest + health API  | Maximum provider age before the health API reports `stale`                                  |
| `GRIDRISK_GEOGRAPHY_VERSION`          | CDK + ingest         | Version label for the operational geography registry                                        |
| `GRIDRISK_DEMO_MODE`                  | CDK + simulate       | Must be `true` to allow scenario mutation; default `false`                                  |

Never commit API keys or credentials. Put deployment secrets in the approved runtime secret/configuration
store rather than `.env` in Git.

## Offline snapshots and reproducibility

Committed snapshot files live in [`packages/engine/snapshots/`](../packages/engine/snapshots/):

- `nws.json`: normalized captured NWS events.
- `empower.json`: normalized ZIP rows; the current snapshot has 45 for 77002 and 11 for 77010.
- `manifest.json`: generation time and row counts.

Commands:

```bash
npm run data:snapshot   # fetch NWS + emPOWER and rewrite the committed snapshots
npm run data:print      # print manifest, NWS, and emPOWER snapshots
npm run engine:analyze -- escalation
npm run data:live-proof -w @gridrisk/engine  # read-only live-provider proof; no AWS writes
```

The snapshot command needs network access. Tests must use saved or inline payloads and must not require
provider network access. `dependentPatients` sums the committed emPOWER rows for a zone's ZIPs and falls
back to 340 only for Zone A when the snapshot has no matching rows.

### Fresh-data proof

`data:live-proof` fetches CenterPoint, Houston TranStar, FEMA, and emPOWER, validates the Downtown
registry, and runs the same correlation path used by the agent. On 2026-10-24 it observed 17 active
TranStar road records and two emPOWER rows, and produced a Zone A isolation result with no data-quality
issues. FEMA returned zero current shelters, so the proof correctly reported `ready: false` with
`no current shelter capacity/status is available`; this is a real operational blocker, not a fixture
success. The command is read-only and must pass with current shelter data before expanding geography.

## Assumptions and derived values

The following are not observed data:

- `avgBackupMinutes = 120`: nominal planning value for device backup duration.
- `estimatedResponseMinutes = 75`: nominal planning value for response duration.
- Default planning ranges are 60–180 minutes for backup and 45–120 minutes for response, yielding a
  remaining-window range of 0–135 minutes.

They are defined in [`packages/engine/src/config.ts`](../packages/engine/src/config.ts), checked for
mathematical consistency (non-negative values, nominal values inside ranges), and returned with
`uncertainty: planning-estimate`. The repository cannot empirically validate clinical backup duration
or agency response time without device-level and dispatch-time records. The application therefore
shows ranges and uncertainty rather than claiming that 120/75 is validated. The next validation input
is a de-identified historical dispatch/device-backup sample approved by emergency-management and
clinical stakeholders.

## Freshness and data-quality controls

Implemented reusable checks:

- `assessFreshness` in `packages/engine/src/freshness.ts`: marks a source stale from its fetch timestamp
  and configured maximum age.
- `validateDataQuality` in `packages/engine/src/dataQuality.ts`: checks invalid event schemas, conflicting
  duplicate IDs, stale event timestamps, missing zone road mappings, invalid shelter coordinates/capacity,
  and duplicate shelter IDs.
- Zod schemas reject invalid event coordinates, event types, severity values, shelter status, and malformed
  zone/road geometry.

Current controls include provider health records, UI freshness warnings, a CloudWatch alarm for ingest
provider failures, schema/geometry validation, provider reconciliation, expiry, and the
`proveFreshWorkflow` test. Invalid rows are discarded by provider normalizers rather than entering
the operational tables. Cross-provider semantic conflict review and operational paging still require
an agency-specific policy.

The deployed path now persists provider health at `/health`, displays non-healthy sources in the web
app, assigns a 30-minute DynamoDB TTL to newly ingested provider events, and filters expired records
from `GET /events`. DynamoDB TTL deletion is asynchronous, so the API filter is the authoritative
short-term safeguard. The health endpoint reports the TranStar provider separately. If TranStar is
unavailable, the UI warns that road-dependent isolation decisions are degraded and retained road
records are subject to expiry/reconciliation policy.

## Current readiness

### Production safety

Simulation is disabled by default in deployed environments. The web toolbar only appears in
offline mock mode or when `GRIDRISK_DEMO_MODE=true`, and the API rejects `/simulate/*` requests
with `403` unless the same backend flag is enabled. This protects the shared events and alerts
tables from being replaced by a demo scenario. Use a separate demo stack/account when enabling
the flag; do not enable it for live operations.

### Action semantics

The approval workflow is intentionally honest about its current integration boundary. The
notification action publishes to the configured SNS topic; the shelter action records an
request with a deterministic idempotency key; and the drone action records a mission request with the
same semantics. If `GRIDRISK_SHELTER_ACTION_URL` or `GRIDRISK_DRONE_ACTION_URL` is configured, the
Lambda sends an idempotent POST and stores the external request ID/status. Without those endpoints,
the system remains in request-created mode and does not claim that a field action occurred.

Approvals now require membership in the Cognito `gridrisk-operator` group and are recorded in a
retained audit table with actor, alert, action ids, and timestamp. Cognito groups now include viewer,
operator, supervisor, and administrator. Acknowledgement is operator-level; escalation is supervisor-
or-administrator-level. Run the demo-user setup script after deployment to assign the demo account to
the operator group. Regular authenticated users can still read current data but cannot approve requests.

### Complete for the grounded prototype

- No 911 data is required or modeled.
- NWS and emPOWER adapters plus committed offline snapshots are available.
- CenterPoint is the configured no-key utility-provider path, with explicit synthetic fallback.
- Houston TranStar is the configured no-key road provider; DriveTexas remains an optional secondary adapter.
- Versioned geography, deterministic correlation, isolation calculation, shelter selection, and
  assumption-range countdown are implemented through the same map/agent data path.
- CDK provisions scheduled Lambda ingestion and persistent event, shelter, and snapshot tables.
- Focused engine tests, workspace typechecks, the live read-only proof, and CDK synthesis pass on this branch.

### Not ready for live emergency decisions

The following external approvals or deployment actions still cannot be completed from this repository alone:

1. Deploy the stack in an AWS account and verify the CenterPoint endpoint, Cloudflare behavior, response
   schema, coordinate fields, and outage status fields from the Lambda runtime.
2. Restore a current FEMA shelter/capacity source in the deployment; the live proof returned zero shelters,
   so the workflow correctly remains not ready for action.
3. Configure approved paging destinations for the CloudWatch alarms and health warnings.
4. Expand the zone, road, ZIP, and shelter registry beyond this one Downtown Houston slice only after the
   live proof passes with shelter data and Houston-area emergency-management stakeholders approve mappings.
5. Establish evidence-based backup and response-time distributions, document confidence intervals, and replace
   the planning ranges only after clinical/emergency approval.
6. Supply approved shelter-management and drone-dispatch endpoints if those requests are to become external
   operational actions; the code now supports idempotent endpoint calls and external request IDs.

## Handoff checklist

Before the next person starts:

- Work on the current feature branch and confirm its name with `git branch --show-current`.
- Review this file, `.env.example`, `packages/engine/src/ingest/handler.ts`,
  `packages/engine/src/sources/operational.ts`, and `infra/lib/gridrisk-stack.ts`.
- Run `npm install` if dependencies are absent, then `npm run verify`.
- Do not add 911 back to `EventTypeSchema` without a shared-contract review.
- Do not enable synthetic utility data in a live environment.
- Do not treat the committed snapshots or fixture values as current operational truth.
- When adding a provider, add its official link here, document authentication and freshness, add a normalizer
  test with a captured payload, wire it into the Lambda explicitly, and update the readiness checklist.
- The live-readiness implementation and this handoff documentation are committed incrementally; check
  `git status` and `git log --oneline -5` before starting new work.

## Verification

Run from the repository root:

```bash
npm run verify
```

This runs lint, formatting checks, TypeScript checks, all workspace tests, and builds. The data-engine
unit tests are in `packages/engine/test/engine.test.ts` and cover NWS/emPOWER normalization,
CenterPoint/TranStar/DriveTexas/FEMA normalization, scenarios, correlation, isolation, data quality,
freshness, and the fresh workflow proof. `npm run data:live-proof -w @gridrisk/engine` is the read-only
deployment smoke test; it requires network access and does not write AWS state.
