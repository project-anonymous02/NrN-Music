import { create } from "zustand";
import { idbClear, idbGet, idbSet } from "../lib/db";
import type { PlayEvent } from "../lib/recommend";

export interface HistoryExport {
  app: "NrNMusic";
  kind: "history";
  version: number;
  plays: PlayEvent[];
  searches: string[];
}

const MAX_PLAYS = 600;
const MAX_SEARCHES = 40;

interface HistoryState {
  hydrated: boolean;
  plays: PlayEvent[];
  searches: string[];

  hydrate: () => Promise<void>;
  recordPlay: (event: PlayEvent) => void;
  recordSearch: (query: string) => void;
  clearSearches: () => void;
  removeSearch: (query: string) => void;
  clearPlays: () => void;
  exportData: () => string;
  importData: (raw: string) => { ok: boolean; reason?: string };
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useHistory = create<HistoryState>((set, get) => {
  const persist = () => {
    const state = get();
    const payload: HistoryExport = {
      app: "NrNMusic",
      kind: "history",
      version: 1,
      plays: state.plays,
      searches: state.searches,
    };
    void idbSet("history", "current", payload);
  };

  const schedule = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 180);
  };

  return {
    hydrated: false,
    plays: [],
    searches: [],

    hydrate: async () => {
      const stored = await idbGet<HistoryExport>("history", "current");
      set({
        plays: Array.isArray(stored?.plays) ? stored.plays.slice(0, MAX_PLAYS) : [],
        searches: Array.isArray(stored?.searches) ? stored.searches.slice(0, MAX_SEARCHES) : [],
        hydrated: true,
      });
    },

    recordPlay: (event) => {
      if (!event.trackId) return;
      set({ plays: [event, ...get().plays].slice(0, MAX_PLAYS) });
      schedule();
    },

    recordSearch: (query) => {
      const trimmed = query.trim();
      if (trimmed.length < 2) return;
      const next = [trimmed, ...get().searches.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase())];
      set({ searches: next.slice(0, MAX_SEARCHES) });
      schedule();
    },

    clearSearches: () => {
      set({ searches: [] });
      schedule();
    },

    removeSearch: (query) => {
      set({ searches: get().searches.filter((entry) => entry !== query) });
      schedule();
    },

    clearPlays: () => {
      set({ plays: [] });
      schedule();
    },

    exportData: () => JSON.stringify({ app: "NrNMusic", kind: "history", version: 1, ...get() }, null, 2),

    importData: (raw) => {
      try {
        const parsed = JSON.parse(raw) as Partial<HistoryExport>;
        if (parsed.app !== "NrNMusic" || parsed.kind !== "history") return { ok: false, reason: "invalid" };
        const plays = Array.isArray(parsed.plays)
          ? parsed.plays.filter((entry) => Boolean(entry && typeof entry.trackId === "string")).slice(0, MAX_PLAYS)
          : [];
        const searches = Array.isArray(parsed.searches)
          ? parsed.searches.filter((entry) => typeof entry === "string").slice(0, MAX_SEARCHES)
          : [];
        set({ plays, searches });
        schedule();
        return { ok: true };
      } catch {
        return { ok: false, reason: "parse" };
      }
    },
  };
});

export { idbClear as clearHistoryStore };
