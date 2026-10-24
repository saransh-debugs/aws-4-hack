import { useCallback } from 'react';
import { useGridStore } from '../store';
import { useAdapter } from './AdapterContext';

/** Copies the adapter's current events and alerts into the store. */
export function useRefresh(): () => Promise<void> {
  const adapter = useAdapter();
  const setSnapshot = useGridStore((s) => s.setSnapshot);
  return useCallback(async () => {
    const [events, alerts] = await Promise.all([adapter.getEvents(), adapter.getAlerts()]);
    setSnapshot({ events, alerts });
  }, [adapter, setSnapshot]);
}
