import { create } from 'zustand';
import type {
  AlertCardData,
  DemoEvent,
  MapData,
  RoadSegment,
  Shelter,
  SourceHealth,
  Zone,
} from '@gridrisk/shared';
import { ROADS, SHELTERS, ZONES } from '@gridrisk/shared/fixtures';
import type { DataMode } from './data/DataAdapter';
import { parseDataMode } from './data/selectAdapter';

export interface GridState {
  events: DemoEvent[];
  alerts: AlertCardData[];
  health: SourceHealth[];
  zones: Zone[];
  roads: RoadSegment[];
  shelters: Shelter[];
  /** Set by the feed and the map; the map flies to it. */
  selectedEventId: string | null;
  mode: DataMode;
  setSnapshot: (snapshot: { events: DemoEvent[]; alerts: AlertCardData[] }) => void;
  setHealth: (health: SourceHealth[]) => void;
  setMapData: (mapData: MapData) => void;
  selectEvent: (id: string | null) => void;
  setMode: (mode: DataMode) => void;
}

export const useGridStore = create<GridState>()((set) => ({
  events: [],
  alerts: [],
  health: [],
  zones: ZONES,
  roads: ROADS,
  shelters: SHELTERS,
  selectedEventId: null,
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
  setHealth: (health) => set({ health }),
  setMapData: (mapData) =>
    set({ zones: mapData.zones, roads: mapData.roads, shelters: mapData.shelters }),
  setMode: (mode) => set({ mode }),
}));
