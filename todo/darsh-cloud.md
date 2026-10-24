# Darsh – Cloud & Integration (`infra`, `.github`)

## Role & owned directories

You own everything that runs in AWS, plus CI/CD, and you lead the M3 integration.

- Owns: `infra/**`, `.github/**`
- Reads: `@gridrisk/engine` (`buildScenario`), `@gridrisk/agent` (`runAgent`), `@gridrisk/shared`
- Test it: `npm test -w @gridrisk/infra` · Synth: `npm run synth -w @gridrisk/infra`
- **Never** run `cdk deploy` against a shared or production account without telling the team.
  Use a dev account or stage.

## Inbound handoffs

| ID  | What                       | From    | Use meanwhile                                  |
| --- | -------------------------- | ------- | ---------------------------------------------- |
| H2  | `buildScenario()`          | Tanisha | ✅ stub in `@gridrisk/engine`                  |
| H5  | `runAgent()`               | Saransh | ✅ template stub in `@gridrisk/agent`          |
| H4  | NWS normalizer + snapshots | Tanisha | Fixtures; wire the ingest Lambda when it lands |
| H8  | `MockAdapter`              | Bushra  | No longer needed by you: Saransh owns the e2e  |

## Outbound handoffs

| ID  | What                                                                  | To     | By  |
| --- | --------------------------------------------------------------------- | ------ | --- |
| H6  | API URL, Cognito pool/client IDs, Location key → SSM + `.env.example` | Bushra | M1  |
| H7  | `POST /alerts/{id}/approve` + Step Functions working                  | Bushra | M2  |

## Tasks

### M1

- [x] **Task 10: Core infrastructure and read API** — _done: 4 DynamoDB tables (events w/ NEW_IMAGE stream, alerts, shelters, snapshots), Cognito pool + client, HTTP API with a JWT authorizer on every route, read/simulate Lambdas, Amazon Location key + route calculator + map, CORS, H6 values in SSM._
  - Objective: a deployed backend that serves events.
  - Guidance:
    - Build it in `GridRiskStack`.
    - **DynamoDB:**
      - `events` table (pk `id`, stream `NEW_IMAGE`)
      - `alerts` table (pk `id`)
    - **HTTP API:** a Cognito user pool and a **JWT authorizer on every route**.
    - **Lambdas** (Node 22, esbuild bundling via `NodejsFunction`):
      - `GET /events`
      - `GET /alerts`
      - `POST /simulate/{scenario}` (writes `buildScenario(...)`)
      - `POST /simulate/reset`
    - Responses and errors follow `docs/CONTRACTS.md`.
    - **Amazon Location:** an API key restricted to the web app's referrers, plus a route calculator for the stretch goal.
    - **CORS:** the web origin only.
    - Publish H6 values to SSM Parameter Store and document them in `.env.example`.
  - Tests:
    - CDK assertions: 2 tables, the authorizer is attached to every route, the stream is enabled.
    - Handler unit tests with `aws-sdk-client-mock` for DynamoDB.
  - Demo: `cdk deploy` to the dev account. An authenticated `curl` to `/events` returns the calm events, and `/simulate/escalation` adds the escalation set.

### M2

- [x] **Task 11: Human-approval workflow** — _done: events stream -> debounced trigger -> state machine (RunAgent -> SaveAlert `.waitForTaskToken` 1h -> parallel Dispatch -> MarkDispatched); POST /alerts/{id}/approve wired with the authorizer and `states:SendTaskSuccess`._
  - Objective: an alert is created, waits for a human, and the dispatch is real.
  - Guidance:
    - **Trigger:** the `events` stream invokes a Lambda that starts the state machine once per zone (debounced: skip if a pending or dispatched alert already exists for the zone).
    - **States:**
      1. `RunAgent`: calls `runAgent`; the stub is fine.
      2. `SaveAlert`.
      3. `WaitForApproval`: `.waitForTaskToken`, with the token stored on the alert record and a 1 h timeout.
      4. `Dispatch` (parallel):
         - SNS publish to an email subscription or a verified SMS number (new accounts are in the SMS sandbox)
         - set the shelter to `active`
         - write a drone mission record
      5. `MarkDispatched`.
    - **`POST /alerts/{id}/approve`:** the handler code and its tests (validate `actionIds`, `SendTaskSuccess`, 404/409) are **Saransh's**; you wire the route, the authorizer, IAM and where the task token is stored. Agree the alert-record shape with him first.
  - Tests: state machine definition assertions; the route has the authorizer.
  - Demo: `curl` simulate escalation, and a pending alert appears in `/alerts`. `curl` approve, the SNS email arrives, and the alert shows `dispatched`.
- [x] **Task 12 (infrastructure)** — _done: EventBridge Scheduler `rate(5 minutes)` invokes the ingest Lambda via a least-privilege role that can invoke only that function._
  - EventBridge Scheduler runs every 5 min and invokes the ingest Lambda (Tanisha's handler).
  - Use least-privilege IAM.

### M3

- [x] **Task 14** (with Saransh): replace the stub in `RunAgent` with the real agent. — _done._
  - The RunAgent Lambda builds one `BedrockRuntimeClient` at module scope and calls
    `runAgent({zoneId, events}, { bedrockClient, modelId: BEDROCK_MODEL_ID, logger })`; the logger
    writes structured JSON via `console`. Output shape is unchanged.
  - Default model id is now the cross-region inference profile `us.anthropic.claude-sonnet-4-6`
    (override with env `BEDROCK_MODEL_ID`). With no model id the agent uses the template, so CI
    stays offline.
  - `bedrock:InvokeModel` is scoped to the inference-profile ARN in-region **plus** the underlying
    foundation model `anthropic.claude-sonnet-4-6` in us-east-1 / us-east-2 / us-west-2 (the regions
    the profile routes to). Nothing broader.
  - 30 s Lambda timeout, 512 MB memory; the SFN RunAgent task timeout is 60 s (>= 30 s).
- [x] **Task 15: Hosting and CI/CD** — _done: S3 + CloudFront with OAC._
  - Private S3 bucket (BlockPublicAccess ALL, enforceSSL, autoDeleteObjects + DESTROY for the demo).
  - CloudFront distribution: OAC S3 origin, `defaultRootObject index.html`, redirect-to-HTTPS, SPA
    fallback (403/404 -> `/index.html` 200). A second `/api/*` behavior proxies to the HTTP API
    (HttpOrigin on the execute-api domain, caching disabled, ALL methods,
    `OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER` so Authorization is forwarded) with a
    viewer-request CloudFront Function that strips the `/api` prefix — so the web app calls
    same-origin `/api/*` and needs no CORS.
  - `BucketDeployment` uploads `apps/web/dist` **only if it exists at synth time**, so synth/tests
    run without a web build. Deploy flow: build web with `VITE_*` from SSM, then `cdk deploy`.
  - Outputs `WebUrl` (`https://<distribution domain>`) and publishes `/gridrisk/web-url` to SSM.
  - `infra/scripts/deploy.sh` (build web live-mode + deploy) and `infra/scripts/demo-user.ts`
    (create/update the Cognito demo user via SDK, no aws CLI needed; the pool client already allows
    USER_PASSWORD_AUTH). npm scripts: `deploy`, `demo-user`.
  - `.github/workflows/deploy.yml` (OIDC) uses the same build-web-then-deploy flow; still a no-op
    without `vars.AWS_DEPLOY_ROLE_ARN`.
  - LocationApiKey: left its logical id and properties stable (single referrer derived from the
    primary web origin, byte-for-byte identical for single-origin deploys) to avoid the
    replacement that previously caused DELETE_FAILED. The CloudFront domain is not added to the key
    referrers (it would only matter if tiles were loaded from that origin; API calls go same-origin).
- [x] **Task 16: Hardening** (all). Shift+R reset (web + e2e); offline mock mode is covered by the
      Playwright job; 5 live reset → simulate → approve runs in a row all reached `dispatched`
      (alert in 7–8 s, real Claude, 6-step trace); the README runbook covers deploy and demo mode.
  - A hidden Shift+R reset that calls `/simulate/reset` or resets the mock store.
  - Check that it works offline: no Location key, no network, no Bedrock (**Tanisha**).
  - Write the README runbook: setup, env vars, deploy, demo mode (**Tanisha**, you supply the deploy steps).
  - Do 5 reset → simulate → approve runs in a row, in both mock and live mode.

## Agent slice: A4 – Orchestration, fallback and Lambda (M2)

The agent is split four ways. Yours is `runAgent` itself (timeout and template fallback), the
RunAgent Lambda handler and the `agent:local` CLI (`packages/agent/src/runAgent.ts`,
`handler.ts`, `scripts/local.ts`). It feeds straight into your Task 14. You review Saransh's slice
(A3). Details, interfaces and tests are in
[saransh-agent.md](saransh-agent.md#a4--orchestration-fallback-and-lambda-darsh--m2--task-9--agent-side-of-task-14).

Also: `/packages/agent/` in `.github/CODEOWNERS` lists only Saransh. Add the other three handles
there so slice owners can approve each other's PRs.

## Branch naming

`feat/darsh-<task>`, e.g. `feat/darsh-task10-core-infra`.

## Definition of done

- Tests are green in CI, and `cdk synth` is clean.
- The demo (curl transcript, or a screenshot of the SNS email) is in the PR description.
- `docs/HANDOFFS.md` H6/H7 status is updated, and Bushra is @mentioned.
