# Darsh – UI (`apps/web`)

## Role & owned directories

You own the EOC dashboard: layout, map, feed, alert card, approval UX and data adapters.

- Owns: `apps/web/**`
- Reads: `@gridrisk/shared` (types and fixtures), `@gridrisk/engine` (`buildScenario` for MockAdapter)
- Run it: `npm run dev` (from the repo root) · Test it: `npm test -w @gridrisk/web`

## Inbound handoffs (what you wait for, and what to use meanwhile)

| ID  | What                               | From      | Use meanwhile                                                 |
| --- | ---------------------------------- | --------- | ------------------------------------------------------------- |
| H1  | Contracts + fixtures               | Bootstrap | ✅ already real                                               |
| H2  | `buildScenario()`                  | Teammate3 | ✅ stub in `@gridrisk/engine` (returns fixtures)              |
| H6  | API URL, Cognito IDs, Location key | Teammate4 | `.env.example`. Leave the key empty to use the offline style. |
| H7  | Approve API + Step Functions       | Teammate4 | MSW handlers you write from `docs/CONTRACTS.md`               |
| H9  | `toolTrace` on alerts              | Saransh   | `ToolTraceEntrySchema`; hand-write a fixture trace            |

## Outbound handoffs (what you owe)

| ID  | What                                     | To              | By  |
| --- | ---------------------------------------- | --------------- | --- |
| H8  | `MockAdapter` implementing `DataAdapter` | Teammate4 (e2e) | M1  |

## Tasks

### M1

- [ ] **Task 2: App shell, theme, store, MockAdapter**
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
- [ ] **Task 3: MapComponent**
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
- [ ] **Task 4: EventFeed**
  - Objective: a live list of events in the left sidebar.
  - Guidance: newest first; colors by severity; monospace timestamps and IDs; clicking an item sets `selectedEventId` and flies the map to it; framer-motion entry animation.
  - Tests: sort order; severity class; clicking sets the selection.
  - Demo: the feed updates on Simulate, and clicking an item pans the map.

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
      - animated lines between `relatedEventIds`, in the order outage → closure → 911
      - after dispatch, Shelter B turns green
      - a drone path animates toward Zone A
  - Tests: countdown with fake timers; button state machine; approve sends only the checked `actionIds`.
  - Demo: the full offline loop, with no network.
- [ ] **Task 13a: LiveAdapter against MSW**
  - Objective: the live mode is ready before the backend exists.
  - Guidance: add `src/data/LiveAdapter.ts`, which uses `fetch`, `API_ROUTES` and `buildPath`, and validates responses with the zod schemas. Add MSW handlers that follow `docs/CONTRACTS.md`, including the 401/404/409 errors. Write one shared contract test suite that runs against both `MockAdapter` and `LiveAdapter`.
  - Tests: the shared contract suite passes for both adapters.
  - Demo: `VITE_DATA_MODE=live` with MSW behaves the same as mock mode.

### M3

- [ ] **Task 13b: Real API and auth** (with Teammate4)
  - Objective: the UI runs against the deployed backend.
  - Guidance:
    - Point `LiveAdapter` at the real API and poll `/events` and `/alerts` every 3 s.
    - Sign in with Cognito using Amplify Auth, and send `Authorization: Bearer`.
    - Show an offline/error banner instead of failing silently.
    - Add a collapsible tool-trace panel (H9).
  - Tests: the contract suite still passes; banner on fetch failure.
  - Demo: log in, Simulate, and the alert created by Step Functions appears. Approve, and the SNS email arrives.

### Accessibility (all tasks)

- Keyboard operable: Tab or Enter reaches the checkboxes, Approve, Simulate and the feed items.
- `aria-label` on icon-only buttons (lucide icons).
- `aria-live="polite"` on the toast, and `aria-live="assertive"` on a new critical alert.
- Text contrast meets WCAG AA on slate-900. Don't rely on color alone: add severity text or an icon.
- Respect `prefers-reduced-motion` for the pulse and slide animations.

## Branch naming

`feat/darsh-<task>`, e.g. `feat/darsh-task2-shell`, `feat/darsh-task5-alertcard`.

## Definition of done

- Tests are green in CI (lint, format, typecheck, test, build).
- The demo (a GIF or a short description) is in the PR description.
- `docs/HANDOFFS.md` status is updated if the PR delivers or consumes a handoff.
