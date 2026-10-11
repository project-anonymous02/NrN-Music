import { create } from "zustand";
import { audioEngine, type EngineState } from "../lib/audio";
import { api, ApiError } from "../lib/api";
import { idbGet, idbSet } from "../lib/db";
import { localObjectUrl } from "../lib/localMusic";
import {
  append,
  appendMany,
  clearQueue,
  currentTrack,
  insertNext,
  moveItem,
  playTracks,
  removeAt,
  stepBackward,
  stepForward,
  toggleShuffle,
  type QueueState,
} from "../lib/queue";
import type { Lyrics, RepeatMode, Track } from "../types";
import { useSettings } from "./settings";
import { useLibrary } from "./library";
import { useHistory } from "./history";

export type PlayerStatus = EngineState;

export interface SleepTimer {
  remainingMs: number;
  endsAt: number;
}

interface PlayerState {
  queue: QueueState;
  status: PlayerStatus;
  position: number;
  duration: number;
  error: string | null;
  fullOpen: boolean;
  loadingQueue: boolean;
  sleepTimer: SleepTimer | null;
  lyrics: { data: Lyrics | null; loading: boolean; error: string | null };

  init: () => void;
  restoreQueue: (queue: QueueState) => void;
  playList: (tracks: Track[], index?: number, shuffle?: boolean) => void;
  playTrackInContext: (track: Track, context: Track[]) => void;
  toggle: () => void;
  next: (auto?: boolean) => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setShuffle: (on?: boolean) => void;
  cycleRepeat: () => void;
  setRepeat: (mode: RepeatMode) => void;
  enqueue: (track: Track) => void;
  enqueueNext: (track: Track) => void;
  enqueueMany: (tracks: Track[]) => void;
  dequeue: (index: number) => void;
  moveQueueItem: (from: number, to: number) => void;
  clear: () => void;
  openFull: () => void;
  closeFull: () => void;
  loadLyrics: (force?: boolean) => Promise<void>;
  setSleepTimer: (minutes: number) => void;
  cancelSleepTimer: () => void;
}

const QUEUE_KEY = "current";

let initialized = false;
let objectUrl: string | null = null;
let listen = { trackId: "", listenedMs: 0, lastTick: 0, completed: false, source: "search" };
let sleepHandle: ReturnType<typeof setTimeout> | undefined;

function qualityParam(): string {
  const quality = useSettings.getState().settings.playback.quality;
  if (quality === "high") return "m4a";
  if (quality === "compat") return "opus";
  return "auto";
}

function streamUrlFor(track: Track): string {
  return `/api/stream/${encodeURIComponent(track.id)}?ext=${qualityParam()}`;
}

/** Local imports play straight from IndexedDB blobs; streamed tracks go through the proxy. */
async function resolveTrackUrl(track: Track): Promise<string> {
  if (track.source !== "local") return streamUrlFor(track);
  const url = await localObjectUrl(track.id);
  if (!url) throw new Error("Local file is missing from storage.");
  return url;
}

export const usePlayer = create<PlayerState>((set, get) => {
  const finalizePlay = (completed: boolean, skipped: boolean) => {
    const track = get().queue.tracks[get().queue.index];
    if (!track || listen.trackId !== track.id) return;
    const durationMs = (get().duration || track.duration || 0) * 1000;
    if (listen.listenedMs < 900 && !completed) return;
    const event = {
      trackId: track.id,
      title: track.title,
      artists: track.artists.map((artist) => artist.name),
      album: track.album?.name ?? null,
      durationMs,
      listenedMs: Math.round(listen.listenedMs),
      completed,
      skipped,
      liked: useLibrary.getState().isLiked(track.id),
      ts: Date.now(),
      source: listen.source,
      track,
    };
    useHistory.getState().recordPlay(event);
    if (completed) useLibrary.getState().markCached(track.id);
    listen = { ...listen, listenedMs: 0, lastTick: Date.now(), completed };
  };

  const startTrack = (index: number, source?: string) => {
    const state = get();
    const track = state.queue.tracks[index];
    if (!track) return;

    finalizePlay(false, true);
    listen = { trackId: track.id, listenedMs: 0, lastTick: Date.now(), completed: false, source: source ?? listen.source };

    set({
      queue: { ...state.queue, index },
      status: "loading",
      position: 0,
      duration: track.duration ?? 0,
      error: null,
      lyrics: { data: null, loading: false, error: null },
    });
    void idbSet("queue", QUEUE_KEY, { ...get().queue, index });

    const rate = useSettings.getState().settings.playback.speed;
    void resolveTrackUrl(track)
      .then((url) => {
        if (currentTrack(get().queue)?.id !== track.id) return;
        if (objectUrl && objectUrl !== url) URL.revokeObjectURL(objectUrl);
        objectUrl = track.source === "local" ? url : null;
        audioEngine.load(url, { play: true, rate });
        audioEngine.syncMediaSession(track);
      })
      .catch((cause: unknown) => {
        set({ status: "error", error: cause instanceof Error ? cause.message : "Playback failed" });
      });
  };

  const advance = (auto: boolean) => {
    const queue = get().queue;
    const result = stepForward(queue, { autoAdvance: auto });
    if (result.ended) {
      finalizePlay(true, false);
      set({ status: "paused", position: 0 });
      return;
    }
    if (result.index !== queue.index) {
      startTrack(result.index, auto ? "radio" : listen.source);
      if (auto && useSettings.getState().settings.playback.autoplay) void appendFromRadio();
    }
  };

  const appendFromRadio = async () => {
    const track = currentTrack(get().queue);
    if (!track || get().loadingQueue) return;
    set({ loadingQueue: true });
    try {
      const context = await api.watch(track.id);
      const known = new Set(get().queue.tracks.map((entry) => entry.id));
      const fresh = context.tracks.filter((entry) => entry.id !== track.id && !known.has(entry.id));
      if (fresh.length) {
        set({ queue: appendMany(get().queue, fresh.slice(0, 12)) });
        void idbSet("queue", QUEUE_KEY, get().queue);
      }
    } catch {
      /* radio is a bonus; silence is acceptable */
    } finally {
      set({ loadingQueue: false });
    }
  };

  return {
    queue: { tracks: [], index: -1, shuffle: false, repeat: "off", order: [] },
    status: "idle",
    position: 0,
    duration: 0,
    error: null,
    fullOpen: false,
    loadingQueue: false,
    sleepTimer: null,
    lyrics: { data: null, loading: false, error: null },

    init: () => {
      if (initialized) return;
      initialized = true;

      audioEngine.on((event) => {
        if (event.type === "state") {
          if (event.state === "error") {
            const track = currentTrack(get().queue);
            set({ status: "error", error: track ? `Could not play “${track.title}”.` : "Playback failed" });
            return;
          }
          if (event.state === "ended") {
            advance(true);
            return;
          }
          if (event.state === "playing" && listen.lastTick === 0) listen.lastTick = Date.now();
          set({ status: event.state });
        } else if (event.type === "time") {
          const now = Date.now();
          if (get().status === "playing" && listen.trackId) {
            listen.listenedMs += Math.min(4000, now - (listen.lastTick || now));
          }
          listen.lastTick = now;
          if (event.duration > 0 && Math.abs(event.duration - get().duration) > 0.4) {
            set({ position: event.position, duration: event.duration });
          } else {
            set({ position: event.position });
          }
          audioEngine.setPositionState(event.position, event.duration);
        } else if (event.type === "duration") {
          set({ duration: event.duration });
        }
      });

      audioEngine.setActions({
        onPlay: () => audioEngine.play(),
        onPause: () => audioEngine.pause(),
        onNext: () => get().next(false),
        onPrevious: () => get().previous(),
        onSeek: (position) => get().seek(position),
        onStop: () => audioEngine.pause(),
      });

      const settings = useSettings.getState().settings;
      if (settings.playback.resumeSession) {
        void idbGet<QueueState>("queue", QUEUE_KEY).then((stored) => {
          if (stored && stored.tracks?.length && stored.index >= 0) {
            set({ queue: { ...stored, shuffle: stored.shuffle ?? false, repeat: stored.repeat ?? "off" } });
          }
        });
      }
    },

    restoreQueue: (queue) => {
      audioEngine.stop();
      const restored: QueueState = {
        tracks: queue.tracks,
        index: queue.index,
        shuffle: queue.shuffle,
        repeat: queue.repeat,
        order: queue.shuffle ? queue.order : [],
      };
      set({
        queue: restored,
        status: "idle",
        position: 0,
        duration: 0,
        error: null,
        lyrics: { data: null, loading: false, error: null },
      });
      void idbSet("queue", QUEUE_KEY, restored);
    },

    playList: (tracks, index = 0, shuffle) => {
      const useShuffle = shuffle ?? useSettings.getState().settings.playback.shuffle;
      const queue = playTracks(tracks, index, useShuffle);
      set({ queue });
      if (queue.index >= 0) startTrack(queue.index, "search");
    },

    playTrackInContext: (track, context) => {
      const index = context.findIndex((entry) => entry.id === track.id);
      get().playList(context, index >= 0 ? index : 0);
    },

    toggle: () => {
      const status = get().status;
      if (status === "idle" || status === "error") {
        const track = currentTrack(get().queue);
        if (track) startTrack(get().queue.index, listen.source);
        return;
      }
      audioEngine.toggle();
      set({ status: get().status === "playing" ? "paused" : "playing" });
    },

    next: (auto = false) => advance(auto),

    previous: () => {
      const result = stepBackward(get().queue, get().position);
      if (result.index !== get().queue.index) startTrack(result.index);
      else audioEngine.seek(0);
    },

    seek: (seconds) => {
      audioEngine.seek(seconds);
      set({ position: seconds });
    },

    setShuffle: (on) => {
      const queue = get().queue;
      const next = on === undefined ? toggleShuffle(queue) : { ...queue, shuffle: on, order: on ? queue.order : [] };
      set({ queue: next });
      void idbSet("queue", QUEUE_KEY, next);
    },

    setRepeat: (mode) => {
      const next = { ...get().queue, repeat: mode };
      set({ queue: next });
      void idbSet("queue", QUEUE_KEY, next);
    },

    cycleRepeat: () => {
      const order: RepeatMode[] = ["off", "all", "one"];
      const current = get().queue.repeat;
      get().setRepeat(order[(order.indexOf(current) + 1) % order.length]);
    },

    enqueue: (track) => {
      set({ queue: append(get().queue, track) });
      void idbSet("queue", QUEUE_KEY, get().queue);
    },

    enqueueNext: (track) => {
      set({ queue: insertNext(get().queue, track) });
      void idbSet("queue", QUEUE_KEY, get().queue);
    },

    enqueueMany: (tracks) => {
      set({ queue: appendMany(get().queue, tracks) });
      void idbSet("queue", QUEUE_KEY, get().queue);
    },

    dequeue: (index) => {
      const wasCurrent = index === get().queue.index;
      set({ queue: removeAt(get().queue, index) });
      void idbSet("queue", QUEUE_KEY, get().queue);
      if (wasCurrent && get().queue.tracks.length) startTrack(get().queue.index);
      if (!get().queue.tracks.length) audioEngine.stop();
    },

    moveQueueItem: (from, to) => {
      set({ queue: moveItem(get().queue, from, to) });
      void idbSet("queue", QUEUE_KEY, get().queue);
    },

    clear: () => {
      finalizePlay(false, true);
      set({ queue: clearQueue(get().queue), position: 0, duration: 0, status: "idle" });
      audioEngine.stop();
      void idbSet("queue", QUEUE_KEY, get().queue);
    },

    openFull: () => set({ fullOpen: true }),
    closeFull: () => set({ fullOpen: false }),

    loadLyrics: async (force = false) => {
      const track = currentTrack(get().queue);
      if (!track) return;
      if (!force && get().lyrics.data) return;
      set({ lyrics: { data: null, loading: true, error: null } });
      try {
        const context = await api.watch(track.id);
        if (!context.lyricsBrowseId) {
          set({ lyrics: { data: null, loading: false, error: "unavailable" } });
          return;
        }
        const data = await api.lyrics(context.lyricsBrowseId, false);
        set({ lyrics: { data, loading: false, error: null } });
      } catch (cause) {
        const message = cause instanceof ApiError ? cause.message : "Lyrics failed to load";
        set({ lyrics: { data: null, loading: false, error: message } });
      }
    },

    setSleepTimer: (minutes) => {
      if (sleepHandle) clearTimeout(sleepHandle);
      if (!minutes) {
        set({ sleepTimer: null });
        return;
      }
      const endsAt = Date.now() + minutes * 60_000;
      set({ sleepTimer: { endsAt, remainingMs: minutes * 60_000 } });
      sleepHandle = setTimeout(() => {
        audioEngine.pause();
        set({ status: "paused", sleepTimer: null });
      }, minutes * 60_000);
    },

    cancelSleepTimer: () => {
      if (sleepHandle) clearTimeout(sleepHandle);
      set({ sleepTimer: null });
    },
  };
});

/** Reset module level state — used between tests. */
export function resetPlayerForTests(): void {
  initialized = false;
  listen = { trackId: "", listenedMs: 0, lastTick: 0, completed: false, source: "search" };
  if (sleepHandle) clearTimeout(sleepHandle);
}
