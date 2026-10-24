/**
 * GridRisk shared contracts (handoff H1).
 *
 * FROZEN: every team imports these. Changing them requires a PR with 2 approvals
 * (enforced via .github/CODEOWNERS). See docs/CONTRACTS.md.
 */
import { z } from 'zod';

// ---------- GeoJSON primitives ----------

/** [lon, lat] – GeoJSON order. */
export const PositionSchema = z.tuple([z.number(), z.number()]);

export const PolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(PositionSchema).min(4)).min(1),
});
export type Polygon = z.infer<typeof PolygonSchema>;

export const LineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(PositionSchema).min(2),
});
export type LineString = z.infer<typeof LineStringSchema>;

// ---------- Events ----------

export const EventTypeSchema = z.enum(['weather', 'outage', 'road_closure']);
export type EventType = z.infer<typeof EventTypeSchema>;

export const SeveritySchema = z.enum(['low', 'high', 'critical']);
export type Severity = z.infer<typeof SeveritySchema>;

export const DemoEventSchema = z.object({
  id: z.string().min(1),
  type: EventTypeSchema,
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  description: z.string().min(1),
  severity: SeveritySchema,
  zoneId: z.string().optional(),
  /** ISO-8601 timestamp. */
  timestamp: z.iso.datetime().optional(),
  source: z.string().optional(),
  ingestedAt: z.iso.datetime().optional(),
  expiresAt: z.number().int().positive().optional(),
});
export type DemoEvent = z.infer<typeof DemoEventSchema>;

// ---------- Provider health ----------

export const SourceHealthStatusSchema = z.enum(['healthy', 'stale', 'error', 'empty']);
export type SourceHealthStatus = z.infer<typeof SourceHealthStatusSchema>;

export const SourceHealthSchema = z.object({
  source: z.string().min(1),
  status: SourceHealthStatusSchema,
  fetchedAt: z.iso.datetime(),
  lastSuccessAt: z.iso.datetime().optional(),
  recordCount: z.number().int().nonnegative(),
  maxAgeMinutes: z.number().nonnegative(),
  error: z.string().optional(),
});
export type SourceHealth = z.infer<typeof SourceHealthSchema>;

// ---------- Geography ----------

export const ZoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  polygon: PolygonSchema,
  zips: z.array(z.string().regex(/^\d{5}$/)),
  /** RoadSegment ids that provide ground access into the zone. */
  accessRoadIds: z.array(z.string()),
});
export type Zone = z.infer<typeof ZoneSchema>;

export const RoadSegmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  line: LineStringSchema,
});
export type RoadSegment = z.infer<typeof RoadSegmentSchema>;

export const ShelterStatusSchema = z.enum(['standby', 'active']);
export type ShelterStatus = z.infer<typeof ShelterStatusSchema>;

export const ShelterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
  capacity: z.number().int().nonnegative(),
  status: ShelterStatusSchema,
});
export type Shelter = z.infer<typeof ShelterSchema>;

export const MapDataSchema = z.object({
  version: z.string().min(1),
  zones: z.array(ZoneSchema),
  roads: z.array(RoadSegmentSchema),
  shelters: z.array(ShelterSchema),
});
export type MapData = z.infer<typeof MapDataSchema>;

// ---------- Engine output ----------

export const EngineResultSchema = z.object({
  zoneId: z.string(),
  isolated: z.boolean(),
  closedAccessRoadIds: z.array(z.string()),
  outageEventIds: z.array(z.string()),
  /** road_closure events that closed access roads (UI draws outage → closure lines). */
  closureEventIds: z.array(z.string()),
  emergencyEventIds: z.array(z.string()),
  dependentPatients: z.number().int().nonnegative(),
  /** ASSUMPTION – not in any dataset. See packages/engine/src/config.ts. */
  avgBackupMinutes: z.number().nonnegative(),
  estimatedResponseMinutes: z.number().nonnegative(),
  isolationWindowMinutes: z.number(),
  isolationWindowRangeMinutes: z
    .object({ min: z.number().nonnegative(), max: z.number().nonnegative() })
    .optional(),
  uncertainty: z.literal('planning-estimate').optional(),
  candidateShelterIds: z.array(z.string()),
});
export type EngineResult = z.infer<typeof EngineResultSchema>;

// ---------- Alerts / actions ----------

export const ActionTypeSchema = z.enum(['activate_shelter', 'dispatch_drone', 'send_alert']);
export type ActionType = z.infer<typeof ActionTypeSchema>;

/**
 * Changed from the original `string[]` so that approval can reference actions by id.
 */
export const ProposedActionSchema = z.object({
  id: z.string().min(1),
  type: ActionTypeSchema,
  label: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
});
export type ProposedAction = z.infer<typeof ProposedActionSchema>;

export const AlertStatusSchema = z.enum(['pending', 'approved', 'dispatched']);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;

export const ToolTraceEntrySchema = z.object({
  tool: z.string(),
  input: z.unknown(),
  output: z.unknown(),
});
export type ToolTraceEntry = z.infer<typeof ToolTraceEntrySchema>;

export const AlertCardDataSchema = z.object({
  id: z.string().min(1),
  zoneId: z.string().min(1),
  title: z.string().min(1),
  points: z.array(z.string().min(1)).min(1),
  isolationWindowMinutes: z.number(),
  isolationWindowRangeMinutes: z
    .object({ min: z.number().nonnegative(), max: z.number().nonnegative() })
    .optional(),
  uncertainty: z.literal('planning-estimate').optional(),
  proposedActions: z.array(ProposedActionSchema),
  /** Event ids the UI draws connecting lines between. */
  relatedEventIds: z.array(z.string()),
  status: AlertStatusSchema,
  createdAt: z.iso.datetime(),
  /** Agent tool calls (handoff H9). Absent for template-generated alerts. */
  toolTrace: z.array(ToolTraceEntrySchema).optional(),
});
export type AlertCardData = z.infer<typeof AlertCardDataSchema>;

// ---------- Scenarios ----------

/** Demo scenarios (see buildScenario in @gridrisk/engine for what each one contains). */
export const ScenarioNameSchema = z.enum([
  'calm',
  'escalation',
  'partial',
  'reopened',
  'zone-b',
  'multi-zone',
  'storm',
]);
export type ScenarioName = z.infer<typeof ScenarioNameSchema>;

// ---------- API ----------

export const GetEventsResponseSchema = z.object({ events: z.array(DemoEventSchema) });
export type GetEventsResponse = z.infer<typeof GetEventsResponseSchema>;

export const GetAlertsResponseSchema = z.object({ alerts: z.array(AlertCardDataSchema) });
export type GetAlertsResponse = z.infer<typeof GetAlertsResponseSchema>;

export const ApproveRequestSchema = z.object({ actionIds: z.array(z.string()).min(1) });
export type ApproveRequest = z.infer<typeof ApproveRequestSchema>;

export const ApproveResponseSchema = z.object({ alert: AlertCardDataSchema });
export type ApproveResponse = z.infer<typeof ApproveResponseSchema>;

export const SimulateResponseSchema = z.object({ events: z.array(DemoEventSchema) });
export type SimulateResponse = z.infer<typeof SimulateResponseSchema>;

export const GetHealthResponseSchema = z.object({ health: z.array(SourceHealthSchema) });
export type GetHealthResponse = z.infer<typeof GetHealthResponseSchema>;

export const GetMapDataResponseSchema = MapDataSchema;
export type GetMapDataResponse = z.infer<typeof GetMapDataResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'BAD_REQUEST',
      'INTERNAL',
    ]),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const API_ROUTES = {
  getEvents: { method: 'GET', path: '/events' },
  getAlerts: { method: 'GET', path: '/alerts' },
  approveAlert: { method: 'POST', path: '/alerts/{id}/approve' },
  simulate: { method: 'POST', path: '/simulate/{scenario}' },
  reset: { method: 'POST', path: '/simulate/reset' },
  getHealth: { method: 'GET', path: '/health' },
  getMapData: { method: 'GET', path: '/map-data' },
} as const;
export type ApiRouteName = keyof typeof API_ROUTES;

/** Fill `{param}` placeholders in an API_ROUTES path. */
export function buildPath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined) throw new Error(`Missing path param: ${key}`);
    return encodeURIComponent(value);
  });
}
