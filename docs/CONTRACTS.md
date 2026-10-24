# Contracts (frozen)

The source of truth is [`packages/shared/src/schemas.ts`](../packages/shared/src/schemas.ts): zod schemas, with TS
types inferred from them. This page is the human-readable mirror. **If the two disagree, the code
wins.** Fix this page in the same PR.

## Change policy

- Any change under `packages/shared/` needs a PR with **2 approvals** (enforced by
  `.github/CODEOWNERS`, where all four owners are listed).
- Additive, optional fields are preferred. Renames and removals need every consumer updated in the
  same PR.
- After it merges, post in the team channel and update [HANDOFFS.md](HANDOFFS.md) if a handoff is affected.

## Data shapes

```ts
type EventType = 'weather' | 'outage' | 'road_closure';
type Severity = 'low' | 'high' | 'critical';

interface DemoEvent {
  id: string;
  type: EventType;
  lat: number;
  lon: number;
  description: string;
  severity: Severity;
  zoneId?: string;
  timestamp?: string; // ISO-8601
}

interface Zone {
  id: string;
  name: string; // display name used verbatim in alerts, e.g. "Zone A"
  polygon: GeoJSON.Polygon; // [lon, lat]
  zips: string[]; // 5-digit, used for emPOWER lookups
  accessRoadIds: string[]; // RoadSegment ids that give ground access
}

interface RoadSegment {
  id: string;
  name: string;
  line: GeoJSON.LineString;
}

interface Shelter {
  id: string;
  name: string;
  lat: number;
  lon: number;
  capacity: number;
  status: 'standby' | 'active';
}

interface EngineResult {
  zoneId: string;
  isolated: boolean;
  closedAccessRoadIds: string[];
  outageEventIds: string[];
  closureEventIds: string[]; // added at M0 so the UI can draw outage → closure lines
  emergencyEventIds: string[];
  dependentPatients: number;
  avgBackupMinutes: number; // ASSUMPTION
  estimatedResponseMinutes: number; // ASSUMPTION
  isolationWindowMinutes: number; // max(0, avgBackup − response)
  candidateShelterIds: string[];
}

interface ProposedAction {
  id: string;
  type: 'activate_shelter' | 'dispatch_drone' | 'send_alert';
  label: string;
  params: Record<string, unknown>;
}

interface AlertCardData {
  id: string;
  zoneId: string;
  title: string;
  points: string[];
  isolationWindowMinutes: number;
  proposedActions: ProposedAction[];
  relatedEventIds: string[]; // UI draws connecting lines between these
  status: 'pending' | 'approved' | 'dispatched';
  createdAt: string; // ISO-8601
  toolTrace?: { tool: string; input: unknown; output: unknown }[]; // H9, agent only
}

type ScenarioName = 'calm' | 'escalation' | 'partial' | 'reopened';
```

**Changes from the original demo prompt:**

- `proposedActions` is now `ProposedAction[]` instead of `string[]`, so that approval can reference
  specific actions by `id`.
- `AlertCardData` gains `id`, `status`, `relatedEventIds`, `createdAt` and `toolTrace`.
- `EngineResult.closureEventIds` was added.

## Fixtures (`@gridrisk/shared/fixtures`)

| Export                     | What                                                                        |
| -------------------------- | --------------------------------------------------------------------------- |
| `ZONE_A`, `ZONES`          | Downtown polygon (lat 29.745–29.770, lon −95.380…−95.350), zips 77002/77010 |
| `BRIDGE_ROAD`, `ROADS`     | `road-bridge-1`, the only access road into Zone A                           |
| `SHELTER_B`, `SHELTERS`    | Shelter B, capacity 200, standby, outside Zone A                            |
| `CALM_EVENTS`              | 3 low-severity events (tree down, minor flicker, light rain)                |
| `ESCALATION_EVENTS`        | outage + bridge closure, all in Zone A                                      |
| `ESCALATION_ENGINE_RESULT` | Synthetic expected engine output: isolated, 340 patients, 120/75 → 45 min   |
| `SAMPLE_ALERT`             | Expected alert: "ZONE A ISOLATED: ACTION REQUIRED" + 2 actions              |
| `HOUSTON_CENTER`           | `{ lat: 29.76, lon: -95.37 }`                                               |

## HTTP API

Base URL: `VITE_API_URL`. All routes require `Authorization: Bearer <Cognito JWT>`. JSON in and out.
`API_ROUTES` and `buildPath()` are exported from `@gridrisk/shared`.

| Method | Path                   | Request body                   | 200 response                              | Errors             |
| ------ | ---------------------- | ------------------------------ | ----------------------------------------- | ------------------ |
| GET    | `/events`              | –                              | `{ events: DemoEvent[] }`                 | 401                |
| GET    | `/alerts`              | –                              | `{ alerts: AlertCardData[] }`             | 401                |
| GET    | `/map-data`            | –                              | `{ zones, roads, shelters }`              | 401                |
| POST   | `/alerts/{id}/approve` | `{ actionIds: string[] }` (≥1) | `{ alert: AlertCardData }`                | 400, 401, 404, 409 |
| POST   | `/simulate/{scenario}` | –                              | `{ events: DemoEvent[] }`                 | 400, 401           |
| POST   | `/simulate/reset`      | –                              | `{ events: DemoEvent[] }` (calm baseline) | 401                |

Error body: `{ error: { code: 'UNAUTHENTICATED' | 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST' | 'INTERNAL', message } }`

- **401**: missing or invalid JWT
- **404**: unknown alert id
- **409**: alert is already `approved` or `dispatched`
- **400**: bad scenario name, or empty or unknown `actionIds`

## Web `DataAdapter` (`apps/web/src/data/DataAdapter.ts`)

```ts
interface DataAdapter {
  getEvents(): Promise<DemoEvent[]>;
  getAlerts(): Promise<AlertCardData[]>;
  getMapData(): Promise<{ zones: Zone[]; roads: RoadSegment[]; shelters: Shelter[] }>;
  approve(alertId: string, actionIds: string[]): Promise<AlertCardData>;
  simulate(scenario: ScenarioName): Promise<DemoEvent[]>; // returns full current event list
  reset(): Promise<void>;
}
```

The adapter is chosen by `VITE_DATA_MODE` (`mock` by default, or `live`). `MockAdapter` and
`LiveAdapter` must pass the same contract test suite.

## Engine (`@gridrisk/engine`)

```ts
buildScenario(name: ScenarioName): DemoEvent[]            // fresh copy; reset = buildScenario('calm')
analyze(events, zones, { config?, shelters? }?): EngineResult[]
correlate(events, zones): ZoneCorrelation[]               // { zoneId, outage/closure/emergencyEventIds }
checkIsolation(zone, closureEvents): { isolated, closedAccessRoadIds }
dependentPatients(zone): number
computeIsolationWindow({ avgBackupMinutes, estimatedResponseMinutes }): number
findShelters(zone, shelters): Shelter[]
DEFAULT_CONFIG = { avgBackupMinutes: 120, estimatedResponseMinutes: 75 }
```

## Agent (`@gridrisk/agent`)

```ts
runAgent({ zoneId, events }, { zones?, shelters?, now? }?): Promise<AlertCardData | null>
buildTemplateAlert(result: EngineResult, { zone, shelters, now?, id? }): AlertCardData
TOOL_NAMES = ['get_active_events', 'correlate_zone', 'check_isolation',
  'get_dependent_patients', 'find_shelters', 'compute_isolation_window', 'submit_alert']
```

`runAgent` returns `null` when the zone is not isolated. Its output must parse with
`AlertCardDataSchema`, and every number in it must match the `EngineResult`.

## Assumptions

| Name                       | Default | Why it's an assumption                                           |
| -------------------------- | ------- | ---------------------------------------------------------------- |
| `avgBackupMinutes`         | 120     | No dataset publishes how long home medical device batteries last |
| `estimatedResponseMinutes` | 75      | Placeholder for the time to get crews into an isolated zone      |

Anything shown in the UI that is based on these must be labelled as assumed.
