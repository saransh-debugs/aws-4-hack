/**
 * Synthetic Houston fixtures. All coordinates are [lon, lat] in GeoJSON, `lat`/`lon` on events.
 * Everything here is mock data except the shapes, which follow the shared contracts.
 */
import type {
  AlertCardData,
  DemoEvent,
  EngineResult,
  RoadSegment,
  Shelter,
  Zone,
} from '../schemas';

export const HOUSTON_CENTER = { lat: 29.76, lon: -95.37 } as const;

/** Fixed base time so fixtures are deterministic. */
const T0 = '2026-10-23T14:00:00.000Z';
const at = (minutesAfterT0: number): string =>
  new Date(Date.parse(T0) + minutesAfterT0 * 60_000).toISOString();

// ---------- Geography ----------

export const BRIDGE_ROAD: RoadSegment = {
  id: 'road-bridge-1',
  name: 'Buffalo Bayou Access Bridge',
  line: {
    type: 'LineString',
    coordinates: [
      [-95.3825, 29.7642],
      [-95.3778, 29.7622],
    ],
  },
};

export const ZONE_B_ROAD: RoadSegment = {
  id: 'road-zone-b-1',
  name: 'Main Street Evacuation Route',
  line: {
    type: 'LineString',
    coordinates: [
      [-95.345, 29.75],
      [-95.33, 29.75],
    ],
  },
};

export const ZONE_A: Zone = {
  id: 'zone-a',
  /** Display name used verbatim in alert text ("ZONE A ISOLATED…"). Downtown Houston. */
  name: 'Zone A',
  polygon: {
    type: 'Polygon',
    coordinates: [
      [
        [-95.38, 29.745],
        [-95.35, 29.745],
        [-95.35, 29.77],
        [-95.38, 29.77],
        [-95.38, 29.745],
      ],
    ],
  },
  zips: ['77002', '77010'],
  accessRoadIds: [BRIDGE_ROAD.id],
};

export const ZONE_B: Zone = {
  id: 'zone-b',
  name: 'Zone B',
  polygon: {
    type: 'Polygon',
    coordinates: [
      [
        [-95.345, 29.74],
        [-95.32, 29.74],
        [-95.32, 29.765],
        [-95.345, 29.765],
        [-95.345, 29.74],
      ],
    ],
  },
  zips: ['77004'],
  accessRoadIds: [ZONE_B_ROAD.id],
};

export const ZONES: Zone[] = [ZONE_A, ZONE_B];
export const ROADS: RoadSegment[] = [BRIDGE_ROAD, ZONE_B_ROAD];

export const SHELTER_B: Shelter = {
  id: 'shelter-b',
  name: 'Shelter B',
  lat: 29.6847,
  lon: -95.4107,
  capacity: 200,
  status: 'standby',
};

export const SHELTERS: Shelter[] = [SHELTER_B];

// ---------- Events ----------

export const CALM_EVENTS: DemoEvent[] = [
  {
    id: 'evt-calm-1',
    type: 'road_closure',
    lat: 29.79,
    lon: -95.398,
    description: 'Tree down on Elm St',
    severity: 'low',
    timestamp: at(0),
  },
  {
    id: 'evt-calm-2',
    type: 'outage',
    lat: 29.72,
    lon: -95.43,
    description: 'Minor flicker in Zone C',
    severity: 'low',
    timestamp: at(2),
  },
  {
    id: 'evt-calm-3',
    type: 'weather',
    lat: 29.81,
    lon: -95.33,
    description: 'Light rain, northeast Houston',
    severity: 'low',
    timestamp: at(4),
  },
];

export const ESCALATION_EVENTS: DemoEvent[] = [
  {
    id: 'evt-outage-a',
    type: 'outage',
    lat: 29.7575,
    lon: -95.365,
    description: 'Power outage across Zone A (feeder trip)',
    severity: 'critical',
    zoneId: ZONE_A.id,
    timestamp: at(10),
  },
  {
    id: 'evt-closure-bridge',
    type: 'road_closure',
    lat: 29.7632,
    lon: -95.38,
    description: 'Flooding – Buffalo Bayou access bridge closed',
    severity: 'high',
    zoneId: ZONE_A.id,
    timestamp: at(11),
  },
  {
    id: 'evt-911-1',
    type: '911',
    lat: 29.756,
    lon: -95.362,
    description: '911: water rescue requested',
    severity: 'critical',
    zoneId: ZONE_A.id,
    timestamp: at(12),
  },
  {
    id: 'evt-911-2',
    type: '911',
    lat: 29.7525,
    lon: -95.368,
    description: '911: water rescue requested',
    severity: 'critical',
    zoneId: ZONE_A.id,
    timestamp: at(13),
  },
  {
    id: 'evt-911-3',
    type: '911',
    lat: 29.761,
    lon: -95.359,
    description: '911: water rescue, resident on home oxygen',
    severity: 'critical',
    zoneId: ZONE_A.id,
    timestamp: at(14),
  },
];

// ---------- Expected outputs ----------

export const ESCALATION_ENGINE_RESULT: EngineResult = {
  zoneId: ZONE_A.id,
  isolated: true,
  closedAccessRoadIds: [BRIDGE_ROAD.id],
  outageEventIds: ['evt-outage-a'],
  closureEventIds: ['evt-closure-bridge'],
  emergencyEventIds: ['evt-911-1', 'evt-911-2', 'evt-911-3'],
  dependentPatients: 340,
  avgBackupMinutes: 120,
  estimatedResponseMinutes: 75,
  isolationWindowMinutes: 45,
  candidateShelterIds: [SHELTER_B.id],
};

export const SAMPLE_ALERT: AlertCardData = {
  id: 'alert-zone-a-1',
  zoneId: ZONE_A.id,
  title: 'ZONE A ISOLATED: ACTION REQUIRED',
  points: [
    'Storm flooding the only access bridge to Zone A.',
    'Power outage active in this zone.',
    'Deterministic engine calculates 340 electricity-dependent patients here, with an average backup of just 2 hours.',
  ],
  isolationWindowMinutes: 45,
  proposedActions: [
    {
      id: 'act-shelter-b',
      type: 'activate_shelter',
      label: 'Activate Shelter B (Capacity: 200)',
      params: { shelterId: SHELTER_B.id },
    },
    {
      id: 'act-drone-zone-a',
      type: 'dispatch_drone',
      label: 'Dispatch Aerial Recon Drone to Zone A',
      params: { zoneId: ZONE_A.id },
    },
  ],
  relatedEventIds: ['evt-outage-a', 'evt-closure-bridge', 'evt-911-1', 'evt-911-2', 'evt-911-3'],
  status: 'pending',
  createdAt: at(15),
};
