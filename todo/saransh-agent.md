# Saransh – Agent (`packages/agent`)

## Role & owned directories

You own the EOC copilot agent. It investigates using the engine's tools and **proposes** an
alert with actions. It never acts on its own.

- Owns: `packages/agent/**`
- Reads: `@gridrisk/engine` (tool functions), `@gridrisk/shared` (schemas)
- Test it: `npm test -w @gridrisk/agent`

## Inbound handoffs

| ID  | What                       | From      | Use meanwhile                                                    |
| --- | -------------------------- | --------- | ---------------------------------------------------------------- |
| H1  | Contracts + fixtures       | Bootstrap | ✅ already real                                                  |
| H3  | Engine `analyze()` + tools | Teammate3 | ✅ stubs in `@gridrisk/engine`; same signatures, fixture results |

## Outbound handoffs

| ID  | What                                   | To        | By                                         |
| --- | -------------------------------------- | --------- | ------------------------------------------ |
| H5  | `runAgent(input)` (Bedrock + fallback) | Teammate4 | M2 (the template stub is already exported) |
| H9  | `toolTrace` populated on alerts        | Darsh     | M2                                         |

## Tasks

### M1

- [ ] **Task 8: Bedrock Converse tool-use loop**
  - Objective: the agent investigates with tools and returns a valid `AlertCardData`.
  - Guidance:
    - `@gridrisk/agent` already depends on `@aws-sdk/client-bedrock-runtime` (pinned); implement the loop in `src/bedrock.ts`.
    - Keep `src/template.ts` free of SDK imports: the web app imports it via `@gridrisk/agent/template`.
    - `ConverseCommand`, with the model from `BEDROCK_MODEL_ID` and region `us-east-1`.
    - In `src/tools.ts`, map each name in `TOOL_NAMES` to an engine function.
    - Generate the `submit_alert` input schema from `AlertCardDataSchema` with `z.toJSONSchema`.
    - Stop the loop at `submit_alert` or after `BEDROCK_DEFAULTS.maxTurns` (8).
    - Keep the `runAgent` signature unchanged; Teammate4 depends on it.
  - Tests:
    - Use `aws-sdk-client-mock` to script tool-call sequences.
    - The final output parses.
    - The turn cap is enforced.
    - An unknown tool name is handled.
  - Demo: `npm run agent:local -- escalation` (add the script) prints a valid alert with the model stubbed.

### M2

- [ ] **Task 9: Grounding, safety, fallback**
  - Objective: the output can be trusted, and a model failure can't break the demo.
  - Guidance:
    - **System prompt:** EOC copilot; proposes and never acts; cites tool outputs; chooses actions only from `activate_shelter`, `dispatch_drone` and `send_alert`.
    - **Post-validator:** every number in `points` and in `isolationWindowMinutes` must match the `EngineResult`; otherwise reject the output.
    - **Fallback:** on an error, a timeout (`BEDROCK_DEFAULTS.timeoutMs`, about 8 s) or a validation failure, use `buildTemplateAlert`. It is already real and tested.
    - **Trace:** record every tool call in `toolTrace` (H9).
  - Evals (4 scenarios):

    | Scenario              | Expected result   |
    | --------------------- | ----------------- |
    | calm                  | `null`            |
    | partial (outage only) | `null` or a watch |
    | full escalation       | an alert          |
    | bridge reopened       | no isolation      |

    Ask Teammate3 for `partial` and `reopened` scenarios, or build them from the fixtures.

  - Tests:
    - The validator catches made-up numbers.
    - The fallback path runs.
    - The evals pass with the stubbed model.
    - An opt-in real run with `RUN_BEDROCK=1` (skipped in CI).
  - Demo: a real Bedrock call from the CLI produces the Zone A alert in Claude's wording, and with the network off, the template alert is returned.

### M3

- [ ] **Task 14: RunAgent Lambda** (with Teammate4)
  - Objective: alert text comes from Bedrock, grounded by the engine, inside Step Functions.
  - Guidance:
    - A Lambda handler wraps `runAgent`.
    - IAM allows `bedrock:InvokeModel` for the chosen model or inference profile **only**.
    - 30 s timeout.
    - Keep the fallback, and store the trace on the alert.
  - Tests: handler test with a mocked Bedrock client; integration test in the dev stack.
  - Demo: Simulate in the UI shows an alert card written by Claude with the engine's numbers, and the trace is visible.

## Notes

- Never let the model's text be the source of any number. Numbers come from the engine.
- Model access must be enabled in the Bedrock console for the account and region before the real runs.

## Branch naming

`feat/saransh-<task>`, e.g. `feat/saransh-task8-converse-loop`.

## Definition of done

- Tests are green in CI.
- The demo (CLI output) is in the PR description.
- `docs/HANDOFFS.md` H5/H9 status is updated.
