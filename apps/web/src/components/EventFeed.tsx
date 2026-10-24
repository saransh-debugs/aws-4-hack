/**
 * Task 4 – EventFeed (author: Saransh, owner/reviewer: Bushra).
 *
 * Controlled component: the parent owns `selectedEventId` (the Zustand store from Task 2) and
 * does the map fly-to in `onSelect`. Newest first; severity is shown by color *and* by an icon
 * plus text, so color is never the only signal. Low severity is deliberately muted so critical
 * rows stand out. Items are native buttons, so Tab reaches them and Enter/Space selects them.
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  CloudRain,
  Construction,
  Info,
  OctagonAlert,
  Phone,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { DemoEvent, EventType, Severity } from '@gridrisk/shared';

export interface EventFeedProps {
  events: DemoEvent[];
  selectedEventId?: string | null;
  onSelect: (event: DemoEvent) => void;
}

/** Newest first. Events without a timestamp go last; ties put the later-received event first. */
export function sortEventsNewestFirst(events: DemoEvent[]): DemoEvent[] {
  const time = (e: DemoEvent) => (e.timestamp ? Date.parse(e.timestamp) : -Infinity);
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => time(b.event) - time(a.event) || b.index - a.index)
    .map(({ event }) => event);
}

interface SeverityStyle {
  label: string;
  icon: LucideIcon;
  /** Marker class on the row (used by tests and future styling hooks). */
  className: string;
  /** Badge colors. Text colors meet WCAG AA on slate-900. */
  badge: string;
  /** Color of the event-type icon. */
  iconColor: string;
}

export const SEVERITY_STYLES: Record<Severity, SeverityStyle> = {
  critical: {
    label: 'Critical',
    icon: OctagonAlert,
    className: 'severity-critical',
    badge: 'bg-red-500/10 text-red-300 ring-red-500/40',
    iconColor: 'text-red-400',
  },
  high: {
    label: 'High',
    icon: TriangleAlert,
    className: 'severity-high',
    badge: 'bg-amber-500/10 text-amber-300 ring-amber-500/40',
    iconColor: 'text-amber-300',
  },
  low: {
    label: 'Low',
    icon: Info,
    className: 'severity-low',
    badge: 'bg-slate-500/10 text-slate-300 ring-slate-500/30',
    iconColor: 'text-slate-400',
  },
};

export function severityClass(severity: Severity): string {
  return SEVERITY_STYLES[severity].className;
}

const TYPE_STYLES: Record<EventType, { label: string; icon: LucideIcon }> = {
  outage: { label: 'Outage', icon: Zap },
  road_closure: { label: 'Road closure', icon: Construction },
  '911': { label: '911 call', icon: Phone },
  weather: { label: 'Weather', icon: CloudRain },
};

/** "14:10:00Z" (UTC, so the demo reads the same everywhere), or "--:--:--" without a timestamp. */
export function formatEventTime(timestamp: string | undefined): string {
  if (!timestamp) return '--:--:--';
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? '--:--:--' : `${new Date(ms).toISOString().slice(11, 19)}Z`;
}

export function EventFeed({ events, selectedEventId, onSelect }: EventFeedProps) {
  const reduceMotion = useReducedMotion();
  const sorted = sortEventsNewestFirst(events);
  const criticalCount = events.filter((e) => e.severity === 'critical').length;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-slate-300 uppercase">
          Events
          <span className="ml-2 rounded-sm bg-slate-800 px-1.5 py-px font-mono text-[11px] font-medium tracking-normal text-slate-200 tabular-nums">
            {events.length}
          </span>
        </h2>
        {criticalCount > 0 && (
          <span className="font-mono text-[11px] text-red-300 tabular-nums">
            {criticalCount} critical
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-700 px-3 py-6 text-center text-[13px] text-slate-400">
          No active events.
        </p>
      ) : (
        <ol
          aria-label="Events, newest first"
          className="min-h-0 divide-y divide-slate-800 overflow-y-auto rounded-md border border-slate-800 bg-slate-900"
        >
          <AnimatePresence initial={false}>
            {sorted.map((event) => {
              const severity = SEVERITY_STYLES[event.severity];
              const type = TYPE_STYLES[event.type];
              const SeverityIcon = severity.icon;
              const TypeIcon = type.icon;
              const selected = event.id === selectedEventId;
              return (
                <motion.li
                  key={event.id}
                  layout={!reduceMotion}
                  initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.15 } }}
                  transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(event)}
                    className={`relative block w-full px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400 ${
                      selected ? 'bg-slate-800' : 'hover:bg-slate-800/50'
                    } ${severity.className}`}
                  >
                    {selected && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-0.5 bg-sky-400"
                      />
                    )}
                    <span className="flex items-start gap-2">
                      <TypeIcon
                        aria-hidden="true"
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${severity.iconColor}`}
                        strokeWidth={2.25}
                      />
                      <span className="text-[13px] leading-snug font-medium text-slate-100">
                        <span className="sr-only">{type.label}: </span>
                        {event.description}
                      </span>
                    </span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-px text-[10px] font-semibold tracking-wider uppercase ring-1 ring-inset ${severity.badge}`}
                      >
                        <SeverityIcon aria-hidden="true" className="h-3 w-3" strokeWidth={2.25} />
                        {severity.label}
                      </span>
                      <span
                        title={event.id}
                        className="min-w-0 truncate font-mono text-[11px] text-slate-400"
                      >
                        {event.id}
                      </span>
                      <time
                        dateTime={event.timestamp}
                        className="ml-auto shrink-0 font-mono text-[11px] text-slate-400 tabular-nums"
                      >
                        {formatEventTime(event.timestamp)}
                      </time>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}
