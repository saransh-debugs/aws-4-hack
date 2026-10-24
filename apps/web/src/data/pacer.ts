/**
 * Live pacing for the demo. A simulate call returns all of a scenario's events at once; real
 * feeds don't. The pacer lets new events arrive one at a time, and holds an alert back until
 * the agent has had time to "investigate" after its last related event, so the dashboard reads
 * like a live operations feed:
 *
 *   event … event … event → "AI agent investigating Zone A" → alert slides in
 *
 * Removals (Reset, a new scenario) and updates to events or alerts already on screen apply at
 * once. The first snapshot (page load, sign-in) also shows at once. Tests run with no pacing.
 *
 * What is on screen lives in the store; the pacer reads it back each time, so anything that
 * sets the store directly (tests, Reset) stays consistent.
 */
import type { AlertCardData, DemoEvent } from '@gridrisk/shared';

export interface PacingOptions {
  /** Gap between arriving events (ms), shrunk for long bursts so a burst stays short. */
  eventGapMs: number;
  /** A whole burst never takes longer than this (ms). */
  maxBurstMs: number;
  /** Minimum time between an alert's last related event arriving and the alert showing (ms). */
  thinkMs: number;
}

export const DEMO_PACING: PacingOptions = { eventGapMs: 1400, maxBurstMs: 7000, thinkMs: 2600 };
export const NO_PACING: PacingOptions = { eventGapMs: 0, maxBurstMs: 0, thinkMs: 0 };

export interface Snapshot {
  events: DemoEvent[];
  alerts: AlertCardData[];
}

export interface PacerHost {
  /** What is on screen now. */
  current(): Snapshot;
  show(snapshot: Snapshot, arrivals: Record<string, number>): void;
  now?: () => number;
}

const byTime = (a: DemoEvent, b: DemoEvent) =>
  (a.timestamp ? Date.parse(a.timestamp) : 0) - (b.timestamp ? Date.parse(b.timestamp) : 0);

export class Pacer {
  private latest: Snapshot | null = null;
  private queue: DemoEvent[] = [];
  private arrivals: Record<string, number> = {};
  private eventTimer: ReturnType<typeof setTimeout> | undefined;
  private alertTimer: ReturnType<typeof setTimeout> | undefined;
  private gapMs = 0;

  constructor(
    private readonly host: PacerHost,
    private readonly opts: PacingOptions,
  ) {}

  private now(): number {
    return this.host.now?.() ?? Date.now();
  }

  /** Feed the latest data from the adapter. */
  ingest(snapshot: Snapshot): void {
    this.latest = snapshot;
    const shown = this.host.current();
    const shownIds = new Set(shown.events.map((e) => e.id));
    const queuedIds = new Set(this.queue.map((e) => e.id));
    const latestIds = new Set(snapshot.events.map((e) => e.id));

    // Gone from the source: drop from the queue too.
    this.queue = this.queue.filter((e) => latestIds.has(e.id));
    const fresh = snapshot.events
      .filter((e) => !shownIds.has(e.id) && !queuedIds.has(e.id))
      .sort(byTime);

    const firstLoad = shown.events.length === 0 && Object.keys(this.arrivals).length === 0;
    if (this.opts.eventGapMs === 0 || firstLoad) {
      const t = this.now();
      for (const e of [...this.queue, ...fresh]) this.arrivals[e.id] ??= firstLoad ? 0 : t;
      this.queue = [];
    } else if (fresh.length > 0) {
      this.queue.push(...fresh);
      this.gapMs = Math.min(this.opts.eventGapMs, this.opts.maxBurstMs / this.queue.length);
    }
    this.flush();
    this.schedule();
  }

  /** Stop timers (unmount). */
  dispose(): void {
    clearTimeout(this.eventTimer);
    clearTimeout(this.alertTimer);
    this.eventTimer = this.alertTimer = undefined;
  }

  /** Events that are still on their way. */
  get pending(): number {
    return this.queue.length;
  }

  private schedule(): void {
    if (this.queue.length > 0 && !this.eventTimer) {
      this.eventTimer = setTimeout(() => {
        this.eventTimer = undefined;
        const next = this.queue.shift();
        if (next) this.arrivals[next.id] = this.now();
        this.flush();
        this.schedule();
      }, this.gapMs);
    }
  }

  private flush(): void {
    if (!this.latest) return;
    const queued = new Set(this.queue.map((e) => e.id));
    const events = this.latest.events.filter((e) => !queued.has(e.id));
    const shownAlertIds = new Set(this.host.current().alerts.map((a) => a.id));
    const visibleIds = new Set(events.map((e) => e.id));
    const t = this.now();
    let wakeAt = Infinity;

    const alerts = this.latest.alerts.filter((a) => {
      if (shownAlertIds.has(a.id) || this.opts.thinkMs === 0) return true;
      if (!a.relatedEventIds.every((id) => visibleIds.has(id))) return false;
      const lastArrival = Math.max(0, ...a.relatedEventIds.map((id) => this.arrivals[id] ?? 0));
      const readyAt = lastArrival + this.opts.thinkMs;
      if (t >= readyAt) return true;
      wakeAt = Math.min(wakeAt, readyAt);
      return false;
    });

    // Forget arrivals of events that left (Reset), so a later scenario paces again.
    for (const id of Object.keys(this.arrivals)) {
      if (!this.latest.events.some((e) => e.id === id)) delete this.arrivals[id];
    }
    this.host.show({ events, alerts }, { ...this.arrivals });

    clearTimeout(this.alertTimer);
    this.alertTimer =
      wakeAt < Infinity
        ? setTimeout(() => {
            this.alertTimer = undefined;
            this.flush();
          }, wakeAt - t)
        : undefined;
  }
}
