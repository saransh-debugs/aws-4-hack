# GridRisk – AI EOC Copilot

GridRisk links separate emergency feeds (power outages, flooded roads) into a single
risk, works out how much time is left, and proposes actions that **a human approves** before
anything is dispatched. Built on AWS: Amazon Location, Bedrock, Step Functions and SNS.

> Status: **Prototype integration**. The backend, agent, scheduled data ingest, provider adapters, and
> offline snapshots are implemented. The web map and live-provider validation still need follow-through.

## Quickstart

```bash
nvm use            # Node 22 (CI). Node >= 20.19 also works locally.
npm install
cp .env.example .env   # optional; defaults to fully offline mock mode
npm run dev            # web app at http://localhost:5173
npm run verify         # auto-fix format/lint, then typecheck + test + build (CI blocks only on the last 3)
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

| Path              | Package            | Owner    | M0 state                                                                    |
| ----------------- | ------------------ | -------- | --------------------------------------------------------------------------- |
| `packages/shared` | `@gridrisk/shared` | everyone | **Real** zod contracts + Houston fixtures                                   |
| `packages/engine` | `@gridrisk/engine` | Tanisha  | Deterministic engine, provider adapters, snapshots, and ingest              |
| `packages/agent`  | `@gridrisk/agent`  | all four | `runAgent` stub + **real** template fallback                                |
| `apps/web`        | `@gridrisk/web`    | Bushra   | Dark shell + event feed; map and alert UI remain TODO                       |
| `infra`           | `@gridrisk/infra`  | Darsh    | Deployable API, approval workflow, Location resources, and scheduled ingest |

Packages export TypeScript source directly (`"exports": "./src/index.ts"`), so there is no build
step between workspaces.

## Conventions

- Branches: `feat/<name>-<task>`. Open a PR to `main`. CI must be green.
- Changes to `packages/shared` need 2 approvals (see `.github/CODEOWNERS`).
- Dependency versions are pinned exactly (`npm install -E`).
- Never commit `.env` or AWS credentials.

## Backend runbook (infra, owner: Darsh)

The backend is AWS CDK (`infra/`, stack `GridRiskStack`). It deploys events, alerts, shelters, and
snapshots DynamoDB tables, a
Cognito user pool, an HTTP API with a JWT authorizer on every route, the read/simulate/approve
Lambdas, a Step Functions human-approval workflow, an SNS dispatch topic, an Amazon Location key

- route calculator, and an EventBridge schedule for ingest. H6 values are published to SSM.

### Env vars

| Var                | Used by     | Notes                                                          |
| ------------------ | ----------- | -------------------------------------------------------------- |
| `AWS_REGION`       | deploy, SDK | Defaults to `us-east-1`.                                       |
| `BEDROCK_MODEL_ID` | RunAgent    | Claude model id / inference profile (Task 14).                 |
| `WEB_ORIGIN`       | deploy      | CORS origin + Location key referrer. Default `localhost:5173`. |
| `DISPATCH_EMAIL`   | deploy      | Optional; subscribes an email to the dispatch SNS topic.       |
| `VITE_*`           | web app     | Filled from SSM after deploy — see `.env.example`.             |

Local AWS creds go in `.env` (gitignored). Never commit real credentials.

### Verify (no AWS needed)

```bash
npm test  -w @gridrisk/infra     # CDK assertions + handler unit tests (aws-sdk-client-mock)
npm run synth -w @gridrisk/infra # cdk synth — must be clean
```

### Deploy (dev account)

> One-time per account/region: `npx cdk bootstrap` (from `infra/`). Both bootstrap and deploy
> need an IAM principal allowed to create IAM roles (`iam:CreateRole`, `iam:PassRole`, …). The
> workshop `WSParticipantRole` is **not** allowed to, so deploy from a role/account that is.

```bash
cd infra
WEB_ORIGIN=https://your-web-origin DISPATCH_EMAIL=you@example.com \
  npx cdk deploy --require-approval never
```

Never run `cdk deploy` against a shared or production account without telling the team.

### Create a demo user + get a JWT (for the curl demo)

```bash
POOL=$(aws ssm get-parameter --name /gridrisk/cognito-user-pool-id --query Parameter.Value --output text)
CLIENT=$(aws ssm get-parameter --name /gridrisk/cognito-client-id   --query Parameter.Value --output text)
API=$(aws ssm get-parameter --name /gridrisk/api-url                --query Parameter.Value --output text)

aws cognito-idp admin-create-user --user-pool-id "$POOL" --username demo@example.com \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password --user-pool-id "$POOL" --username demo@example.com \
  --password 'Demo!Passw0rd' --permanent

TOKEN=$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT" \
  --auth-parameters USERNAME=demo@example.com,PASSWORD='Demo!Passw0rd' \
  --query 'AuthenticationResult.IdToken' --output text)
```

### Demo transcript

```bash
# Calm baseline
curl -s -H "Authorization: Bearer $TOKEN" "$API/events" | jq '.events | length'

# Escalate: adds the Zone A outage and bridge closure
curl -s -X POST -H "Authorization: Bearer $TOKEN" "$API/simulate/escalation" | jq '.events | length'

# A pending alert appears (the events stream starts the workflow)
curl -s -H "Authorization: Bearer $TOKEN" "$API/alerts" | jq '.alerts[] | {id, status}'

# Approve it -> SNS email is sent, alert flips to dispatched
ALERT_ID=... # from the call above
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"actionIds":["act-shelter-b","act-drone-zone-a"]}' \
  "$API/alerts/$ALERT_ID/approve" | jq '.alert.status'

# Back to calm
curl -s -X POST -H "Authorization: Bearer $TOKEN" "$API/simulate/reset" | jq '.events | length'
```

### Map status

The CDK stack provisions an Amazon Location map, a referrer-restricted API key, and a route calculator.
The frontend map is implemented in `apps/web/src/components/MapComponent.tsx`: it renders event,
zone, road, and shelter layers, and event-feed selection flies the map to the selected event. The
event feed and map load through the shared `DataAdapter`; `VITE_DATA_MODE=mock` uses deterministic
engine fixtures, while `VITE_DATA_MODE=live` calls the deployed API. Zone, road, and shelter layers
remain fixture-backed until those resources are exposed by the live API. The bundled offline dark
style is used when `VITE_LOCATION_API_KEY` or `VITE_LOCATION_MAP_NAME` is empty.

### Mock / offline mode

The web app runs fully offline with `VITE_DATA_MODE=mock`: no API, no Location key (falls back to
the bundled dark style), no Bedrock. Use this for the Playwright e2e (`e2e/`) and any demo without
a deployed backend.

### CI/CD

`.github/workflows/ci.yml` runs lint, format, typecheck, test and build on every PR.
`.github/workflows/deploy.yml` deploys on merge to `main` using **GitHub OIDC** (no long-lived AWS
keys). It is a no-op until `vars.AWS_DEPLOY_ROLE_ARN` is set to a role whose trust policy allows this
repo's OIDC subject.
