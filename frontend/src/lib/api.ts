import type {
  AlbumItem,
  ArtistItem,
  HomeSection,
  Lyrics,
  PlaylistItem,
  SearchEntry,
  StreamMeta,
  Track,
} from "../types";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, code: string, status: number, retryable: boolean) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export interface SearchResponse {
  query: string;
  type: string;
  results: SearchEntry[];
}

export interface Suggestion {
  text: string;
  kind: string;
  track?: Track;
}

const API_BASE_KEY = "nrn:apiBase";

function normalizeBase(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === window.location.origin) return "";
  return trimmed;
}

/** Absolute base URL of the backend, or "" for same-origin (web builds). */
let apiBase = normalizeBase(localStorage.getItem(API_BASE_KEY) || (import.meta.env.VITE_API_BASE as string | undefined));

export function getApiBase(): string {
  return apiBase;
}

/** Persist a new backend origin ("" = same origin) and take effect immediately. */
export function setApiBase(base: string): void {
  const normalized = normalizeBase(base);
  apiBase = normalized;
  if (normalized) localStorage.setItem(API_BASE_KEY, normalized);
  else localStorage.removeItem(API_BASE_KEY);
}

function apiUrl(path: string): string {
  return apiBase ? `${apiBase}${path}` : new URL(path, window.location.origin).toString();
}

async function request<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(apiUrl(path));
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), { headers: { accept: "application/json" } });
  } catch (cause) {
    throw new ApiError("Could not reach the NrNMusic backend.", "network_error", 0, true);
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(
      error?.message ?? `Request failed with status ${response.status}.`,
      error?.code ?? "request_failed",
      response.status,
      error?.retryable ?? response.status >= 500,
    );
  }

  return body as T;
}

export const api = {
  health: () => request<{ status: string; version: string }>("/api/health"),

  search: (q: string, type = "all", limit = 20) =>
    request<SearchResponse>("/api/search", { q, type, limit }),

  suggest: (q: string) => request<{ suggestions: Suggestion[] }>("/api/suggest", { q }),

  song: (videoId: string) =>
    request<{ track: Track; playable: boolean; reason?: string | null }>(`/api/song/${videoId}`),

  album: (browseId: string) =>
    request<{ album: AlbumItem & Record<string, unknown>; tracks: Track[]; related: AlbumItem[] }>(
      `/api/album/${browseId}`,
    ),

  artist: (channelId: string) =>
    request<{
      artist: ArtistItem & Record<string, unknown>;
      topSongs: Track[];
      albums: AlbumItem[];
      singles: AlbumItem[];
      videos: Track[];
      related: ArtistItem[];
      albumsShelf?: string | null;
      singlesShelf?: string | null;
      albumsParams?: string | null;
      singlesParams?: string | null;
    }>(`/api/artist/${channelId}`),

  artistAlbums: (channelId: string, shelf: string, params: string, kind: "albums" | "singles") =>
    request<{ albums: AlbumItem[] }>(`/api/artist/${channelId}/albums`, { shelf, params, kind, limit: 50 }),

  playlist: (playlistId: string) =>
    request<{
      playlist: PlaylistItem & Record<string, unknown>;
      tracks: Track[];
      suggestions: Track[];
    }>(`/api/playlist/${playlistId}`),

  charts: () =>
    request<{ playlists: PlaylistItem[]; artists: ArtistItem[]; countries: string[]; selectedCountry: string | null }>(
      "/api/charts",
    ),

  home: (limit = 8) => request<{ sections: HomeSection[] }>("/api/home", { limit }),

  explore: () =>
    request<{
      newReleases: AlbumItem[];
      newVideos: Track[];
      trending: PlaylistItem[];
      moodsAndGenres: PlaylistItem[];
    }>("/api/explore"),

  watch: (videoId: string) =>
    request<{ playlistId: string | null; lyricsBrowseId: string | null; relatedBrowseId: string | null; tracks: Track[] }>(
      `/api/watch/${videoId}`,
    ),

  lyrics: (browseId: string, timed = false) => request<Lyrics>("/api/lyrics/" + browseId, { timed }),

  streamMeta: (videoId: string, ext = "auto") => request<StreamMeta>(`/api/stream/${videoId}/meta`, { ext }),

  streamUrl: (videoId: string) => apiUrl(`/api/stream/${videoId}`),
};
