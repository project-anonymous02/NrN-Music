import { create } from "zustand";
import { idbClear, idbGet, idbSet } from "../lib/db";
import type { AlbumItem, ArtistItem, Track } from "../types";

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

export interface LibraryExport {
  app: "NrNMusic";
  kind: "library";
  version: number;
  liked: Track[];
  playlists: Playlist[];
  followed: ArtistItem[];
  savedAlbums: AlbumItem[];
}

interface LibraryState {
  hydrated: boolean;
  liked: Track[];
  playlists: Playlist[];
  followed: ArtistItem[];
  savedAlbums: AlbumItem[];
  downloads: string[];
  cached: string[];

  hydrate: () => Promise<void>;
  toggleLike: (track: Track) => boolean;
  isLiked: (trackId: string) => boolean;

  createPlaylist: (name: string, tracks?: Track[]) => Playlist | null;
  renamePlaylist: (playlistId: string, name: string) => void;
  deletePlaylist: (playlistId: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  reorderPlaylist: (playlistId: string, from: number, to: number) => void;
  getPlaylist: (playlistId: string) => Playlist | null;

  toggleFollow: (artist: ArtistItem) => void;
  isFollowed: (artistId: string) => boolean;
  toggleAlbum: (album: AlbumItem) => void;
  isSavedAlbum: (albumId: string | null) => boolean;

  markCached: (trackId: string) => void;
  clearCache: () => void;
  setDownloaded: (trackId: string, on: boolean) => void;

  exportData: () => string;
  importData: (raw: string) => { ok: boolean; reason?: string };
  reset: () => Promise<void>;
}

const STORAGE_KEY = "current";

async function persist(state: LibraryState): Promise<void> {
  const payload: LibraryExport = {
    app: "NrNMusic",
    kind: "library",
    version: 1,
    liked: state.liked,
    playlists: state.playlists,
    followed: state.followed,
    savedAlbums: state.savedAlbums,
  };
  await idbSet("library", STORAGE_KEY, payload);
  await idbSet("library", "cache", { downloads: state.downloads, cached: state.cached });
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePersist(get: () => LibraryState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void persist(get()), 180);
}

const empty: Pick<
  LibraryState,
  "liked" | "playlists" | "followed" | "savedAlbums" | "downloads" | "cached"
> = {
  liked: [],
  playlists: [],
  followed: [],
  savedAlbums: [],
  downloads: [],
  cached: [],
};

export const useLibrary = create<LibraryState>((set, get) => ({
  hydrated: false,
  ...empty,

  hydrate: async () => {
    const stored = await idbGet<LibraryExport>("library", STORAGE_KEY);
    const cache = await idbGet<{ downloads: string[]; cached: string[] }>("library", "cache");
    set({
      liked: stored?.liked ?? [],
      playlists: stored?.playlists ?? [],
      followed: stored?.followed ?? [],
      savedAlbums: stored?.savedAlbums ?? [],
      downloads: cache?.downloads ?? [],
      cached: cache?.cached ?? [],
      hydrated: true,
    });
  },

  toggleLike: (track) => {
    const exists = get().liked.some((entry) => entry.id === track.id);
    set({ liked: exists ? get().liked.filter((entry) => entry.id !== track.id) : [track, ...get().liked] });
    schedulePersist(get);
    return !exists;
  },

  isLiked: (trackId) => get().liked.some((entry) => entry.id === trackId),

  createPlaylist: (name, tracks = []) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const playlist: Playlist = {
      id: `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
      tracks,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set({ playlists: [playlist, ...get().playlists] });
    schedulePersist(get);
    return playlist;
  },

  renamePlaylist: (playlistId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set({
      playlists: get().playlists.map((playlist) =>
        playlist.id === playlistId ? { ...playlist, name: trimmed, updatedAt: Date.now() } : playlist,
      ),
    });
    schedulePersist(get);
  },

  deletePlaylist: (playlistId) => {
    set({ playlists: get().playlists.filter((playlist) => playlist.id !== playlistId) });
    schedulePersist(get);
  },

  addToPlaylist: (playlistId, track) => {
    set({
      playlists: get().playlists.map((playlist) =>
        playlist.id === playlistId && !playlist.tracks.some((entry) => entry.id === track.id)
          ? { ...playlist, tracks: [...playlist.tracks, track], updatedAt: Date.now() }
          : playlist,
      ),
    });
    schedulePersist(get);
  },

  removeFromPlaylist: (playlistId, trackId) => {
    set({
      playlists: get().playlists.map((playlist) =>
        playlist.id === playlistId
          ? { ...playlist, tracks: playlist.tracks.filter((entry) => entry.id !== trackId), updatedAt: Date.now() }
          : playlist,
      ),
    });
    schedulePersist(get);
  },

  reorderPlaylist: (playlistId, from, to) => {
    set({
      playlists: get().playlists.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        const tracks = [...playlist.tracks];
        if (from < 0 || to < 0 || from >= tracks.length || to >= tracks.length) return playlist;
        const [item] = tracks.splice(from, 1);
        tracks.splice(to, 0, item);
        return { ...playlist, tracks, updatedAt: Date.now() };
      }),
    });
    schedulePersist(get);
  },

  getPlaylist: (playlistId) => get().playlists.find((playlist) => playlist.id === playlistId) ?? null,

  toggleFollow: (artist) => {
    const exists = get().followed.some((entry) => entry.id === artist.id);
    set({ followed: exists ? get().followed.filter((entry) => entry.id !== artist.id) : [artist, ...get().followed] });
    schedulePersist(get);
  },

  isFollowed: (artistId) => get().followed.some((entry) => entry.id === artistId),

  toggleAlbum: (album) => {
    if (!album.id) return;
    const exists = get().savedAlbums.some((entry) => entry.id === album.id);
    set({
      savedAlbums: exists ? get().savedAlbums.filter((entry) => entry.id !== album.id) : [album, ...get().savedAlbums],
    });
    schedulePersist(get);
  },

  isSavedAlbum: (albumId) => Boolean(albumId) && get().savedAlbums.some((entry) => entry.id === albumId),

  markCached: (trackId) => {
    if (get().cached.includes(trackId)) return;
    set({ cached: [...get().cached, trackId] });
    schedulePersist(get);
  },

  clearCache: () => {
    set({ cached: [] });
    schedulePersist(get);
  },

  setDownloaded: (trackId, on) => {
    set({ downloads: on ? [...new Set([...get().downloads, trackId])] : get().downloads.filter((id) => id !== trackId) });
    schedulePersist(get);
  },

  exportData: () => JSON.stringify({ app: "NrNMusic", kind: "library", version: 1, ...pickLibrary(get()) }, null, 2),

  importData: (raw) => {
    try {
      const parsed = JSON.parse(raw) as Partial<LibraryExport>;
      if (parsed.app !== "NrNMusic" || parsed.kind !== "library") return { ok: false, reason: "invalid" };
      if (!Array.isArray(parsed.liked) || !Array.isArray(parsed.playlists)) return { ok: false, reason: "shape" };

      const playlists = parsed.playlists.filter(isValidPlaylist);
      set({
        liked: parsed.liked.filter(isValidTrack),
        playlists,
        followed: (parsed.followed ?? []).filter((entry) => Boolean(entry?.id && entry?.name)),
        savedAlbums: (parsed.savedAlbums ?? []).filter((entry) => Boolean(entry?.id && entry?.title)),
      });
      schedulePersist(get);
      return { ok: true };
    } catch {
      return { ok: false, reason: "parse" };
    }
  },

  reset: async () => {
    await idbClear("library");
    set({ ...empty, hydrated: true });
  },
}));

function pickLibrary(state: LibraryState): Pick<LibraryExport, "liked" | "playlists" | "followed" | "savedAlbums"> {
  return {
    liked: state.liked,
    playlists: state.playlists,
    followed: state.followed,
    savedAlbums: state.savedAlbums,
  };
}

/**
 * Imported files are untrusted: every record is checked before it reaches
 * state, and nothing is ever evaluated as code.
 */
export function isValidTrack(value: unknown): value is Track {
  const track = value as Track | null;
  return Boolean(track && typeof track.id === "string" && track.id.length > 0 && typeof track.title === "string");
}

function isValidPlaylist(value: unknown): value is Playlist {
  const playlist = value as Playlist | null;
  return Boolean(
    playlist &&
      typeof playlist.id === "string" &&
      typeof playlist.name === "string" &&
      Array.isArray(playlist.tracks) &&
      playlist.tracks.every(isValidTrack),
  );
}
