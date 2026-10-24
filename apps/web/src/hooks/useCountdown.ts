import { useEffect, useState } from 'react';

/** Reads "now" in ms. Injectable so tests can drive it with fake timers. */
export type Clock = () => number;

const defaultClock: Clock = () => Date.now();

export interface Countdown {
  /** Whole seconds remaining, never below 0. */
  secondsLeft: number;
  /** "MM:SS", never below "00:00". */
  label: string;
  /** True once the window has elapsed. */
  expired: boolean;
}

/** Zero-padded "MM:SS" from a seconds value, clamped at "00:00". */
export function formatCountdown(secondsLeft: number): string {
  const safe = Math.max(0, Math.floor(secondsLeft));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Counts a `minutes` window down from a `startAt` instant, ticking once a second. The clock is
 * injectable for tests (defaults to `Date.now`). The remaining time never drops below 00:00.
 *
 * @param minutes window length in minutes (e.g. isolationWindowMinutes)
 * @param startAt start instant in ms (e.g. Date.parse(createdAt)); defaults to the first clock read
 * @param clock   injectable time source; defaults to Date.now
 */
export function useCountdown(
  minutes: number,
  startAt?: number,
  clock: Clock = defaultClock,
): Countdown {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [minutes, startAt]);

  const now = clock();
  const endAt = (startAt ?? now) + minutes * 60_000;
  const secondsLeft = Math.max(0, Math.round((endAt - now) / 1000));
  return { secondsLeft, label: formatCountdown(secondsLeft), expired: secondsLeft <= 0 };
}
