# Bushra – UI (`apps/web`)

## Role & owned directories

You own the EOC dashboard: layout, map, feed, alert card, approval UX and data adapters.

- Owns: `apps/web/**`
- Reads: `@gridrisk/shared` (types and fixtures), `@gridrisk/engine` (`buildScenario` for MockAdapter)
- Run it: `npm run dev` (from the repo root) · Test it: `npm test -w @gridrisk/web`

## Inbound handoffs (what you wait for, and what to use meanwhile)

| ID  | What                               | From      | Use meanwhile                                                 |
| --- | ---------------------------------- | --------- | ------------------------------------------------------------- |
| H1  | Contracts + fixtures               | Bootstrap | ✅ already real                                               |
| H2  | `buildScenario()`                  | Tanisha   | ✅ stub in `@gridrisk/engine` (returns fixtures)              |
| H6  | API URL, Cognito IDs, Location key | Darsh     | `.env.example`. Leave the key empty to use the offline style. |
| H7  | Approve API + Step Functions       | Darsh     | MSW handlers you write from `docs/CONTRACTS.md`               |
| H9  | `toolTrace` on alerts              | Saransh   | `ToolTraceEntrySchema`; hand-write a fixture trace            |

## Outbound handoffs (what you owe)

| ID  | What                                     | To                            | By  |
| --- | ---------------------------------------- | ----------------------------- | --- |
| H8  | `MockAdapter` implementing `DataAdapter` | Saransh (contract suite, e2e) | M1  |

## Tasks

### M1

- [x] **Task 2: App shell, theme, store, MockAdapter**
  - Objective: a static command-center layout running fully offline.
  - Guidance:
    - Keep the M0 shell (`src/App.tsx`), including the top bar "GridRisk • LIVE FEED • SYNTHETIC DATA".
    - Zustand store: `events`, `alerts`, `selectedEventId`, `mode`.
    - `src/data/MockAdapter.ts` implements `DataAdapter` in memory:
      - `simulate('escalation')` uses `buildScenario`, then creates an alert with `analyze` from `@gridrisk/engine` plus `buildTemplateAlert` from `@gridrisk/agent/template`. That subpath is safe for the browser; don't import the `@gridrisk/agent` root, which will pull in the Bedrock SDK.
      - `approve` changes the alert status from pending to dispatched.
      - `reset` returns to calm.
    - Wire it into `selectAdapter.ts`.
    - Add a dev toolbar with Simulate and Reset buttons.
  - Tests: the layout renders; store reducers; `MockAdapter.simulate` adds the escalation events and one pending alert; `approve` sets the alert to dispatched; approving twice fails, matching the API's 409.
  - Demo: the shell shows the calm event count, and Simulate increases it.
- [x] **Task 3: MapComponent**
  - Objective: a Houston map showing events, zones and closures.
  - Guidance:
    - Use `react-map-gl/maplibre`, centered on `HOUSTON_CENTER` (29.76, −95.37).
    - When `VITE_LOCATION_API_KEY` is set, use
      `https://maps.geo.us-east-1.amazonaws.com/v2/styles/Monochrome/descriptor?key=KEY&color-scheme=Dark`.
      Check this URL against the current AWS docs.
    - Otherwise, use a bundled offline style: a dark background plus a grid.
    - Write pure functions that turn events, zones, roads and shelters into GeoJSON.
    - Styling: the outage zone polygon is red, the closure `RoadSegment` line is yellow, and critical events get pulsing CSS markers.
  - Tests: the GeoJSON transform functions. WebGL rendering isn't unit-tested.
  - Demo: calm pins show; Simulate adds the polygon, the yellow line and 3 red pins.
- **Task 4: EventFeed** → **moved to Saransh** to balance workload (details in [saransh-agent.md](saransh-agent.md#other-tasks-saransh)). You review the PR.
  Give Saransh the store shape (`events`, `selectedEventId`) and the map's fly-to hook early.

### M2

- [ ] **Task 5: AlertCard and approval UX**
  - Objective: the full alert → approve → dispatched loop in mock mode.
  - Guidance:
    - Slide-in: `initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }}`.
    - Show the title, the points, and "⏱️ ISOLATION WINDOW: MM:SS" from a `useCountdown(minutes, clock?)` hook with an injectable clock.
    - Action checkboxes.
    - Approve button states: idle → loading → "✅ DISPATCHED", with an error state.
    - Toast: "SNS Alert Sent. Recon Drone Deployed."
    - Map:
      - animated lines between `relatedEventIds`, in the order outage → closure
      - after dispatch, Shelter B turns green
      - a drone path animates toward Zone A
  - Tests: countdown with fake timers; button state machine; approve sends only the checked `actionIds`.
  - Demo: the full offline loop, with no network.
- **Task 13a: LiveAdapter against MSW** → **moved to Saransh** to balance workload (details in [saransh-agent.md](saransh-agent.md#other-tasks-saransh)). You review the PR.
  Your `MockAdapter` (H8) must pass his shared contract suite.

### M3

- [ ] **Task 13b: Real API and auth** (with Darsh)
  - Objective: the UI runs against the deployed backend.
  - Guidance:
    - Point `LiveAdapter` at the real API and poll `/events`, `/alerts`, and `/map-data` every 3 s.
    - Sign in with Cognito using Amplify Auth, and send `Authorization: Bearer`.
    - Show an offline/error banner instead of failing silently.
    - The collapsible tool-trace panel (H9) is Saransh's; leave a slot for it in the AlertCard.
  - Tests: the contract suite still passes; banner on fetch failure.
  - Demo: log in, Simulate, and the alert created by Step Functions appears. Approve, and the SNS email arrives.

### Accessibility (all tasks)

- Keyboard operable: Tab or Enter reaches the checkboxes, Approve, Simulate and the feed items.
- `aria-label` on icon-only buttons (lucide icons).
- `aria-live="polite"` on the toast, and `aria-live="assertive"` on a new critical alert.
- Text contrast meets WCAG AA on slate-900. Don't rely on color alone: add severity text or an icon.
- Respect `prefers-reduced-motion` for the pulse and slide animations.

## Agent slice: A2 – Output and grounding (M1)

The agent is split four ways. Yours turns Claude's answer into the `AlertCardData` your
AlertCard renders, and rejects any number not from the engine (`packages/agent/src/submit.ts`,
`actions.ts`, `assemble.ts`, `validate.ts`). You review Darsh's slice (A4). Details, interfaces
and tests are in [saransh-agent.md](saransh-agent.md#a2--output-and-grounding-bushra--m1--part-of-task-9).

## Branch naming

`feat/bushra-<task>`, e.g. `feat/bushra-task2-shell`, `feat/bushra-task5-alertcard`.

## Definition of done

- Tests are green in CI (lint, format, typecheck, test, build).
- The demo (a GIF or a short description) is in the PR description.
- `docs/HANDOFFS.md` status is updated if the PR delivers or consumes a handoff.
