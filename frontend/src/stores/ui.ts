import { create } from "zustand";
import type { Track } from "../types";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
}

export interface MenuTarget {
  track: Track;
  /** Optional context so the menu can offer album/artist actions. */
  albumId?: string | null;
  artistId?: string | null;
  playlistId?: string | null;
}

interface UiState {
  toasts: Toast[];
  menu: MenuTarget | null;
  queueOpen: boolean;
  playlistPicker: Track | null;
  detailsTrack: Track | null;
  announce: string | null;

  toast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
  openMenu: (target: MenuTarget) => void;
  closeMenu: () => void;
  setQueueOpen: (open: boolean) => void;
  setPlaylistPicker: (track: Track | null) => void;
  setDetailsTrack: (track: Track | null) => void;
  announceText: (text: string) => void;
}

let toastId = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  menu: null,
  queueOpen: false,
  playlistPicker: null,
  detailsTrack: null,
  announce: null,

  toast: (text, tone = "info") => {
    const id = (toastId += 1);
    set({ toasts: [...get().toasts, { id, text, tone }] });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toasts: get().toasts.filter((entry) => entry.id !== id) }), 3200);
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((entry) => entry.id !== id) }),

  openMenu: (target) => set({ menu: target }),
  closeMenu: () => set({ menu: null }),
  setQueueOpen: (open) => set({ queueOpen: open }),
  setPlaylistPicker: (track) => set({ playlistPicker: track }),
  setDetailsTrack: (track) => set({ detailsTrack: track }),
  announceText: (text) => set({ announce: text }),
}));
