# GridRisk data engine

This is the source of truth for GridRisk's data sources, contracts, ingestion path, stored records,
assumptions, and remaining work. Read this file before changing a provider adapter or deploying the
ingest stack.

## What the engine does

The deterministic engine combines three kinds of data:

1. **Observed provider data**: weather alerts, electricity-dependent patient counts, utility outages,
   road conditions when an approved provider is available, and shelter records.
2. **Local geography and mappings**: zones, ZIP codes, access roads, and shelter coordinates in
   `packages/shared/src/fixtures/houston.ts`.
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

The current fixture geography has two zones and two access roads:

| Zone   | ZIPs         | Access road                  | Current status                              |
| ------ | ------------ | ---------------------------- | ------------------------------------------- |
| Zone A | 77002, 77010 | Buffalo Bayou Access Bridge  | Demo coverage                               |
| Zone B | 77004        | Main Street Evacuation Route | Demo coverage; no live patient snapshot yet |

The fixture shelter is Shelter B with capacity 200. These are not a complete Houston operational
zone, road, or shelter registry.

## Map/data connection

The frontend map lives in [`apps/web/src/components/MapComponent.tsx`](../apps/web/src/components/MapComponent.tsx).
It consumes the same `DemoEvent`, `Zone`, `RoadSegment`, and `Shelter` objects used by the engine:

- event points are colored by severity and can be clicked to select an event;
- selecting an event in the event feed flies the map to its coordinates;
- zone polygons, access roads, and shelter points are rendered as GeoJSON layers;
- `VITE_LOCATION_API_KEY` plus `VITE_LOCATION_MAP_NAME` selects an Amazon Location style;
- without those values, the map uses the bundled offline dark style and still renders the data layers.

This visual layer does not change the deterministic engine or provider data. It is a read-only view of
the current adapter/fixture data. Real API event loading and alert controls remain separate UI work.

## Provider sources

| Source                       | Link                                                                                                                                                                                                                                            | Data supplied                                                                                                    | Current use                                                                         | Access / caveat                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| National Weather Service     | [Harris County active alerts](https://api.weather.gov/alerts/active?zone=TXC201)                                                                                                                                                                | Active hazards, descriptions, severity, geometry, and timestamps                                                 | `fetchNwsAlerts` normalizes alerts to `weather` events                              | Public; send a descriptive `User-Agent`; live fetch can fail and the last stored data is retained                |
| HHS emPOWER                  | [Public ZIP layer](https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/ArcGIS/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer/1)                                                                                                          | ZIP-level counts of Medicare beneficiaries using electricity-dependent medical equipment                         | `fetchEmpower` produces counts used by `dependentPatients`                          | Public ArcGIS layer; monthly-style population data, not a real-time patient census                               |
| CenterPoint Energy           | [Official outage tracker](https://www.centerpointenergy.com/en-us/business/customer-service/service-connect/outage-center) and [ArcGIS service](https://gis.centerpointenergy.com/arcgis/rest/services/Outage/OUTAGE_TRACKER_OEP_ALL/MapServer) | Approximate Houston-area outage locations, status, update information, and affected-customer fields when present | `fetchCenterPointOutages` normalizes active records to `outage` events              | No API key; provider availability/schema is not an SLA-backed emergency contract and may be Cloudflare-protected |
| TxDOT DriveTexas             | [API documentation](https://api.drivetexas.org/api-docs)                                                                                                                                                                                        | Texas road conditions and closures                                                                               | Optional `fetchDriveTexasConditions` adapter; only fetched when a key is configured | API key required; not available in the default deployment                                                        |
| Houston TranStar             | [API documentation](https://traffic.houstontranstar.org/api/api_doc.aspx)                                                                                                                                                                       | Incident, lane-closure, and roadway-flood feeds                                                                  | Research candidate only; not wired as a live source                                 | Public samples are available, but the documentation says to contact TranStar for live-feed access                |
| FEMA National Shelter System | [Open-shelter layer](https://gis.fema.gov/arcgis/rest/services/NSS/FEMA_NSS/MapServer/0)                                                                                                                                                        | Shelter location, status, evacuation capacity, and post-impact capacity                                          | `fetchFemaOpenShelters` writes current records to the shelter table                 | Public; often sparse outside active incidents; capacity is not guaranteed available-bed capacity                 |
| ERCOT                        | [Public API documentation](https://developer.ercot.com/applications/pubapi/user-guide/using-api/)                                                                                                                                               | Wholesale/resource outage and grid-market reports                                                                | Not used for customer outage locations; possible supplemental grid context          | Registration/authentication and different geographic semantics; not a CenterPoint substitute                     |

### Provider normalization files

All currently implemented adapters are in
[`packages/engine/src/sources/`](../packages/engine/src/sources/):

- `nws.ts`: NWS GeoJSON to `weather` events; polygon centroid; Extreme → critical, Severe → high,
  other severities → low.
- `empower.ts`: ArcGIS rows to `{ zip, electricityDependentCount }`.
- `operational.ts`: generic operational/shelter adapters, DriveTexas GeoJSON, CenterPoint ArcGIS,
  FEMA ArcGIS, and the explicit synthetic outage constructor.
- `refresh.ts`: consistent NWS + emPOWER snapshot bundle for the local snapshot command.

The generic functions `fetchOperationalEvents` and `fetchShelters` are reusable seams, but the deployed
Lambda does not automatically consume `GRIDRISK_UTILITY_OUTAGES_URL`, `GRIDRISK_ROAD_CLOSURES_URL`, or
`GRIDRISK_SHELTERS_URL`. A future provider integration must either wire those URLs into the handler or
add a provider-specific fetcher and tests; do not assume that adding an environment variable activates a
feed.

## Runtime ingestion path

The deployed path is implemented in
[`packages/engine/src/ingest/handler.ts`](../packages/engine/src/ingest/handler.ts):

1. EventBridge invokes the Lambda every five minutes.
2. NWS alerts are fetched and normalized.
3. CenterPoint outages are fetched from the default ArcGIS query URL, or from
   `GRIDRISK_CENTERPOINT_OUTAGES_URL` if supplied.
4. DriveTexas is fetched only when `DRIVETEXAS_API_KEY` is non-empty.
5. A synthetic outage is added only when `GRIDRISK_ALLOW_SYNTHETIC_UTILITY=true`.
6. All resulting events are written with `PutItem` to the events table, keyed by event ID.
7. FEMA shelters are fetched and written to the shelters table when that table is configured.
8. emPOWER for Zone A's ZIPs is fetched and written as a JSON payload in the snapshots table.
9. A provider failure is logged and existing DynamoDB records are retained; the handler does not clear
   a table after a failed fetch.

This is an idempotent upsert pattern for stable IDs, but it is not yet a full reconciliation process:
records that disappear from a provider remain in DynamoDB unless a future cleanup/expiry policy is added.

## AWS resources and stored records

[`infra/lib/gridrisk-stack.ts`](../infra/lib/gridrisk-stack.ts) creates:

| Resource         | Key / contents                                                                                                       | Retention                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `EventsTable`    | Partition key `id`; event fields stored as strings: type, lat, lon, description, severity, optional zoneId/timestamp | DynamoDB on-demand, point-in-time recovery, retained on stack deletion    |
| `AlertsTable`    | Alert records and approval/debounce state used by the agent and human-approval workflow                              | DynamoDB on-demand; managed by the cloud/agent track                      |
| `SheltersTable`  | Partition key `id`; name, lat, lon, capacity, status                                                                 | DynamoDB on-demand, point-in-time recovery, retained                      |
| `SnapshotsTable` | Partition key `id`; `generatedAt` and serialized `payload`                                                           | DynamoDB on-demand, point-in-time recovery, retained                      |
| `IngestFn`       | Node.js 22 Lambda, 512 MB, 60-second timeout                                                                         | Runs the engine ingest handler and writes events, shelters, and snapshots |
| `IngestSchedule` | EventBridge Scheduler, every five minutes                                                                            | Invokes `IngestFn`                                                        |

The stack also provisions API Gateway/Cognito, alert persistence, Step Functions approval, and SNS
dispatch for the broader application. Those resources are outside the deterministic data engine, but the
ingest handler now runs inside the same deployed stack.

## Configuration

Copy `.env.example` to `.env` for local work. CDK environment values are read during synthesis and passed
to the Lambda where explicitly listed below.

| Variable                            | Used by              | Meaning                                                                                     |
| ----------------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| `GRIDRISK_EVENTS_TABLE`             | Lambda               | Required events table name                                                                  |
| `GRIDRISK_SHELTERS_TABLE`           | Lambda               | Optional shelter table name                                                                 |
| `GRIDRISK_SNAPSHOTS_TABLE`          | Lambda               | Optional snapshot table name                                                                |
| `GRIDRISK_CENTERPOINT_OUTAGES_URL`  | Lambda               | Optional override for the CenterPoint ArcGIS query endpoint; default is in `operational.ts` |
| `DRIVETEXAS_API_KEY`                | CDK + Lambda         | Optional DriveTexas key; empty means no DriveTexas request                                  |
| `GRIDRISK_ALLOW_SYNTHETIC_UTILITY`  | CDK + Lambda         | Must be exactly `true` to add the synthetic outage                                          |
| `GRIDRISK_SYNTHETIC_ZONE_ID`        | CDK + Lambda         | Zone assigned to the synthetic outage; default `zone-a`                                     |
| `GRIDRISK_UTILITY_OUTAGES_URL`      | Generic adapter only | Reserved configurable utility feed URL; not automatically wired                             |
| `GRIDRISK_ROAD_CLOSURES_URL`        | Generic adapter only | Reserved configurable road feed URL; not automatically wired                                |
| `GRIDRISK_SHELTERS_URL`             | Generic adapter only | Reserved configurable shelter feed URL; not automatically wired                             |
| `GRIDRISK_SNAPSHOT_MAX_AGE_MINUTES` | Configuration/docs   | Intended freshness threshold; current Lambda does not emit an alert from it                 |

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
```

The snapshot command needs network access. Tests must use saved or inline payloads and must not require
provider network access. `dependentPatients` sums the committed emPOWER rows for a zone's ZIPs and falls
back to 340 only for Zone A when the snapshot has no matching rows.

## Assumptions and derived values

The following are not observed data:

- `avgBackupMinutes = 120`: nominal planning value for device backup duration.
- `estimatedResponseMinutes = 75`: nominal planning value for response duration.
- Default planning ranges are 60–180 minutes for backup and 45–120 minutes for response, yielding a
  remaining-window range of 0–135 minutes.

They are defined in [`packages/engine/src/config.ts`](../packages/engine/src/config.ts), validated only
for shape and ordering, and returned with `uncertainty: planning-estimate`. They have not been
empirically validated by this repository. Do not present them as patient-level clinical guidance or
an operational guarantee until emergency-management and clinical stakeholders approve a methodology
and source data.

## Freshness and data-quality controls

Implemented reusable checks:

- `assessFreshness` in `packages/engine/src/freshness.ts`: marks a source stale from its fetch timestamp
  and configured maximum age.
- `validateDataQuality` in `packages/engine/src/dataQuality.ts`: checks invalid event schemas, conflicting
  duplicate IDs, stale event timestamps, missing zone road mappings, invalid shelter coordinates/capacity,
  and duplicate shelter IDs.
- Zod schemas reject invalid event coordinates, event types, severity values, shelter status, and malformed
  zone/road geometry.

Current limitation: these checks are library functions covered by tests, not an end-to-end monitoring and
alerting pipeline. The Lambda currently logs provider failures but does not persist per-source health,
emit CloudWatch alarms, quarantine bad records, detect cross-provider conflicts, or delete stale records.
Those are required before live emergency decision-making.

The deployed path now persists provider health at `/health`, displays non-healthy sources in the web
app, assigns a 30-minute DynamoDB TTL to newly ingested provider events, and filters expired records
from `GET /events`. DynamoDB TTL deletion is asynchronous, so the API filter is the authoritative
short-term safeguard. When no DriveTexas key is configured, the health endpoint reports that the
road-closure provider is unavailable; the application should be treated as outage-only until a
road provider is connected.

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
`activation_requested` record; and the drone action records a `requested` mission. These are
auditable requests, not direct control of a shelter, public-alert, or drone system. A real provider
integration must be added before presenting them as completed field actions.

Approvals now require membership in the Cognito `gridrisk-operator` group and are recorded in a
retained audit table with actor, alert, action ids, and timestamp. Run the demo-user setup script
after deployment to assign the demo account to that group. Regular authenticated users can still
read current data but cannot approve requests.

### Complete for the grounded prototype

- No 911 data is required or modeled.
- NWS and emPOWER adapters plus committed offline snapshots are available.
- CenterPoint is the configured no-key utility-provider path, with explicit synthetic fallback.
- DriveTexas and FEMA adapters exist and are tested; DriveTexas remains optional because access requires a key.
- Multi-zone fixture mappings, deterministic correlation, isolation calculation, shelter selection, and
  assumption-derived countdown are implemented.
- CDK provisions scheduled Lambda ingestion and persistent event, shelter, and snapshot tables.
- Full repository verification passes with `npm run verify`.

### Not ready for live emergency decisions

The next contributor or deployment owner still needs to:

1. Deploy the stack in an AWS account and verify the CenterPoint endpoint, Cloudflare behavior, response
   schema, coordinate fields, and outage status fields from the Lambda runtime.
2. Decide whether to obtain live TranStar access or a DriveTexas key. Public TranStar samples are not live
   operational data.
3. Add provider-specific schema drift handling, coordinate validation, deduplication, and cross-provider
   conflict rules for CenterPoint/road/shelter records.
4. Add source-health records and CloudWatch alarms for fetch failure, stale data, empty responses, and
   schema changes; define retention/reconciliation for records no longer returned by providers.
5. Expand the zone, road, ZIP, and shelter registry beyond the two demo zones and verify every mapping with
   Houston-area emergency-management stakeholders.
6. Establish evidence-based backup and response-time distributions, document confidence intervals, and replace
   the 120/75-minute assumptions only after clinical/emergency approval.
7. Add live shelter availability semantics. FEMA evacuation/post-impact capacity is not the same as current
   open beds, so a shelter should not be treated as available solely because a FEMA row exists.
8. Add an integration test using a captured CenterPoint response and a deployment smoke test using read-only
   provider calls.

## Handoff checklist

Before the next person starts:

- Work on branch `feat/tanisha-live-data-readiness`.
- Review this file, `.env.example`, `packages/engine/src/ingest/handler.ts`,
  `packages/engine/src/sources/operational.ts`, and `infra/lib/gridrisk-stack.ts`.
- Run `npm install` if dependencies are absent, then `npm run verify`.
- Do not add 911 back to `EventTypeSchema` without a shared-contract review.
- Do not enable synthetic utility data in a live environment.
- Do not treat the committed snapshots or fixture values as current operational truth.
- When adding a provider, add its official link here, document authentication and freshness, add a normalizer
  test with a captured payload, wire it into the Lambda explicitly, and update the readiness checklist.
- The live-readiness implementation and this handoff documentation are on the feature branch named above;
  check `git status` and `git log --oneline -3` before starting new work.

## Verification

Run from the repository root:

```bash
npm run verify
```

This runs lint, formatting checks, TypeScript checks, all workspace tests, and builds. The data-engine
unit tests are in `packages/engine/test/engine.test.ts` and currently cover NWS/emPOWER normalization,
CenterPoint/DriveTexas/FEMA normalization, scenarios, correlation, isolation, data quality, freshness,
and ingest behavior.
