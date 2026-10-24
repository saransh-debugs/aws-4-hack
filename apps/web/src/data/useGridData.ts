import { useCallback } from 'react';
import { useGridStore } from '../store';
import { useAdapter } from './AdapterContext';

/** Copies the adapter's current events and alerts into the store. */
export function useRefresh(): () => Promise<void> {
  const adapter = useAdapter();
  const setSnapshot = useGridStore((s) => s.setSnapshot);
  const setHealth = useGridStore((s) => s.setHealth);
  const setMapData = useGridStore((s) => s.setMapData);
  return useCallback(async () => {
    const [events, alerts, health, mapData] = await Promise.all([
      adapter.getEvents(),
      adapter.getAlerts(),
      adapter.getHealth?.() ?? Promise.resolve([]),
      adapter.getMapData?.() ?? Promise.resolve(null),
    ]);
    setSnapshot({ events, alerts });
    setHealth(health);
    if (mapData) setMapData(mapData);
  }, [adapter, setHealth, setMapData, setSnapshot]);
}
