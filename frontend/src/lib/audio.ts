import type { Track } from "../types";

/**
 * Thin wrapper around a single HTMLAudioElement.
 *
 * The element is created lazily so unit tests (jsdom) and the first render do
 * not touch media APIs. All state flows out through events; the store never
 * reaches into the element directly.
 */

export type EngineState = "idle" | "loading" | "playing" | "paused" | "waiting" | "ended" | "error";

export type EngineEvent =
  | { type: "state"; state: EngineState; message?: string }
  | { type: "time"; position: number; duration: number }
  | { type: "duration"; duration: number };

export interface EngineActions {
  onPlay?: () => void;
  onPause?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onSeek?: (position: number) => void;
  onStop?: () => void;
}

class AudioEngine {
  private element: HTMLAudioElement | null = null;
  private listeners = new Set<(event: EngineEvent) => void>();
  private actions: EngineActions = {};
  private currentSrc = "";
  private retried = false;

  on(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setActions(actions: EngineActions): void {
    this.actions = actions;
    this.syncMediaSession();
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private ensure(): HTMLAudioElement {
    if (this.element) return this.element;
    const el = typeof Audio !== "undefined" ? new Audio() : document.createElement("audio");
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    el.addEventListener("loadstart", () => this.emit({ type: "state", state: "loading" }));
    el.addEventListener("waiting", () => this.emit({ type: "state", state: "waiting" }));
    el.addEventListener("playing", () => this.emit({ type: "state", state: "playing" }));
    el.addEventListener("play", () => this.emit({ type: "state", state: "playing" }));
    el.addEventListener("pause", () => {
      if (!el.ended) this.emit({ type: "state", state: "paused" });
    });
    el.addEventListener("ended", () => this.emit({ type: "state", state: "ended" }));
    el.addEventListener("error", () => {
      if (this.currentSrc && !this.retried) {
        // One automatic retry: the resolved URL may have just expired.
        this.retried = true;
        const src = this.currentSrc;
        this.currentSrc = "";
        this.load(src, { play: true, rate: el.playbackRate });
        return;
      }
      this.emit({ type: "state", state: "error", message: el.error?.message || "Playback failed" });
    });
    el.addEventListener("timeupdate", () => {
      this.emit({ type: "time", position: el.currentTime, duration: Number.isFinite(el.duration) ? el.duration : 0 });
    });
    el.addEventListener("durationchange", () => {
      if (Number.isFinite(el.duration)) this.emit({ type: "duration", duration: el.duration });
    });
    this.element = el;
    return el;
  }

  load(src: string, opts: { play: boolean; rate?: number } = { play: false }): void {
    const el = this.ensure();
    if (this.currentSrc !== src) {
      this.currentSrc = src;
      this.retried = false;
      el.src = src;
      el.load();
    }
    if (opts.rate && opts.rate !== 1) el.playbackRate = opts.rate;
    if (opts.play) void this.play();
  }

  async play(): Promise<void> {
    const el = this.ensure();
    try {
      await el.play();
    } catch (cause) {
      // Autoplay can be blocked until the user interacts with the page.
      this.emit({ type: "state", state: "paused" });
    }
  }

  pause(): void {
    this.element?.pause();
  }

  toggle(): void {
    const el = this.ensure();
    if (el.paused) void this.play();
    else el.pause();
  }

  seek(position: number): void {
    const el = this.ensure();
    if (Number.isFinite(position)) el.currentTime = Math.max(0, position);
    this.emit({ type: "time", position: el.currentTime, duration: Number.isFinite(el.duration) ? el.duration : 0 });
  }

  setRate(rate: number): void {
    this.ensure().playbackRate = rate;
  }

  get position(): number {
    return this.element?.currentTime ?? 0;
  }

  get duration(): number {
    const value = this.element?.duration;
    return value && Number.isFinite(value) ? value : 0;
  }

  get paused(): boolean {
    return this.element?.paused ?? true;
  }

  stop(): void {
    const el = this.ensure();
    el.pause();
    el.removeAttribute("src");
    el.load();
    this.currentSrc = "";
  }

  /** Controls shown on the lock screen / bluetooth headsets. */
  syncMediaSession(track?: Track | null): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const media = navigator.mediaSession;
    if (track) {
      const artwork = track.thumbnails?.map((thumb) => ({
        src: thumb.url,
        sizes: `${thumb.width ?? 300}x${thumb.height ?? 300}`,
        type: "image/jpeg",
      }));
      try {
        media.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artists?.map((artist) => artist.name).join(", ") ?? "",
          album: track.album?.name ?? "",
          artwork: artwork ?? [],
        });
      } catch {
        /* MediaMetadata is unavailable in some webviews */
      }
    }
    const register = (action: MediaSessionAction, handler: () => void) => {
      try {
        media.setActionHandler(action, handler);
      } catch {
        /* action not supported on this platform */
      }
    };
    register("play", () => this.actions.onPlay?.());
    register("pause", () => this.actions.onPause?.());
    register("nexttrack", () => this.actions.onNext?.());
    register("previoustrack", () => this.actions.onPrevious?.());
    register("stop", () => this.actions.onStop?.());
    try {
      media.setActionHandler("seekto", (details) => {
        if (typeof details.seekTime === "number") this.actions.onSeek?.(details.seekTime);
      });
    } catch {
      /* optional */
    }
  }

  setPositionState(position: number, duration: number): void {
    if (typeof navigator === "undefined" || !navigator.mediaSession?.setPositionState) return;
    if (!Number.isFinite(duration) || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({ duration, position: Math.min(position, duration), playbackRate: this.element?.playbackRate ?? 1 });
    } catch {
      /* invalid state values are ignored */
    }
  }
}

export const audioEngine = new AudioEngine();
