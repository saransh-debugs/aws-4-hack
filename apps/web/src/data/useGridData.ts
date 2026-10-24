import { useCallback } from 'react';
import { useGridStore } from '../store';
import { useAdapter } from './AdapterContext';
import { DEMO_PACING, NO_PACING, Pacer } from './pacer';

/** One pacer for the app: events trickle in and alerts wait for the agent (see ./pacer). */
export const pacer = new Pacer(
  {
    current: () => {
      const { events, alerts } = useGridStore.getState();
      return { events, alerts };
    },
    show: (snapshot, arrivals) => {
      const state = useGridStore.getState();
      state.setSnapshot(snapshot);
      state.setArrivals(arrivals);
    },
  },
  import.meta.env.MODE === 'test' ? NO_PACING : DEMO_PACING,
);

/** Loads the adapter's current events and alerts and hands them to the pacer. */
export function useRefresh(): () => Promise<void> {
  const adapter = useAdapter();
  return useCallback(async () => {
    const [events, alerts] = await Promise.all([adapter.getEvents(), adapter.getAlerts()]);
    pacer.ingest({ events, alerts });
  }, [adapter]);
}
