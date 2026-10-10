import { describe, expect, it } from "vitest";
import { artistScore, hash, rankCandidates, reasonLabel, scoreTrack, summarize, WEIGHTS, type PlayEvent } from "./recommend";
import type { Track } from "../types";

const play = (overrides: Partial<PlayEvent> = {}): PlayEvent => ({
  trackId: "t1",
  title: "Song",
  artists: ["Artist A"],
  durationMs: 200000,
  listenedMs: 180000,
  completed: true,
  skipped: false,
  liked: false,
  ts: 1,
  ...overrides,
});

const track = (id: string, artist = "Artist A"): Track => ({
  id,
  title: `Track ${id}`,
  artists: [{ name: artist, id: null }],
  album: null,
  duration: 200,
  thumbnails: [],
});

describe("summarize", () => {
  it("aggregates artists case-insensitively and keeps the display spelling", () => {
    const summary = summarize([play({ artists: ["Artist A"] }), play({ artists: ["artist a"] })]);
    expect(Object.keys(summary.byArtist)).toEqual(["artist a"]);
    expect(summary.byArtist["artist a"].plays).toBe(2);
    expect(summary.byArtist["artist a"].artist).toBe("Artist A");
    expect(summary.totalPlays).toBe(2);
    expect(summary.completionRate).toBe(1);
    expect(summary.skipRate).toBe(0);
  });

  it("falls back to a placeholder artist and ranks by weighted score", () => {
    const summary = summarize([
      play({ artists: [], liked: true }),
      play({ artists: ["B"], completed: false, skipped: true, listenedMs: 1000 }),
      play({ artists: ["B"], completed: false, skipped: true, listenedMs: 1000 }),
    ]);
    expect(summary.byArtist["unknown artist"].plays).toBe(1);
    expect(summary.topArtists[0].artist).toBe("Unknown artist");
    expect(summary.likedArtists).toEqual(["Unknown artist"]);
    expect(summary.skipRate).toBeCloseTo(2 / 3, 5);
  });

  it("returns an empty summary for no history", () => {
    const summary = summarize([]);
    expect(summary.totalPlays).toBe(0);
    expect(summary.topArtists).toEqual([]);
    expect(summary.completionRate).toBe(0);
  });
});

describe("artistScore", () => {
  it("applies the published weight table", () => {
    const score = artistScore({
      artist: "A",
      plays: 4,
      completions: 3,
      skips: 1,
      likes: 1,
      listenedMs: 100,
    });
    expect(score).toBe(4 * WEIGHTS.play + 3 * WEIGHTS.completion + 1 * WEIGHTS.like + 1 * WEIGHTS.skip);
  });
});

describe("scoreTrack", () => {
  it("scores nothing without history", () => {
    expect(scoreTrack(track("a"), summarize([]))).toEqual({ track: track("a"), score: 0, reason: null });
  });

  it("prefers the strongest signal for its reason", () => {
    const liked = summarize([play({ artists: ["Artist A"], liked: true })]);
    expect(scoreTrack(track("a", "Artist A"), liked, 0).reason).toEqual({
      key: "reason.becauseYouLike",
      vars: { name: "Artist A" },
    });

    const replayed = summarize([
      play({ artists: ["Artist A"] }),
      play({ artists: ["Artist A"] }),
    ]);
    const replayReason = scoreTrack(track("a", "Artist A"), replayed, 0).reason;
    expect(replayReason?.key).toBe("reason.similarToRecent");

    const heardOnce = summarize([play({ artists: ["Artist A"] })]);
    expect(scoreTrack(track("a", "Artist A"), heardOnce, 0).reason?.key).toBe("reason.basedOnHistory");
  });

  it("rewards affinity and penalises skips", () => {
    const loved = summarize([play({ artists: ["Artist A"], liked: true })]);
    const skipped = summarize([play({ artists: ["Artist A"], completed: false, skipped: true, listenedMs: 500 })]);
    const candidate = track("a", "Artist A");
    expect(scoreTrack(candidate, loved, 0).score).toBeGreaterThan(scoreTrack(candidate, skipped, 0).score);
  });

  it("adds deterministic variation for a given salt", () => {
    const summary = summarize([play({ artists: ["Artist A"] })]);
    const candidate = track("a", "Artist A");
    const first = scoreTrack(candidate, summary, 0.5, 7);
    const second = scoreTrack(candidate, summary, 0.5, 7);
    const different = scoreTrack(candidate, summary, 0.5, 8);
    expect(first.score).toBe(second.score);
    expect(first.score).not.toBe(different.score);
  });
});

describe("rankCandidates", () => {
  it("orders by score when personalization is on", () => {
    const summary = summarize([play({ artists: ["Artist A"], liked: true })]);
    const ranked = rankCandidates([track("x", "Nobody"), track("y", "Artist A")], summary, { variation: 0 });
    expect(ranked[0].track.id).toBe("y");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("keeps discovery mode honest when personalization is off", () => {
    const summary = summarize([play({ artists: ["Artist A"], liked: true })]);
    const ranked = rankCandidates([track("x"), track("y")], summary, { personalization: false });
    expect(ranked).toHaveLength(2);
    expect(ranked.every((entry) => entry.reason?.key === "reason.discoverNew")).toBe(true);
  });

  it("is stable across calls for the same salt", () => {
    const summary = summarize([play({ artists: ["Artist A"] })]);
    const candidates = [track("x"), track("y"), track("z")];
    const first = rankCandidates(candidates, summary, { salt: 3 });
    const second = rankCandidates(candidates, summary, { salt: 3 });
    expect(first.map((entry) => entry.track.id)).toEqual(second.map((entry) => entry.track.id));
  });
});

describe("helpers", () => {
  it("hashes deterministically inside [0, 1)", () => {
    expect(hash("abc")).toBe(hash("abc"));
    expect(hash("abc")).not.toBe(hash("abd"));
    for (let i = 0; i < 50; i += 1) {
      const value = hash(`track-${i}`);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("renders a reason through the translator", () => {
    expect(reasonLabel(null, (key) => key)).toBeNull();
    expect(
      reasonLabel({ key: "reason.becauseYouLike", vars: { name: "Artist A" } }, (_key, vars) => String(vars?.name)),
    ).toBe("Artist A");
  });
});
