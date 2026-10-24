# Agent – shared by all four (`packages/agent`)

## Role & owned directories

The EOC copilot agent investigates using the engine's tools and **proposes** an alert with
actions. It never acts on its own. The agent is built by all four of us, one slice each, so that
everyone can walk a judge through it.

- **Coordinator:** Saransh. Lands the A0 interface stubs, reviews merges and runs the evals.
  Saransh also has some UI and cloud tasks to balance effort: see [Other tasks](#other-tasks-saransh).
- Owns: `packages/agent/**`. Each slice owns the files listed in its task below.
- Reads: `@gridrisk/engine` (tool functions), `@gridrisk/shared` (schemas)
- Test it: `npm test -w @gridrisk/agent`

## How a request flows (learn this, all of us)

```text
runAgent({ zoneId, events })                                   A4 Darsh
  └─ engine.analyze → not isolated? return null (model never called)
  └─ no BEDROCK_MODEL_ID? return buildTemplateAlert(...)
  └─ runBedrockLoop (8 turns, 8 s timeout)                     A3 Saransh
       └─ Claude calls tools → executeTool → engine functions  A1 Tanisha
       └─ Claude calls submit_alert { title, points, actionTypes }
  └─ assembleAlert: every id and number from the EngineResult  A2 Bushra
  └─ AlertCardDataSchema.parse + checkGrounding                A2 Bushra
  └─ any error / timeout / bad number → buildTemplateAlert     A4 Darsh
```

## The split

| Slice | Owner   | Files                                                                            | One-line pitch for the demo                       |
| ----- | ------- | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| A1    | Tanisha | `src/tools.ts`                                                                   | "Every number Claude sees comes from our engine." |
| A2    | Bushra  | `src/submit.ts`, `src/actions.ts`, `src/assemble.ts`, `src/validate.ts`          | "Claude can't make up a number; we check it."     |
| A3    | Saransh | `src/prompt.ts`, `src/bedrock.ts`, `scripts/stub-model.ts`, `test/evals.test.ts` | "How Claude investigates, step by step."          |
| A4    | Darsh   | `src/runAgent.ts`, `src/handler.ts`, `scripts/local.ts`                          | "If Bedrock is down, the demo still works."       |

Each slice is roughly the same size (about 300–400 lines including tests). Everyone also
**reviews one other slice**, so each of us knows two slices well:

| Author  | Reviewer |
| ------- | -------- |
| Tanisha | Saransh  |
| Bushra  | Tanisha  |
| Saransh | Darsh    |
| Darsh   | Bushra   |

## Sequencing

1. **Kick-off (30 min, all):** read this file and agree on the interfaces below.
2. **A0 (Saransh, first, small):** merge stubs for every signature below, with `TODO(<name>)`
   bodies that return fixture data, so all four slices can start in parallel without waiting.
   Also add `zod@4.6.7` and `aws-sdk-client-mock` (pinned) to `@gridrisk/agent`.
3. **A1–A4 in parallel.** Replace your stub behind the same signature. Merge in any order.
4. **Walkthrough (30–45 min, all):** run `npm run agent:local -- escalation --stub`, then each
   person explains their slice in about 5 minutes.

## Agent interfaces (freeze at kick-off)

Same rule as `docs/CONTRACTS.md`: change a signature only after telling the slice that consumes it.

```ts
// A1 – src/tools.ts (Tanisha)
interface ToolContext { events: DemoEvent[]; zones: Zone[]; shelters: Shelter[]; config: EngineConfig }
type ToolExecution = { ok: true; output: Record<string, unknown> } | { ok: false; error: string };
const TOOL_NAMES: readonly [...]; // unchanged, 7 names ending with 'submit_alert'
const TOOL_SPECS: ToolSpecification[]; // Bedrock specs for all 7; submit_alert schema from A2
function executeTool(name: string, input: unknown, ctx: ToolContext): ToolExecution; // never throws

// A2 – src/submit.ts, actions.ts, assemble.ts, validate.ts (Bushra)
const SubmitAlertSchema: ZodType<SubmitAlertInput>;
type SubmitAlertInput = { title: string; points: string[]; actionTypes: ActionType[] };
function buildProposedActions(types: ActionType[], ctx: { zone; shelters; result }): ProposedAction[];
function assembleAlert(sub: SubmitAlertInput, result: EngineResult,
  opts: { zone; shelters; now?: Date; id?: string; toolTrace?: ToolTraceEntry[] }): AlertCardData;
function checkGrounding(alert: AlertCardData, result: EngineResult,
  ctx: { zone; shelters }): { ok: boolean; errors: string[] };

// A3 – src/bedrock.ts, prompt.ts, scripts/stub-model.ts (Saransh)
interface ConverseClient {
  send(cmd: ConverseCommand, opts?: { abortSignal?: AbortSignal }): Promise<ConverseCommandOutput>;
}
class AgentError extends Error {
  code: 'max_turns' | 'no_submit' | 'invalid_submit' | 'aborted' | 'timeout' | 'model_error' | 'ungrounded';
}
function runBedrockLoop(o: { client: ConverseClient; modelId: string; zone: Pick<Zone, 'id' | 'name'>;
  ctx: ToolContext; maxTurns?: number; signal?: AbortSignal }):
  Promise<{ submission: SubmitAlertInput; trace: ToolTraceEntry[]; turns: number }>;
function createStubModel(o?: { hallucinate?: boolean }): ConverseClient; // offline scripted "Claude"

// A4 – src/runAgent.ts, handler.ts (Darsh)
runAgent(input: { zoneId; events }, deps?: { zones?; shelters?; now?;          // signature frozen (H5)
  config?; bedrockClient?; modelId?; timeoutMs?; logger? }): Promise<AlertCardData | null>;
handler(event: unknown): Promise<{ alert: AlertCardData | null }>;             // @gridrisk/agent/handler
```

## Tasks

### A0 – Interface stubs (Saransh, before everything)

- [ ] Stubs for every signature above, returning fixture data (for example `executeTool` returns
      the matching part of `ESCALATION_ENGINE_RESULT`, and `checkGrounding` returns `{ ok: true }`).
- [ ] Add the pinned dependencies; `npm run verify` is green.
- [ ] Demo: everyone can `import` every interface on `main`.

### A1 – Tools (Tanisha) · M1 · part of Task 8

- Objective: each name in `TOOL_NAMES` runs a real engine function with validated input.
- Guidance:
  - One zod input schema per tool, mostly `{ zoneId }`; `get_active_events` takes an optional `zoneId`.
  - Generate `TOOL_SPECS[].inputSchema.json` with `z.toJSONSchema`, and drop the `$schema` key.
  - `check_isolation` uses the closure events that `correlate` found for the zone.
  - `compute_isolation_window` takes **no numbers from the model**; it reads `ctx.config`.
  - Unknown tool, unknown zone or bad input return `{ ok: false, error }`; never throw.
  - Your engine task already adds the `partial` and `reopened` scenarios; the evals (A3) use them.
- Tests: each tool's output equals a direct engine call for escalation; unknown tool, unknown
  zone and bad input each return an error.

### A2 – Output and grounding (Bushra) · M1 · part of Task 9

- Objective: turn Claude's narrow submission into an `AlertCardData` and reject made-up numbers.
- Guidance:
  - `SubmitAlertSchema = AlertCardDataSchema.pick({ title, points }).extend({ actionTypes })`.
    Claude writes only the wording and picks action types; every id and number is filled in by code.
  - `actions.ts`: move the action building out of `template.ts`. The existing test that the
    template equals `SAMPLE_ALERT` must stay green, and `template.ts` and `actions.ts` must stay
    free of AWS SDK imports (the web app bundles them).
  - `send_alert` is new: id `act-alert-<zoneId>`. De-duplicate types, and skip `activate_shelter`
    when the engine found no shelter.
  - `checkGrounding`: every number in the title and points must come from the `EngineResult`
    (patients, minutes and their hour equivalents, event counts, shelter capacity).
    Make it **unit-aware** so counts cannot be confused with time values.
    `isolationWindowMinutes` must equal the engine value.
- Tests: accepts `SAMPLE_ALERT` and "2 hours" for 120 min; rejects "500 patients", "30 minutes",
  "3 HOURS" and a wrong `isolationWindowMinutes`; the assembled alert parses.
- Bonus for your UI track: you'll know exactly what `toolTrace` holds when you build the trace panel.

### A3 – Converse loop and prompt (Saransh) · M1 · Task 8

- Objective: Claude investigates with the tools and returns a valid submission and a trace.
- Guidance:
  - `prompt.ts`: EOC copilot; proposes and never acts; uses the tools and cites only their output;
    actions only from `activate_shelter`, `dispatch_drone` and `send_alert`; must finish with
    `submit_alert`.
  - `bedrock.ts`: `ConverseCommand` with `BEDROCK_MODEL_ID`, region `us-east-1`, temperature 0.
    Run every `toolUse` in a turn, record it in the trace, and send all results back in one
    message. Return an error `toolResult` for an unknown tool or an invalid submission so Claude
    can retry. Stop at `submit_alert` or after `BEDROCK_DEFAULTS.maxTurns` (8). Pass the
    `abortSignal` to `client.send`.
  - `scripts/stub-model.ts`: a scripted fake Claude for offline demos and tests, with a
    `hallucinate` option that writes a made-up number.
  - `test/evals.test.ts`: calm → `null`; partial → `null`; escalation → grounded alert with a
    trace; reopened → `null`. Run once with the stub model, and once with real Bedrock behind
    `RUN_BEDROCK=1` (skipped in CI).
  - Tune the prompt against real Claude once the AWS account is set up (with Darsh).
- Tests (`aws-sdk-client-mock`): scripted tool sequence → submission and trace; turn cap; unknown
  tool keeps going; end without submitting throws; abort throws.

### A4 – Orchestration, fallback and Lambda (Darsh) · M2 · Task 9 + agent side of Task 14

- Objective: `runAgent` returns a Claude-worded alert when it can and the template otherwise.
- Guidance:
  - Keep the `runAgent` signature; add only the optional deps listed in the interfaces.
  - Not isolated → `null` without calling Bedrock. No model id (env `BEDROCK_MODEL_ID`) →
    template, so mock mode and CI stay offline.
  - Wrap the loop in an 8 s timeout (`AbortController`). On any `AgentError`, a schema failure or
    a failed `checkGrounding`: log the reason and return `buildTemplateAlert` (no `toolTrace`).
  - `handler.ts`: validate the event with zod, create one `BedrockRuntimeClient` per container,
    return `{ alert }`. Export it as `@gridrisk/agent/handler`.
  - `scripts/local.ts` and a root `npm run agent:local -- <scenario> [--stub] [--hallucinate]`
    that prints which path was used (bedrock, template or none) and the alert JSON.
  - Then, in your infra track: the RunAgent Lambda with a 30 s timeout and `bedrock:InvokeModel`
    on the single model or inference-profile ARN only. Set up Bedrock model access in the account.
- Tests: happy path with a mocked client has a `toolTrace`; fallback on an SDK error, a timeout
  and a made-up number each equal the template output; handler rejects bad input and returns
  `{ alert: null }` for calm.

## Other tasks (Saransh)

Moved from Bushra and Darsh so everyone's total effort is about the same (see the table in
[PLAN.md](../PLAN.md#tasks)). Each one is reviewed by the person it came from, who still owns
that directory.

### M1

- [ ] **Task 4: EventFeed** (from Bushra, in `apps/web`, Bushra reviews)
  - Objective: a live list of events in the left sidebar.
  - Guidance: newest first; colors by severity, plus severity text or an icon so color isn't the
    only signal; monospace timestamps and IDs; clicking an item sets `selectedEventId` and flies
    the map to it; framer-motion entry animation that respects `prefers-reduced-motion`; items
    reachable and selectable with the keyboard.
  - Tests: sort order; severity class; clicking sets the selection.
  - Demo: the feed updates on Simulate, and clicking an item pans the map.

### M2

- [ ] **Task 13a: LiveAdapter against MSW** (from Bushra, in `apps/web`, Bushra reviews)
  - Objective: the live mode is ready before the backend exists.
  - Guidance: add `src/data/LiveAdapter.ts`, which uses `fetch`, `API_ROUTES` and `buildPath`,
    and validates responses with the zod schemas. Add MSW handlers that follow
    `docs/CONTRACTS.md`, including the 401/404/409 errors. Write one shared contract test suite
    that runs against both `MockAdapter` (Bushra's H8) and `LiveAdapter`.
  - Tests: the shared contract suite passes for both adapters.
  - Demo: `VITE_DATA_MODE=live` with MSW behaves the same as mock mode.
- [ ] **Approve handler, part of Task 11** (from Darsh, in `infra`, Darsh reviews)
  - Objective: `POST /alerts/{id}/approve` behaves exactly as `docs/CONTRACTS.md` says.
  - Guidance: a Lambda handler that validates the body with `ApproveRequestSchema`, loads the
    alert, rejects unknown `actionIds`, calls Step Functions `SendTaskSuccess` with the stored task
    token and the chosen actions, and returns `{ alert }`. Errors use `ApiErrorSchema`. Agree the
    alert record shape (where the task token lives) with Darsh first; he wires the route,
    authorizer and IAM.
  - Tests (`aws-sdk-client-mock` for DynamoDB and SFN): 200; 400 for an empty or unknown
    `actionIds`; 404 for an unknown alert; 409 if it is already approved or dispatched;
    `SendTaskSuccess` is not called on any error.
- [ ] **Tool-trace panel, part of Task 13b** (from Bushra, in `apps/web`, Bushra reviews)
  - Objective: judges can see how the agent reached its alert (H9).
  - Guidance: a collapsible panel in the AlertCard slot Bushra leaves, listing each `toolTrace`
    entry (tool name, a short input, the key output numbers). Hidden for template alerts, which
    have no trace. Keyboard operable, with `aria-expanded`.
  - Tests: renders entries in order; hidden without a trace; toggles with the keyboard.

### M3

- [ ] **Playwright e2e, part of Task 15** (from Darsh, Darsh reviews the `.github/` change)
  - Objective: the demo loop can't silently break.
  - Guidance: mock mode, in CI: calm → Simulate → alert appears → check actions → Approve →
    "DISPATCHED" → Reset. Use roles and labels for selectors, not CSS classes.
  - Demo: the e2e job is green in CI.

## Outbound handoffs

| ID  | What                                   | To     | Delivered by     |
| --- | -------------------------------------- | ------ | ---------------- |
| H5  | `runAgent(input)` (Bedrock + fallback) | Darsh  | A4 (on A1–A3)    |
| H9  | `toolTrace` populated on alerts        | Bushra | A3 + A2 assembly |

## Notes

- Never let the model's text be the source of any number. Numbers come from the engine.
- Model access must be enabled in the Bedrock console for the account and region before the real runs.
- Keep `src/template.ts` (and anything it imports) free of SDK imports: the web app imports it via
  `@gridrisk/agent/template`.

## Branch naming

`feat/<name>-agent-<slice>`, e.g. `feat/tanisha-agent-a1-tools`, `feat/bushra-agent-a2-grounding`.

## Definition of done (per slice)

- Tests are green in CI, and your reviewer from the table above has approved.
- The PR description says in 3–4 sentences what the slice does, so the others can learn it.
- After A4 merges: `docs/HANDOFFS.md` H5/H9 status is updated.
