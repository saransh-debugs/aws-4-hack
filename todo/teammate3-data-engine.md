# Teammate3 – Data & Risk Engine (`packages/engine`)

## Role & owned directories

You own the event data (mocked and real), and the deterministic engine that turns events into risk.
Most other tracks depend on you, so ship H2/H3 first, then deepen them.

- Owns: `packages/engine/**` (including `snapshots/` and `sources/` once you create them)
- Reads: `@gridrisk/shared`
- Test it: `npm test -w @gridrisk/engine`

## Inbound handoffs

| ID  | What                 | From      | Use meanwhile   |
| --- | -------------------- | --------- | --------------- |
| H1  | Contracts + fixtures | Bootstrap | ✅ already real |

Nothing else blocks you, so you can start immediately.

## Outbound handoffs

| ID  | What                                      | To                        | By             |
| --- | ----------------------------------------- | ------------------------- | -------------- |
| H2  | `buildScenario()` (calm/escalation/reset) | Darsh, Teammate4          | M1 – **first** |
| H3  | Real `analyze()` + tool functions         | Saransh                   | M1             |
| H4  | `snapshots/*.json` + NWS normalizer       | Teammate4 (ingest), Darsh | M1             |

**Don't change the exported signatures.** Every consumer is already coded against them
(see `docs/CONTRACTS.md#engine-gridriskengine`).

## Tasks

### M1

- [ ] **Scenarios (first)**
  - Objective: complete H2.
  - Guidance:
    - `buildScenario` already works for calm and escalation.
    - Add the `partial` (outage only) and `reopened` (bridge open) event sets that Saransh's evals need. Export them as helpers; extending `ScenarioName` is a contract change.
    - Document the reset semantics: reset is `buildScenario('calm')`.
  - Tests: every scenario's events parse.
  - Demo: tick H2 in HANDOFFS.md.
- [ ] **Task 6: Normalizers and real-data snapshot**
  - Objective: one consistent `DemoEvent` stream from mocked and real sources.
  - Guidance:
    - `src/sources/nws.ts`:
      - fetch `https://api.weather.gov/alerts/active?zone=TXC201`, sending a `User-Agent` header with contact info
      - turn each feature into a `DemoEvent` of type `weather`
      - map severity: Extreme/Severe → `critical`/`high`, everything else → `low`
      - use the centroid of the alert polygon (Turf)
    - `src/sources/empower.ts`:
      - query the emPOWER FeatureServer
        (`https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/arcgis/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer`)
        for Zone A's ZIPs (77002, 77010)
      - return `{ zip, electricityDependentCount }[]`
      - check the layer ID and field names in the service's REST page or the job aid
    - `npm run data:snapshot`: writes `snapshots/nws.json` and `snapshots/empower.json`. Commit them so everything works offline.
    - `npm run data:print`: pretty-prints the normalized output.
    - `@turf/turf` is already installed (pinned) in this package.
  - Tests: run the normalizers against **saved** API responses in `test/fixtures/`. Unit tests make no network calls.
  - Demo: `data:snapshot` then `data:print` shows real NWS alerts as `DemoEvent`s and Zone A's real patient count.
- [ ] **Task 7: Real deterministic engine**
  - Objective: the agent's tools are reproducible functions, so the model never makes up numbers.
  - Guidance:
    - Replace each `TODO(Teammate3)` in `src/tools.ts`:
      - `correlate`: point-in-polygon with Turf instead of trusting `zoneId`; a closure counts when it is within about 50 m of an access road.
      - `checkIsolation`: isolated when all `accessRoadIds` are closed. Keep it behind the same signature so an Amazon Location Routes check can replace it later.
      - `dependentPatients`: sum `snapshots/empower.json` over `zone.zips`; fall back to 340 for Zone A if the snapshot is missing.
      - `findShelters`: outside the zone, has capacity, sorted by distance.
    - `computeIsolationWindow` is already real.
    - Add an `npm run engine:analyze -- escalation` CLI (tsx).
  - Tests: table-driven:

    | Input                   | Expected                                                                        |
    | ----------------------- | ------------------------------------------------------------------------------- |
    | calm                    | `[]`                                                                            |
    | escalation              | `ESCALATION_ENGINE_RESULT` (with the real patient count if the snapshot exists) |
    | bridge reopened         | `isolated: false`                                                               |
    | events without `zoneId` | still correlated (point-in-polygon)                                             |

  - Demo: the CLI prints ZONE A ISOLATED, the patient count, and 45 min.

### M2

- [ ] **Task 12: Scheduled ingest handler** (Teammate4 owns the infra)
  - Objective: real NWS alerts flow into the live feed.
  - Guidance:
    - Add `src/ingest/handler.ts`, a Lambda handler that runs the NWS normalizer and upserts into DynamoDB by event `id`, so repeated runs don't create duplicates.
    - If a fetch fails, keep the last data and log the error; never wipe events.
    - Refresh emPOWER daily.
  - Tests: the handler runs with saved responses and a mocked DynamoDB client; running it twice gives the same rows.
  - Demo: real Harris County alerts appear in `GET /events`.

### Stretch

- [ ] An Amazon Location Routes isolation check (avoid-area around the closures) behind the `checkIsolation` interface.

## Branch naming

`feat/teammate3-<task>`, e.g. `feat/teammate3-task7-engine`.

## Definition of done

- Tests are green in CI.
- The demo (CLI output) is in the PR description.
- `docs/HANDOFFS.md` H2/H3/H4 status is updated, and Saransh, Darsh and Teammate4 are @mentioned.
