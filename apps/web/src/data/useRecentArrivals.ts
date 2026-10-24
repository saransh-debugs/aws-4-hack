import { useEffect, useMemo, useState } from 'react';
import { useGridStore } from '../store';

/** How long an event counts as new after it arrives (ms). */
export const NEW_FOR_MS = 8_000;

/** Ids of events that arrived in the last NEW_FOR_MS; re-evaluates once a second while any are new. */
export function useRecentArrivals(): ReadonlySet<string> {
  const arrivals = useGridStore((s) => s.arrivals);
  const [now, setNow] = useState(() => Date.now());

  const anyRecent = Object.values(arrivals).some((t) => t > 0 && now - t < NEW_FOR_MS);
  useEffect(() => {
    setNow(Date.now());
  }, [arrivals]);
  useEffect(() => {
    if (!anyRecent) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyRecent]);

  return useMemo(
    () =>
      new Set(
        Object.entries(arrivals)
          .filter(([, t]) => t > 0 && now - t < NEW_FOR_MS)
          .map(([id]) => id),
      ),
    [arrivals, now],
  );
}
