import { useCallback } from 'react';
import { useGridStore } from '../store';
import { useAdapter } from './AdapterContext';

/** Copies the adapter's current events, alerts, and map registry into the store. */
export function useRefresh(): () => Promise<void> {
  const adapter = useAdapter();
  const setSnapshot = useGridStore((s) => s.setSnapshot);
  return useCallback(async () => {
    const [events, alerts, mapData] = await Promise.all([
      adapter.getEvents(),
      adapter.getAlerts(),
      adapter.getMapData(),
    ]);
    setSnapshot({ events, alerts, ...mapData });
  }, [adapter, setSnapshot]);
}
