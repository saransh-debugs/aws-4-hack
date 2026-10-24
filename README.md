# GridRisk – AI EOC Copilot

GridRisk links separate emergency feeds (power outages, flooded roads) into a single
risk, works out how much time is left, and proposes actions that **a human approves** before
anything is dispatched. Built on AWS: Amazon Location, Bedrock, Step Functions and SNS.

> Status: **M0 bootstrap**. Contracts, fixtures and stubs are in place, and every track can start now.

## Quickstart

```bash
nvm use            # Node 22 (CI). Node >= 20.19 also works locally.
npm install
cp .env.example .env   # optional; defaults to fully offline mock mode
npm run dev            # web app at http://localhost:5173
npm run verify         # lint + format + typecheck + test + build (same as CI)
```

## Who does what

| Person  | Start here                                                 |
| ------- | ---------------------------------------------------------- |
| Saransh | [todo/saransh-agent.md](todo/saransh-agent.md)             |
| Bushra  | [todo/bushra-ui.md](todo/bushra-ui.md)                     |
| Tanisha | [todo/tanisha-data-engine.md](todo/tanisha-data-engine.md) |
| Darsh   | [todo/darsh-cloud.md](todo/darsh-cloud.md)                 |

Then read [docs/CONTRACTS.md](docs/CONTRACTS.md) (the frozen data shapes and API) and
[docs/HANDOFFS.md](docs/HANDOFFS.md) (who delivers what, and which stub to use meanwhile). The full
plan and data-source research are in [PLAN.md](PLAN.md). The active datasets, snapshots, and data
engine readiness checklist are in [docs/DATA.md](docs/DATA.md).

## Workspace map

| Path              | Package            | Owner    | M0 state                                     |
| ----------------- | ------------------ | -------- | -------------------------------------------- |
| `packages/shared` | `@gridrisk/shared` | everyone | **Real** zod contracts + Houston fixtures    |
| `packages/engine` | `@gridrisk/engine` | Tanisha  | `buildScenario` + `analyze` stubs            |
| `packages/agent`  | `@gridrisk/agent`  | all four | `runAgent` stub + **real** template fallback |
| `apps/web`        | `@gridrisk/web`    | Bushra   | Dark shell + `DataAdapter` interface         |
| `infra`           | `@gridrisk/infra`  | Darsh    | Empty CDK stack (nothing deployed)           |

Packages export TypeScript source directly (`"exports": "./src/index.ts"`), so there is no build
step between workspaces.

## Conventions

- Branches: `feat/<name>-<task>`. Open a PR to `main`. CI must be green.
- Changes to `packages/shared` need 2 approvals (see `.github/CODEOWNERS`).
- Dependency versions are pinned exactly (`npm install -E`).
- Never commit `.env` or AWS credentials.
