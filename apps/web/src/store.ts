import { create } from 'zustand';
import type { AlertCardData, DemoEvent } from '@gridrisk/shared';
import type { DataMode } from './data/DataAdapter';
import { parseDataMode } from './data/selectAdapter';

export interface GridState {
  events: DemoEvent[];
  alerts: AlertCardData[];
  /** Set by the feed and the map; the map flies to it. */
  selectedEventId: string | null;
  mode: DataMode;
  /** When each event arrived on screen (ms epoch; 0 = already there on load). */
  arrivals: Record<string, number>;
  setArrivals: (arrivals: Record<string, number>) => void;
  setSnapshot: (snapshot: { events: DemoEvent[]; alerts: AlertCardData[] }) => void;
  selectEvent: (id: string | null) => void;
  setMode: (mode: DataMode) => void;
}

export const useGridStore = create<GridState>()((set) => ({
  events: [],
  alerts: [],
  selectedEventId: null,
  arrivals: {},
  setArrivals: (arrivals) => set({ arrivals }),
  mode: parseDataMode(import.meta.env.VITE_DATA_MODE),
  setSnapshot: ({ events, alerts }) =>
    set((state) => ({
      events,
      alerts,
      // Drop a selection whose event is gone (for example after Reset).
      selectedEventId: events.some((e) => e.id === state.selectedEventId)
        ? state.selectedEventId
        : null,
    })),
  selectEvent: (id) => set({ selectedEventId: id }),
  setMode: (mode) => set({ mode }),
}));
