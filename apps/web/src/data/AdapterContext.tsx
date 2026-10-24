import { createContext, useContext } from 'react';
import type { DataAdapter } from './DataAdapter';

const AdapterContext = createContext<DataAdapter | null>(null);

export const AdapterProvider = AdapterContext.Provider;

export function useAdapter(): DataAdapter {
  const adapter = useContext(AdapterContext);
  if (!adapter) throw new Error('useAdapter must be used inside <AdapterProvider>');
  return adapter;
}
