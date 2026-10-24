# Handoffs

Each track codes against a **stub** that already exists in `main`, so nobody waits on anyone.
When the real implementation lands, the stub is replaced behind the same signature.

## Milestones

| Milestone | Meaning                                                                    |
| --------- | -------------------------------------------------------------------------- |
| **M0**    | Bootstrap (this repo as pushed): contracts, fixtures, stubs, CI – **done** |
| **M1**    | Each track's standalone demo works                                         |
| **M2**    | Each track is feature-complete against stubs/mocks                         |
| **M3**    | Integration: live backend + real agent + hosted app + e2e                  |

## Board

| ID  | Deliverable                                             | From → To                        | M0 stub        | Real by | Status                              |
| --- | ------------------------------------------------------- | -------------------------------- | -------------- | ------- | ----------------------------------- |
| H1  | Shared contracts + fixtures (`@gridrisk/shared`)        | Bootstrap → All                  | real           | M0      | ✅ done                             |
| H2  | `buildScenario(name)` calm / escalation / reset         | Tanisha → Bushra, Darsh          | yes            | M1      | ✅ real + variants                  |
| H3  | Engine `analyze()` + tool functions                     | Tanisha → Saransh                | yes            | M1      | ✅ deterministic geospatial engine  |
| H4  | `snapshots/*.json` + NWS normalizer                     | Tanisha → Darsh (ingest), Bushra | fixture        | M1      | ✅ NWS + emPOWER snapshots          |
| H5  | `runAgent(input)`                                       | Saransh → Darsh                  | yes (template) | M2      | ✅ Bedrock loop + template fallback |
| H6  | `.env` values: API URL, Cognito IDs, Location key (SSM) | Darsh → Bushra                   | placeholders   | M1      | 🟢 code-complete                    |
| H7  | Approve endpoint + Step Functions                       | Darsh → Bushra                   | MSW mock       | M2      | 🟢 code-complete                    |
| H8  | `MockAdapter` + `DataAdapter`                           | Bushra → Darsh (e2e)             | interface      | M1      | 🟡 interface only                   |
| H9  | Agent `toolTrace` format on alert                       | Saransh → Bushra                 | fixture        | M2      | ✅ populated on model-path alerts   |

Status key: ⬜ not started · 🟡 stub or partial · 🟢 code-complete (CDK merged, not yet deployed) · ✅ real and merged

> **H6/H7 (Darsh):** the CDK stack is built and `cdk synth` + infra tests are green, so the
> approve endpoint, Step Functions workflow, and the SSM-published `.env` values are code-complete.
> They flip to ✅ once `cdk deploy` runs — currently blocked because the workshop `WSParticipantRole`
> lacks `iam:CreateRole` (AWS team is enabling it). Deploy steps + the curl demo are in the README
> runbook. @BUSHRA_HANDLE — the `LiveAdapter` can be wired against CONTRACTS.md now; the deployed URL
>
> - Cognito IDs land in SSM the moment IAM is unblocked.

The agent (H5, H9) is built in four slices, one per person: A1 tools (Tanisha), A2 output and
grounding (Bushra), A3 Converse loop (Saransh), A4 orchestration and Lambda (Darsh). The
interfaces between slices are in [todo/saransh-agent.md](../todo/saransh-agent.md#agent-interfaces-freeze-at-kick-off).

## Where the stubs live

| ID  | Import / file                                                                            |
| --- | ---------------------------------------------------------------------------------------- |
| H1  | `@gridrisk/shared`, `@gridrisk/shared/fixtures`                                          |
| H2  | `import { buildScenario } from '@gridrisk/engine'`                                       |
| H3  | `import { analyze, correlate, checkIsolation, … } from '@gridrisk/engine'`               |
| H4  | `ESCALATION_ENGINE_RESULT` / `ZONE_A` fixtures until `packages/engine/snapshots/` exists |
| H5  | `import { runAgent } from '@gridrisk/agent'` (Bedrock Converse loop, template fallback)  |
| H6  | `.env.example`                                                                           |
| H7  | MSW handlers Bushra writes from [CONTRACTS.md](CONTRACTS.md#http-api)                    |
| H8  | `apps/web/src/data/DataAdapter.ts`                                                       |
| H9  | `ToolTraceEntrySchema` in `@gridrisk/shared`                                             |

## Protocol

1. **Producer:** merge a PR that makes the handoff real behind the **same signature**. Tick the
   Status column in this file in that PR, and `@mention` the consumer(s) in the PR description.
2. **Consumer:** swap the stub or mock for the real thing in a **separate PR**. Example: Bushra
   replaces the MSW approve handler with `LiveAdapter` once H7 is ✅.
3. If the contract itself must change, follow the change policy in [CONTRACTS.md](CONTRACTS.md#change-policy)
   first.
4. Blocked for more than about 1 hour? Post in the team channel with the handoff ID. Keep going on the stub.
