import { useCallback } from 'react';
import { useGridStore } from '../store';
import { useAdapter } from './AdapterContext';

/** Copies the adapter's current events and alerts into the store. */
export function useRefresh(): () => Promise<void> {
  const adapter = useAdapter();
  const setSnapshot = useGridStore((s) => s.setSnapshot);
  const setHealth = useGridStore((s) => s.setHealth);
  return useCallback(async () => {
    const [events, alerts, health] = await Promise.all([
      adapter.getEvents(),
      adapter.getAlerts(),
      adapter.getHealth?.() ?? Promise.resolve([]),
    ]);
    setSnapshot({ events, alerts });
    setHealth(health);
  }, [adapter, setHealth, setSnapshot]);
}
