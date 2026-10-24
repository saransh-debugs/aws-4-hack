# GridRisk – Implementation Plan

## Problem

Emergency Operations Center (EOC) staff see power outages and flooded roads as separate
feeds. GridRisk links them into one risk, e.g. _"Zone A is cut off, has no power, and 340
electricity-dependent patients live there – 45 minutes left."_ It then proposes actions, and **a human must approve** before anything is dispatched.

The scripted 60-second, 3-act demo is **out of scope for now**. The hooks for it are
`POST /simulate/{scenario}` and `POST /simulate/reset`, plus `MockAdapter.simulate/reset`.

## Requirements

- **Frontend:** React + Vite + TypeScript, Tailwind (dark only: bg `#0f172a`, text `#f8fafc`,
  critical `#ef4444` with pulse, `font-mono` for IDs/coords/timers), maplibre-gl + react-map-gl,
  framer-motion, lucide-react, Zustand.
- **Data:** mostly mocked. Real: HHS emPOWER (patient counts by ZIP) and NWS alerts for
  Harris County. Basemap: Amazon Location _Monochrome_ dark style when `VITE_LOCATION_API_KEY` is
  set, otherwise a bundled offline dark style.
- **Assumption:** "average backup 2 hours" is **not in any dataset**. It is a configurable
  assumption (`avgBackupMinutes = 120`).
  `isolationWindowMinutes = avgBackupMinutes − estimatedResponseMinutes (75) = 45`.
- **Agent:** Amazon Bedrock (Claude) Converse API with tool use. It **proposes only**. All numbers come
  from the deterministic engine, a validator rejects any number the model makes up, and a template fallback is used on any failure.
- **Backend:** CDK (TS), DynamoDB, HTTP API + Cognito JWT authorizer, Step Functions with
  `.waitForTaskToken` for human approval, SNS, EventBridge Scheduler ingest, Amplify Hosting.

## Team

| Person   | Track          | Owns                            | TODO                                                       |
| -------- | -------------- | ------------------------------- | ---------------------------------------------------------- |
| Saransh  | Agent          | `packages/agent`                | [todo/saransh-agent.md](todo/saransh-agent.md)             |
| Bushra   | UI             | `apps/web`                      | [todo/bushra-ui.md](todo/bushra-ui.md)                     |
| Tanisha  | Data & engine  | `packages/engine`               | [todo/tanisha-data-engine.md](todo/tanisha-data-engine.md) |
| Darsh    | Cloud & integ. | `infra`, `.github`              | [todo/darsh-cloud.md](todo/darsh-cloud.md)                 |
| Everyone | Contracts      | `packages/shared` (2 approvals) | [docs/CONTRACTS.md](docs/CONTRACTS.md)                     |

## Data sources (research summary)

| Demo element                   | Source                                          | Access                                                                             | Use                                                                        |
| ------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Electricity-dependent patients | HHS emPOWER REST (ArcGIS FeatureServer)         | Public, ZIP level, updated monthly                                                 | **Real** (snapshot) → `dependentPatients`                                  |
| Weather alerts                 | NWS `api.weather.gov/alerts/active?zone=TXC201` | Public, GeoJSON, needs `User-Agent`                                                | **Real** → `DemoEvent` type `weather`                                      |
| River / gauge levels           | USGS Water Data API                             | Public                                                                             | Optional proxy for "bridge flooded"                                        |
| Power outages                  | CenterPoint public ArcGIS outage tracker        | Public tracker service; schema/availability not guaranteed                         | Normalized when reachable; synthetic fallback remains opt-in               |
| ERCOT grid outages             | ERCOT public reports                            | Public API with registration; wholesale/resource-level                             | Supplemental grid context only, not customer outage locations              |
| Road closures / high water     | Houston TranStar feeds; DriveTexas optional     | TranStar samples public but live access requires approval; DriveTexas key required | Candidate sources; live provider access still needed                       |
| Shelters                       | FEMA Open Shelters FeatureServer                | Public, often empty outside disasters                                              | Adapter and scheduled persistence; `Shelter B` remains the offline fixture |
| Battery backup duration        | —                                               | Not published anywhere                                                             | **Assumption** in `engine/src/config.ts`                                   |

## AWS services

| Need                       | Service                                                    |
| -------------------------- | ---------------------------------------------------------- |
| Dark basemap               | Amazon Location Maps – Monochrome style, dark color scheme |
| Zone isolation (stretch)   | Amazon Location Routes with avoid-areas                    |
| Polling feeds              | EventBridge Scheduler → Lambda                             |
| Event / alert storage      | DynamoDB (`events` with stream, `alerts`)                  |
| Read / approve API         | API Gateway HTTP API + Cognito JWT authorizer              |
| Alert wording              | Amazon Bedrock (Claude) Converse + tool use                |
| Human-in-the-loop dispatch | Step Functions `.waitForTaskToken`                         |
| Notification               | Amazon SNS (email or verified SMS numbers – SMS sandbox)   |
| Hosting                    | Amplify Hosting (or S3 + CloudFront)                       |

## Architecture

```mermaid
flowchart LR
  subgraph T3[Tanisha: Data & Engine]
    MOCK[Mock scenarios] --> NORM[Normalizers]
    REAL[NWS + emPOWER snapshot] --> NORM
    ENG[Risk engine]
  end
  subgraph S[Saransh: Agent]
    AG[Bedrock tool-use loop] -->|tools| ENG
    AG --> VAL[Validator + template fallback]
  end
  subgraph T4[Darsh: Cloud]
    API[HTTP API + Cognito] --> DDB[(DynamoDB)]
    SFN[Step Functions: Agent → Save → WaitForApproval → Dispatch] --> SNS[SNS]
    SCHED[EventBridge Scheduler] --> NORM
  end
  subgraph D[Bushra: UI]
    WEB[React app] --> ADP{DataAdapter}
  end
  ADP -->|mock| MOCK
  ADP -->|live| API
  SFN --> AG
  NORM --> DDB
```

## Tasks

| #   | Task                                                                     | Owner                                  | Milestone |
| --- | ------------------------------------------------------------------------ | -------------------------------------- | --------- |
| 1   | Monorepo scaffold, shared contracts, stubs, CI                           | Bootstrap (**done**)                   | M0        |
| 2   | App shell, theme, Zustand store, MockAdapter, dev toolbar                | Bushra                                 | M1        |
| 3   | MapComponent (Amazon Location dark map style + offline fallback)         | Bushra                                 | M1        |
| 4   | EventFeed                                                                | Saransh                                | M1        |
| 5   | AlertCard, countdown, approve states, connecting lines, dispatch visuals | Bushra                                 | M2        |
| 6   | Normalizers (NWS, emPOWER), snapshots, scenarios                         | Tanisha                                | M1        |
| 7   | Deterministic risk engine (Turf.js)                                      | Tanisha                                | M1        |
| 8   | Agent core: Bedrock Converse tool loop                                   | All (A1 T, A3 S)                       | M1        |
| 9   | Grounding validator, template fallback, evals                            | All (A2 B, A4 D)                       | M2        |
| 10  | Core infra: DynamoDB, HTTP API + Cognito, read/simulate Lambdas          | Darsh                                  | M1        |
| 11  | Step Functions human approval + SNS dispatch                             | Darsh (+ Saransh: approve handler)     | M2        |
| 12  | Scheduled real-data ingest                                               | Tanisha + Darsh                        | M2        |
| 13  | LiveAdapter + Cognito sign-in in web                                     | Saransh (13a), Bushra + Darsh (13b)    | M2/M3     |
| 14  | Real agent in RunAgent Lambda                                            | Saransh + Darsh                        | M3        |
| 15  | Hosting, Playwright e2e, CI/CD                                           | Darsh (+ Saransh: e2e)                 | M3        |
| 16  | Hardening: reset hook, offline check, runbook, 5× reliability run        | All (Tanisha: offline check + runbook) | M3        |

**Sequencing.** Task 1 was done at bootstrap. The tracks then run in parallel:

- Bushra: 2 → 3 → 5 → 13b, plus agent slice A2
- Tanisha: 6 → 7 → 12, plus agent slice A1 and the Task 16 offline check + runbook
- Saransh: agent A0 → A3, plus 4 → 13a → approve handler (11) → trace panel → e2e (15)
- Darsh: 10 → 11 → 14 → 15, plus agent slice A4

The agent is split across all four (A1–A4, see [todo/saransh-agent.md](todo/saransh-agent.md)),
and tasks were moved so the total effort is roughly equal:

| Person  | Own track                                               | Agent slice | Rough effort |
| ------- | ------------------------------------------------------- | ----------- | ------------ |
| Tanisha | Scenarios, 6, 7, 12 handler, offline + runbook          | A1          | ~12 pts      |
| Bushra  | 2, 3, 5, 13b                                            | A2          | ~13 pts      |
| Saransh | Coordination, 4, 13a, approve handler, trace panel, e2e | A0 + A3     | ~13 pts      |
| Darsh   | 10, 11, 12 infra, 14, 15 hosting/deploy, 16             | A4          | ~13 pts      |

Points are rough (1 pt ≈ 1–2 focused hours). Rebalance at each milestone if someone is ahead or behind.

Integration comes last: 13 → 14 → 15 → 16. Handoffs and stubs are listed in [docs/HANDOFFS.md](docs/HANDOFFS.md).

## Security notes

- Cognito JWT authorizer on **all** API routes. Without it, `approve` could be called by anyone with the URL.
- Amazon Location API key restricted to the app's referrer domains.
- SNS: email subscriptions or verified SMS numbers only (new accounts are in the SMS sandbox).
- No secrets in git: `.env` is gitignored, and runtime config lives in SSM Parameter Store.
- The agent cannot dispatch. Dispatch happens only after a human approves through the Step Functions task token.
- Bedrock IAM is scoped to the single chosen model.
