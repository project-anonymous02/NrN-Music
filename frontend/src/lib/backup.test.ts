import { describe, expect, it } from "vitest";
import { parseLocalBackup } from "./backup";

const validBackup = {
  app: "NrNMusic",
  kind: "backup",
  version: 1,
  createdAt: 1,
  settings: {
    theme: "dark",
    colors: {
      bg: "#000000",
      surface1: "#080a09",
      surface2: "#101312",
      surface3: "#191d1b",
      text: "#f4f6f5",
      textMuted: "#a3aba7",
      border: "#262b29",
      accent: "#ff5c35",
      accent2: "#4cc2ff",
    },
    animation: { enabled: true, speed: 1 },
    playback: { autoplay: true },
    language: "en",
  },
  library: {
    app: "NrNMusic",
    kind: "library",
    version: 1,
    liked: [{ id: "song-1", title: "Song" }],
    playlists: [{ id: "playlist-1", name: "List", tracks: [] }],
    followed: [],
    savedAlbums: [],
  },
  history: { app: "NrNMusic", kind: "history", version: 1, plays: [], searches: ["artist"] },
  queue: { tracks: [], index: -1, shuffle: false, repeat: "off", order: [] },
};

describe("parseLocalBackup", () => {
  it("accepts a complete version 1 backup", () => {
    expect(parseLocalBackup(JSON.stringify(validBackup))).toMatchObject({ ok: true });
  });

  it("rejects unsupported versions and incomplete sections", () => {
    expect(parseLocalBackup(JSON.stringify({ ...validBackup, version: 2 }))).toEqual({ ok: false, reason: "invalid" });
    expect(parseLocalBackup(JSON.stringify({ ...validBackup, history: { plays: [] } }))).toEqual({ ok: false, reason: "invalid" });
    expect(parseLocalBackup(JSON.stringify({ ...validBackup, queue: { tracks: [], index: 0 } }))).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports malformed JSON", () => {
    expect(parseLocalBackup("{")).toEqual({ ok: false, reason: "parse" });
  });
});
