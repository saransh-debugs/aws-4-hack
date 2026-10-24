/**
 * Turns an alert's tool trace into a plain-English account with numbered sources, so an operator
 * (or a judge) can see how the agent reached the alert and where every number came from.
 *
 * Pure: no React. Template alerts have no trace; for them the same account is built from the
 * engine's result (the template uses exactly those numbers), and `source` says so.
 */
import type {
  AlertCardData,
  DemoEvent,
  EngineResult,
  RoadSegment,
  Shelter,
  ToolTraceEntry,
  Zone,
} from '@gridrisk/shared';

export interface Citation {
  /** 1-based number shown as [n]. */
  n: number;
  /** Where the fact comes from, e.g. "Event feed" or "HHS emPOWER". */
  origin: string;
  detail: string;
}

/** A sentence made of plain text, highlighted values and citation markers. */
export type Part =
  { kind: 'text'; text: string } | { kind: 'value'; text: string } | { kind: 'cite'; n: number[] };

export interface Step {
  title: string;
  parts: Part[];
  failed?: boolean;
}

export interface Explanation {
  source: 'agent' | 'engine';
  steps: Step[];
  /** The alert's own points, with a citation after each number we can trace. */
  points: Part[][];
  citations: Citation[];
}

export interface ExplainContext {
  zones: Zone[];
  roads: RoadSegment[];
  shelters: Shelter[];
  events: DemoEvent[];
}

const t = (text: string): Part => ({ kind: 'text', text });
const v = (text: string | number): Part => ({ kind: 'value', text: String(text) });
const cite = (...n: number[]): Part => ({ kind: 'cite', n: n.filter((x) => x > 0) });

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const strings = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [];
const num = (x: unknown): number | undefined => (typeof x === 'number' ? x : undefined);

const TOOL_TITLES: Record<string, string> = {
  get_active_events: 'Read the live event feed',
  correlate_zone: 'Linked events to the zone',
  check_isolation: 'Checked every road into the zone',
  get_dependent_patients: 'Counted patients who depend on power',
  find_shelters: 'Looked for a shelter outside the zone',
  compute_isolation_window: 'Worked out the time left',
};

const EVENT_NOUN: Record<DemoEvent['type'], string> = {
  outage: 'power outage',
  road_closure: 'road closure',
  weather: 'weather warning',
};

function hhmm(timestamp: string | undefined): string {
  if (!timestamp) return 'time unknown';
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? 'time unknown' : `${new Date(ms).toISOString().slice(11, 16)} UTC`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** Builds the citation list as steps reference facts, numbering each fact once. */
class Sources {
  readonly list: Citation[] = [];
  private readonly keys = new Map<string, number>();
  add(key: string, origin: string, detail: string): number {
    const found = this.keys.get(key);
    if (found) return found;
    const n = this.list.length + 1;
    this.list.push({ n, origin, detail });
    this.keys.set(key, n);
    return n;
  }
}

/** The engine's result as the trace the agent would have produced (for template alerts). */
export function traceFromEngine(result: EngineResult, events: DemoEvent[], shelters: Shelter[]) {
  const zoneId = result.zoneId;
  return [
    {
      tool: 'get_active_events',
      input: { zoneId },
      output: { events: events.filter((e) => e.zoneId === zoneId) },
    },
    {
      tool: 'correlate_zone',
      input: { zoneId },
      output: {
        outageEventIds: result.outageEventIds,
        closureEventIds: result.closureEventIds,
        emergencyEventIds: result.emergencyEventIds,
      },
    },
    {
      tool: 'check_isolation',
      input: { zoneId },
      output: { isolated: result.isolated, closedAccessRoadIds: result.closedAccessRoadIds },
    },
    {
      tool: 'get_dependent_patients',
      input: { zoneId },
      output: { dependentPatients: result.dependentPatients },
    },
    {
      tool: 'find_shelters',
      input: { zoneId },
      output: { shelters: shelters.filter((s) => result.candidateShelterIds.includes(s.id)) },
    },
    {
      tool: 'compute_isolation_window',
      input: { zoneId },
      output: {
        avgBackupMinutes: result.avgBackupMinutes,
        estimatedResponseMinutes: result.estimatedResponseMinutes,
        isolationWindowMinutes: result.isolationWindowMinutes,
      },
    },
  ] satisfies ToolTraceEntry[];
}

export function explainTrace(
  alert: AlertCardData,
  ctx: ExplainContext,
  fallback?: EngineResult,
): Explanation {
  const zone = ctx.zones.find((z) => z.id === alert.zoneId);
  const zoneName = zone?.name ?? alert.zoneId;
  const trace =
    alert.toolTrace && alert.toolTrace.length > 0
      ? alert.toolTrace
      : fallback
        ? traceFromEngine(fallback, ctx.events, ctx.shelters)
        : [];
  const sources = new Sources();
  const byId = new Map(ctx.events.map((e) => [e.id, e]));
  /** Value (as written in the alert) -> the citation that backs it. */
  const valueCites = new Map<string, number[]>();
  const back = (value: number | string, ...n: number[]) =>
    valueCites.set(String(value), [...(valueCites.get(String(value)) ?? []), ...n]);

  const eventCite = (id: string): number => {
    const e = byId.get(id);
    return e
      ? sources.add(
          `event:${id}`,
          'Event feed',
          `${e.description} (${e.severity}, ${hhmm(e.timestamp)})`,
        )
      : sources.add(`event:${id}`, 'Event feed', `Event ${id}`);
  };

  const steps: Step[] = trace.map((entry): Step => {
    const title = TOOL_TITLES[entry.tool] ?? `Ran ${entry.tool.replaceAll('_', ' ')}`;
    const out = isRecord(entry.output) ? entry.output : {};
    if (typeof out.error === 'string') {
      return {
        title,
        failed: true,
        parts: [t(`This check failed (${out.error}). The agent carried on without it.`)],
      };
    }

    switch (entry.tool) {
      case 'get_active_events': {
        const events = Array.isArray(out.events) ? (out.events as DemoEvent[]) : [];
        const serious = events.filter((e) => e.severity !== 'low');
        const n = serious.map((e) => eventCite(e.id));
        return {
          title,
          parts: [
            t(`${events.length} ${plural(events.length, 'event')} reported in ${zoneName}`),
            ...(serious.length > 0
              ? [
                  t(', including '),
                  v(
                    list(
                      serious.map(
                        (e) =>
                          `a ${e.severity === 'high' ? 'high-severity' : e.severity} ${EVENT_NOUN[e.type]}`,
                      ),
                    ),
                  ),
                  cite(...n),
                  t('.'),
                ]
              : [t('.')]),
          ],
        };
      }
      case 'correlate_zone': {
        const outages = strings(out.outageEventIds);
        const closures = strings(out.closureEventIds);
        const cites = [...outages, ...closures].map(eventCite);
        back(outages.length, ...outages.map(eventCite));
        back(closures.length, ...closures.map(eventCite));
        return {
          title,
          parts: [
            t('Matched '),
            v(`${outages.length} power ${plural(outages.length, 'outage')}`),
            t(' and '),
            v(`${closures.length} road ${plural(closures.length, 'closure')}`),
            t(` to ${zoneName}`),
            cite(...cites),
            t('.'),
          ],
        };
      }
      case 'check_isolation': {
        const closedIds = strings(out.closedAccessRoadIds);
        const accessIds = zone?.accessRoadIds ?? closedIds;
        const name = (id: string) => ctx.roads.find((r) => r.id === id)?.name ?? 'an access road';
        const roadCites = closedIds.map((id) => {
          const closure = ctx.events.find(
            (e) => e.type === 'road_closure' && e.zoneId === alert.zoneId && e.severity !== 'low',
          );
          return sources.add(
            `road:${id}`,
            'Road network',
            `${name(id)}: access road into ${zoneName}${closure ? `, closed by "${closure.description}"` : ', closed'}`,
          );
        });
        const isolated = out.isolated === true;
        back(accessIds.length, ...roadCites);
        return {
          title,
          parts: isolated
            ? [
                v(list(closedIds.map(name))),
                t(` is closed`),
                cite(...roadCites),
                t('. '),
                t(
                  accessIds.length === 1
                    ? 'It is the only road in, so '
                    : 'Those are all the roads in, so ',
                ),
                v(`${zoneName} is cut off`),
                t('.'),
              ]
            : [
                t(
                  `${accessIds.length - closedIds.length} of ${accessIds.length} access ${plural(accessIds.length, 'road')} still open, so `,
                ),
                v(`${zoneName} is not cut off`),
                t('.'),
              ],
        };
      }
      case 'get_dependent_patients': {
        const patients = num(out.dependentPatients) ?? 0;
        const zips = zone?.zips ?? [];
        const n = sources.add(
          'empower',
          'HHS emPOWER',
          `Medicare beneficiaries who rely on electricity-dependent medical equipment, ZIP ${list(zips)}`,
        );
        back(patients, n);
        return {
          title,
          parts: [
            v(`${patients} people`),
            t(` in ${zoneName} rely on powered medical equipment`),
            cite(n),
            t('.'),
          ],
        };
      }
      case 'find_shelters': {
        const shelters = Array.isArray(out.shelters) ? (out.shelters as Shelter[]) : [];
        if (shelters.length === 0)
          return { title, parts: [t('No shelter with room was found outside the zone.')] };
        const best = shelters[0]!;
        const n = sources.add(
          `shelter:${best.id}`,
          'Shelter registry',
          `${best.name}: capacity ${best.capacity}, status ${best.status}`,
        );
        back(best.capacity, n);
        return {
          title,
          parts: [
            v(best.name),
            t(' is outside the zone with room for '),
            v(best.capacity),
            cite(n),
            t(', the nearest option.'),
          ],
        };
      }
      case 'compute_isolation_window': {
        const backup = num(out.avgBackupMinutes);
        const response = num(out.estimatedResponseMinutes);
        const window = num(out.isolationWindowMinutes);
        const nb = sources.add(
          'assume:backup',
          'Planning assumption',
          `Home medical device batteries last about ${backup} minutes on average`,
        );
        const nr = sources.add(
          'assume:response',
          'Planning assumption',
          `Help takes about ${response} minutes to reach a cut-off zone`,
        );
        if (backup !== undefined) {
          back(backup, nb);
          if (backup % 60 === 0) back(backup / 60, nb);
        }
        if (response !== undefined) back(response, nr);
        if (window !== undefined) {
          back(window, nb, nr);
          if (window % 60 === 0 && window > 0) back(window / 60, nb, nr);
        }
        return {
          title,
          parts: [
            t('Backup power lasts about '),
            v(`${backup} min`),
            cite(nb),
            t(' and help needs about '),
            v(`${response} min`),
            cite(nr),
            t(' to arrive, which leaves '),
            v(`${window} minutes`),
            t(' to act.'),
          ],
        };
      }
      default:
        return { title, parts: [t('Ran an extra check.')] };
    }
  });

  // Cite each number in the alert's own points.
  const points = alert.points.map((point): Part[] => {
    const parts: Part[] = [];
    let last = 0;
    for (const m of point.matchAll(/\d+(?:\.\d+)?/g)) {
      const n = valueCites.get(m[0]);
      if (!n) continue;
      const end = m.index + m[0].length;
      parts.push(t(point.slice(last, m.index)), v(m[0]), cite(...new Set(n)));
      last = end;
    }
    parts.push(t(point.slice(last)));
    return parts.filter((p) => p.kind !== 'text' || p.text.length > 0);
  });

  return {
    source: alert.toolTrace && alert.toolTrace.length > 0 ? 'agent' : 'engine',
    steps,
    points,
    citations: sources.list,
  };
}
