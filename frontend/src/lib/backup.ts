import { useHistory, type HistoryExport } from "../stores/history";
import { useLibrary, type LibraryExport } from "../stores/library";
import { usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import type { RepeatMode } from "../types";
import type { QueueState } from "./queue";

export interface LocalBackup {
  app: "NrNMusic";
  kind: "backup";
  version: 1;
  createdAt: number;
  settings: Record<string, unknown>;
  library: LibraryExport;
  history: HistoryExport;
  queue: QueueState;
}

type BackupResult = { ok: true; backup: LocalBackup } | { ok: false; reason: "invalid" | "parse" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTrack(value: unknown): value is { id: string; title: string } {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0 && typeof value.title === "string";
}

function isSettings(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !["dark", "light", "system"].includes(String(value.theme))) return false;
  if (!isRecord(value.colors) || !isRecord(value.animation) || !isRecord(value.playback)) return false;
  const colors = value.colors;
  const colorKeys = ["bg", "surface1", "surface2", "surface3", "text", "textMuted", "border", "accent", "accent2"];
  return (
    colorKeys.every((key) => typeof colors[key] === "string") &&
    typeof value.animation.enabled === "boolean" &&
    typeof value.animation.speed === "number" &&
    typeof value.playback.autoplay === "boolean" &&
    typeof value.language === "string"
  );
}

function isLibrary(value: unknown): value is LibraryExport {
  if (!isRecord(value)) return false;
  return (
    value.app === "NrNMusic" &&
    value.kind === "library" &&
    value.version === 1 &&
    Array.isArray(value.liked) &&
    value.liked.every(isTrack) &&
    Array.isArray(value.playlists) &&
    value.playlists.every(
      (playlist) =>
        isRecord(playlist) &&
        typeof playlist.id === "string" &&
        typeof playlist.name === "string" &&
        Array.isArray(playlist.tracks) &&
        playlist.tracks.every(isTrack),
    ) &&
    Array.isArray(value.followed) &&
    Array.isArray(value.savedAlbums)
  );
}

function isHistory(value: unknown): value is HistoryExport {
  return (
    isRecord(value) &&
    value.app === "NrNMusic" &&
    value.kind === "history" &&
    value.version === 1 &&
    Array.isArray(value.plays) &&
    value.plays.every((play) => isRecord(play) && typeof play.trackId === "string") &&
    Array.isArray(value.searches) &&
    value.searches.every((search) => typeof search === "string")
  );
}

function isQueue(value: unknown): value is QueueState {
  if (!isRecord(value)) return false;
  const tracks = value.tracks;
  if (!Array.isArray(tracks) || !tracks.every(isTrack)) return false;
  const repeat = value.repeat as RepeatMode;
  const order = value.order;
  const validOrder =
    Array.isArray(order) &&
    order.every((index) => Number.isInteger(index) && index >= 0 && index < tracks.length) &&
    (value.shuffle
      ? order.length === tracks.length && new Set(order).size === order.length
      : order.length === 0);
  return (
    typeof value.index === "number" &&
    Number.isInteger(value.index) &&
    value.index >= (tracks.length === 0 ? -1 : 0) &&
    value.index < tracks.length &&
    typeof value.shuffle === "boolean" &&
    ["off", "all", "one"].includes(repeat) &&
    validOrder
  );
}

export function createLocalBackup(): string {
  const settings = JSON.parse(useSettings.getState().exportData()) as { settings: Record<string, unknown> };
  const library = JSON.parse(useLibrary.getState().exportData()) as LibraryExport;
  const history = JSON.parse(useHistory.getState().exportData()) as HistoryExport;
  const queue = usePlayer.getState().queue;
  const backup: LocalBackup = {
    app: "NrNMusic",
    kind: "backup",
    version: 1,
    createdAt: Date.now(),
    settings: settings.settings,
    library,
    history,
    queue,
  };
  return JSON.stringify(backup, null, 2);
}

export function parseLocalBackup(raw: string): BackupResult {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.app !== "NrNMusic" ||
      value.kind !== "backup" ||
      value.version !== 1 ||
      !isSettings(value.settings) ||
      !isLibrary(value.library) ||
      !isHistory(value.history) ||
      !isQueue(value.queue)
    ) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, backup: value as unknown as LocalBackup };
  } catch {
    return { ok: false, reason: "parse" };
  }
}

/** Validate the complete file before applying any of its local data sections. */
export function importLocalBackup(raw: string): { ok: boolean; reason?: string } {
  const parsed = parseLocalBackup(raw);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const { settings, library, history } = parsed.backup;
  const settingsResult = useSettings.getState().importData(
    JSON.stringify({ app: "NrNMusic", kind: "settings", version: 1, settings }),
  );
  const libraryResult = useLibrary.getState().importData(JSON.stringify(library));
  const historyResult = useHistory.getState().importData(JSON.stringify(history));
  if (!settingsResult.ok || !libraryResult.ok || !historyResult.ok) return { ok: false, reason: "invalid" };
  usePlayer.getState().restoreQueue(parsed.backup.queue);
  return { ok: true };
}
