import type { DemoEvent, ScenarioName } from '@gridrisk/shared';
import { CALM_EVENTS, ESCALATION_EVENTS, ZONE_B } from '@gridrisk/shared/fixtures';

/**
 * Handoff H2. Returns a fresh copy of the events for a scenario, so callers may mutate freely.
 * "Reset" is simply buildScenario('calm').
 *
 * Demo story, in order (each one replaces the previous scenario's events):
 *   calm        3 low background events                                  -> no alert
 *   partial     Zone A loses power, but the bridge is still open          -> no alert
 *   escalation  ...and the bridge floods: Zone A is cut off               -> Zone A alert
 *   reopened    the water recedes and the bridge reopens                  -> no alert
 *   zone-b      Zone B loses power and its evacuation route floods        -> Zone B alert
 *   multi-zone  both zones cut off at once                                -> 2 alerts
 *   storm       a noisy storm feed (warnings, outages and closures that
 *               don't matter) hiding the one isolation that does         -> Zone A alert only
 */
export const SCENARIO_NAMES = [
  'calm',
  'partial',
  'escalation',
  'reopened',
  'zone-b',
  'multi-zone',
  'storm',
] as const satisfies readonly ScenarioName[];

/** Fixed base time, same as the shared fixtures, so scenarios are deterministic. */
const T0 = Date.parse('2026-10-23T14:00:00.000Z');
const at = (minutesAfterT0: number): string => new Date(T0 + minutesAfterT0 * 60_000).toISOString();

const [OUTAGE_A, CLOSURE_BRIDGE] = ESCALATION_EVENTS as [DemoEvent, DemoEvent];

/** The flooded bridge after the water recedes: still reported, but no longer blocking. */
const BRIDGE_REOPENED: DemoEvent = {
  ...CLOSURE_BRIDGE,
  description: 'Buffalo Bayou access bridge reopened – water receded',
  severity: 'low',
  timestamp: at(16),
};

/** Zone B (Third Ward, ZIP 77004): substation trip plus a flooded evacuation route. */
export const ZONE_B_EVENTS: DemoEvent[] = [
  {
    id: 'evt-outage-b',
    type: 'outage',
    lat: 29.7525,
    lon: -95.333,
    description: 'Power outage across Zone B (substation trip)',
    severity: 'critical',
    zoneId: ZONE_B.id,
    timestamp: at(12),
  },
  {
    id: 'evt-closure-main-st',
    type: 'road_closure',
    lat: 29.7502,
    lon: -95.338,
    description: 'Flooding – Main Street evacuation route impassable',
    severity: 'high',
    zoneId: ZONE_B.id,
    timestamp: at(13),
  },
];

/**
 * Storm noise: real-looking events that must NOT raise an alert on their own. They are outside
 * the zones, not on an access road, weather-only, or an outage with every road still open.
 */
export const STORM_NOISE_EVENTS: DemoEvent[] = [
  {
    id: 'evt-nws-flash-flood',
    type: 'weather',
    lat: 29.76,
    lon: -95.37,
    description: 'NWS: Flash Flood Warning for Harris County until 6 PM',
    severity: 'high',
    timestamp: at(5),
  },
  {
    id: 'evt-nws-tstorm',
    type: 'weather',
    lat: 29.83,
    lon: -95.42,
    description: 'NWS: Severe Thunderstorm Warning, northwest Houston',
    severity: 'high',
    timestamp: at(6),
  },
  {
    id: 'evt-outage-heights',
    type: 'outage',
    lat: 29.795,
    lon: -95.4,
    description: 'Outage in the Heights, about 1,200 customers',
    severity: 'high',
    timestamp: at(7),
  },
  {
    id: 'evt-closure-i45',
    type: 'road_closure',
    lat: 29.805,
    lon: -95.36,
    description: 'High water on the I-45 frontage road (not an access route)',
    severity: 'high',
    timestamp: at(8),
  },
  {
    id: 'evt-outage-b-partial',
    type: 'outage',
    lat: 29.758,
    lon: -95.327,
    description: 'Scattered outages in Zone B (evacuation route still open)',
    severity: 'high',
    zoneId: ZONE_B.id,
    timestamp: at(9),
  },
  {
    id: 'evt-closure-westheimer',
    type: 'road_closure',
    lat: 29.737,
    lon: -95.43,
    description: 'Westheimer Rd underpass flooded',
    severity: 'high',
    timestamp: at(12),
  },
  {
    id: 'evt-nws-rain',
    type: 'weather',
    lat: 29.7,
    lon: -95.3,
    description: 'NWS: 2–3 in/hr rainfall rates, southeast Houston',
    severity: 'low',
    timestamp: at(14),
  },
];

export function buildScenario(name: ScenarioName): DemoEvent[] {
  switch (name) {
    case 'calm':
      return structuredClone(CALM_EVENTS);
    case 'partial':
      return structuredClone([...CALM_EVENTS, OUTAGE_A]);
    case 'escalation':
      return structuredClone([...CALM_EVENTS, ...ESCALATION_EVENTS]);
    case 'reopened':
      return structuredClone([...CALM_EVENTS, OUTAGE_A, BRIDGE_REOPENED]);
    case 'zone-b':
      return structuredClone([...CALM_EVENTS, ...ZONE_B_EVENTS]);
    case 'multi-zone':
      return structuredClone([...CALM_EVENTS, ...ESCALATION_EVENTS, ...ZONE_B_EVENTS]);
    case 'storm':
      return structuredClone([...CALM_EVENTS, ...STORM_NOISE_EVENTS, ...ESCALATION_EVENTS]);
  }
}

/** Scenario helpers kept explicit so tests and demos can build variants without mutating fixtures. */
export const buildPartialScenario = (): DemoEvent[] => buildScenario('partial');
export const buildReopenedScenario = (): DemoEvent[] => buildScenario('reopened');
