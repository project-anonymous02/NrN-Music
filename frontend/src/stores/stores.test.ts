import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings, useSettings, validateSettings, applySettings } from "./settings";
import { useLibrary } from "./library";
import { useHistory } from "./history";
import type { AlbumItem, ArtistItem, Track } from "../types";

const track = (id: string): Track => ({
  id,
  title: `Track ${id}`,
  artists: [{ name: "Artist", id: "ch_1" }],
  album: null,
  duration: 180,
  thumbnails: [],
});

const album: AlbumItem = {
  id: "MPRE_1",
  title: "Album",
  artists: [{ name: "Artist", id: null }],
  year: "2024",
  thumbnails: [],
};

const artist: ArtistItem = { id: "ch_1", name: "Artist", thumbnails: [] };

beforeEach(async () => {
  useSettings.getState().update({ language: "en" });
  useSettings.getState().reset();
  await useLibrary.getState().reset();
  useHistory.getState().clearPlays();
  useHistory.getState().clearSearches();
  vi.useRealTimers();
});

describe("settings validation", () => {
  it("accepts the shipped defaults", () => {
    expect(validateSettings(defaultSettings)).toEqual([]);
  });

  it("warns about unreadable text and green accents", () => {
    const lowContrast = {
      ...defaultSettings,
      colors: { ...defaultSettings.colors, text: "#222222", accent: "#1db954" },
    };
    const keys = validateSettings(lowContrast).map((warning) => warning.key);
    expect(keys).toContain("settings.contrastWarning");
    expect(keys).toContain("settings.greenWarning");
  });
});

describe("settings mutations", () => {
  it("merges nested patches without dropping siblings", () => {
    useSettings.getState().update({ animation: { speed: 1.5 } });
    const settings = useSettings.getState().settings;
    expect(settings.animation.speed).toBe(1.5);
    expect(settings.animation.enabled).toBe(true);
    expect(settings.colors.accent).toBe(defaultSettings.colors.accent);
  });

  it("keeps the canvas black and replaces green accent choices", () => {
    useSettings.getState().update({ theme: "light", colors: { bg: "#ffffff", accent: "#1db954" } });
    expect(useSettings.getState().settings.theme).toBe("dark");
    expect(useSettings.getState().settings.colors.bg).toBe("#000000");
    expect(useSettings.getState().settings.colors.accent).toBe(defaultSettings.colors.accent);
  });

  it("resets every value but keeps the chosen language", () => {
    useSettings.getState().update({ language: "id", radius: 4 });
    useSettings.getState().reset();
    const settings = useSettings.getState().settings;
    expect(settings.language).toBe("id");
    expect(settings.radius).toBe(defaultSettings.radius);
  });

  it("round-trips through export/import and rejects foreign payloads", () => {
    useSettings.getState().update({ radius: 3 });
    const raw = useSettings.getState().exportData();
    useSettings.getState().reset();
    expect(useSettings.getState().settings.radius).toBe(defaultSettings.radius);
    expect(useSettings.getState().importData(raw).ok).toBe(true);
    expect(useSettings.getState().settings.radius).toBe(3);

    expect(useSettings.getState().importData("not json").ok).toBe(false);
    expect(useSettings.getState().importData(JSON.stringify({ app: "Other" })).ok).toBe(false);
  });

  it("writes theme tokens onto the document root", () => {
    applySettings({ ...defaultSettings, radius: 21, fontScale: 110 });
    expect(document.documentElement.style.getPropertyValue("--radius-md")).toBe("21px");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe(defaultSettings.colors.accent);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("library", () => {
  it("toggles likes", () => {
    expect(useLibrary.getState().toggleLike(track("a"))).toBe(true);
    expect(useLibrary.getState().isLiked("a")).toBe(true);
    expect(useLibrary.getState().toggleLike(track("a"))).toBe(false);
    expect(useLibrary.getState().isLiked("a")).toBe(false);
  });

  it("creates, edits and reorders playlists", () => {
    const library = useLibrary.getState();
    expect(library.createPlaylist("   ")).toBeNull();
    const playlist = library.createPlaylist(" Focus ", [track("a"), track("b"), track("c")]);
    expect(playlist?.name).toBe("Focus");

    useLibrary.getState().reorderPlaylist(playlist!.id, 0, 2);
    expect(useLibrary.getState().getPlaylist(playlist!.id)?.tracks.map((entry) => entry.id)).toEqual(["b", "c", "a"]);

    useLibrary.getState().addToPlaylist(playlist!.id, track("b"));
    expect(useLibrary.getState().getPlaylist(playlist!.id)?.tracks).toHaveLength(3);

    useLibrary.getState().removeFromPlaylist(playlist!.id, track("c").id);
    expect(useLibrary.getState().getPlaylist(playlist!.id)?.tracks.map((entry) => entry.id)).toEqual(["b", "a"]);

    useLibrary.getState().renamePlaylist(playlist!.id, "  Calm  ");
    expect(useLibrary.getState().getPlaylist(playlist!.id)?.name).toBe("Calm");

    useLibrary.getState().deletePlaylist(playlist!.id);
    expect(useLibrary.getState().getPlaylist(playlist!.id)).toBeNull();
  });

  it("follows artists and saves albums", () => {
    useLibrary.getState().toggleFollow(artist);
    expect(useLibrary.getState().isFollowed("ch_1")).toBe(true);
    useLibrary.getState().toggleFollow(artist);
    expect(useLibrary.getState().isFollowed("ch_1")).toBe(false);

    useLibrary.getState().toggleAlbum(album);
    expect(useLibrary.getState().isSavedAlbum("MPRE_1")).toBe(true);
    useLibrary.getState().toggleAlbum({ ...album, id: null });
    expect(useLibrary.getState().isSavedAlbum(null)).toBe(false);
  });

  it("tracks cached and downloaded ids", () => {
    useLibrary.getState().markCached("t1");
    useLibrary.getState().markCached("t1");
    expect(useLibrary.getState().cached).toEqual(["t1"]);
    useLibrary.getState().clearCache();
    expect(useLibrary.getState().cached).toEqual([]);

    useLibrary.getState().setDownloaded("t1", true);
    useLibrary.getState().setDownloaded("t1", false);
    expect(useLibrary.getState().downloads).toEqual([]);
  });

  it("imports only well-formed library exports", () => {
    expect(useLibrary.getState().importData("{}")).toEqual({ ok: false, reason: "invalid" });
    expect(useLibrary.getState().importData(JSON.stringify({ app: "NrNMusic", kind: "library" }))).toEqual({
      ok: false,
      reason: "shape",
    });

    const payload = JSON.stringify({
      app: "NrNMusic",
      kind: "library",
      liked: [track("a"), { bogus: true }],
      playlists: [
        { id: "pl_1", name: "Mix", tracks: [track("a")] },
        { id: "pl_2", name: "Broken", tracks: [42] },
      ],
      followed: [{ id: "ch_1", name: "Artist" }],
      savedAlbums: [{ id: "MPRE_1", title: "Album" }],
    });
    expect(useLibrary.getState().importData(payload).ok).toBe(true);
    const state = useLibrary.getState();
    expect(state.liked.map((entry) => entry.id)).toEqual(["a"]);
    expect(state.playlists.map((entry) => entry.id)).toEqual(["pl_1"]);
    expect(state.playlists[0].tracks.map((entry) => entry.id)).toEqual(["a"]);
    expect(state.followed).toHaveLength(1);
    expect(state.savedAlbums).toHaveLength(1);
  });
});

describe("history", () => {
  it("records and dedupes searches", () => {
    useHistory.getState().recordSearch("  daft punk ");
    useHistory.getState().recordSearch("Daft Punk");
    expect(useHistory.getState().searches).toEqual(["Daft Punk"]);
    useHistory.getState().recordSearch("x");
    expect(useHistory.getState().searches).toHaveLength(1);
  });

  it("caps the play log and ignores empty events", () => {
    useHistory.getState().recordPlay({
      trackId: "",
      title: "Song",
      artists: ["Artist A"],
      durationMs: 1000,
      listenedMs: 900,
      completed: true,
      skipped: false,
      liked: false,
      ts: 0,
    });
    expect(useHistory.getState().plays).toHaveLength(0);

    for (let i = 0; i < 700; i += 1) {
      useHistory.getState().recordPlay({
        trackId: `t${i}`,
        title: "Song",
        artists: ["Artist A"],
        durationMs: 1000,
        listenedMs: 900,
        completed: true,
        skipped: false,
        liked: false,
        ts: i,
      });
    }
    expect(useHistory.getState().plays).toHaveLength(600);
    expect(useHistory.getState().plays[0].trackId).toBe("t699");
  });
});
