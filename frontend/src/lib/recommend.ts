import type { MessageKey } from "../i18n";
import type { Track } from "../types";

/**
 * Recommendation engine.
 *
 * Everything here is computed from signals the app actually observes — no
 * fabricated "AI" labels. Weights live in one table so they can be tuned and
 * unit tested.
 */

export interface PlayEvent {
  trackId: string;
  title: string;
  artists: string[];
  album?: string | null;
  durationMs: number;
  listenedMs: number;
  completed: boolean;
  skipped: boolean;
  liked: boolean;
  ts: number;
  source?: string;
  /** Full metadata snapshot so history rows can render artwork without a refetch. */
  track?: Track;
}

export interface ArtistProfile {
  artist: string;
  plays: number;
  completions: number;
  skips: number;
  likes: number;
  listenedMs: number;
}

export interface HistorySummary {
  byArtist: Record<string, ArtistProfile>;
  topArtists: ArtistProfile[];
  totalPlays: number;
  completionRate: number;
  skipRate: number;
  likedArtists: string[];
}

export interface Reason {
  key: MessageKey;
  vars?: Record<string, string | number>;
}

export interface ScoredTrack {
  track: Track;
  score: number;
  reason: Reason | null;
}

export const WEIGHTS = {
  play: 1,
  completion: 3,
  like: 5,
  replay: 2,
  skip: -2.5,
  durationFactor: 0.4,
} as const;

export function summarize(plays: PlayEvent[]): HistorySummary {
  const byArtist: Record<string, ArtistProfile> = {};
  let completed = 0;
  let skipped = 0;

  for (const play of plays) {
    if (play.skipped) skipped += 1;
    if (play.completed) completed += 1;
    const names = play.artists.length ? play.artists : ["Unknown artist"];
    for (const name of names) {
      // Keys are normalized so scoring can look artists up case-insensitively;
      // ``artist`` keeps the display spelling from history.
      const key = normalize(name);
      const profile = byArtist[key] ?? (byArtist[key] = { artist: name, plays: 0, completions: 0, skips: 0, likes: 0, listenedMs: 0 });
      profile.plays += 1;
      profile.completions += play.completed ? 1 : 0;
      profile.skips += play.skipped ? 1 : 0;
      profile.likes += play.liked ? 1 : 0;
      profile.listenedMs += play.listenedMs;
    }
  }

  const profiles = Object.values(byArtist).sort((a, b) => artistScore(b) - artistScore(a));
  return {
    byArtist,
    topArtists: profiles.slice(0, 12),
    totalPlays: plays.length,
    completionRate: plays.length ? completed / plays.length : 0,
    skipRate: plays.length ? skipped / plays.length : 0,
    likedArtists: profiles.filter((profile) => profile.likes > 0).map((profile) => profile.artist),
  };
}

export function artistScore(profile: ArtistProfile): number {
  return (
    profile.plays * WEIGHTS.play +
    profile.completions * WEIGHTS.completion +
    profile.likes * WEIGHTS.like +
    profile.skips * WEIGHTS.skip
  );
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Score a candidate against the listening profile.
 *
 * ``variation`` (0–1) adds deterministic pseudo-random noise so the feed does
 * not collapse into the same ten songs; it never invents affinity that is not
 * there.
 */
export function scoreTrack(track: Track, summary: HistorySummary, variation = 0.15, salt = 0): ScoredTrack {
  if (summary.totalPlays === 0) {
    return { track, score: 0, reason: null };
  }

  const artistNames = track.artists.map((artist) => normalize(artist.name));
  let score = 0;
  let reason: Reason | null = null;

  for (const name of artistNames) {
    const profile = summary.byArtist[name];
    if (!profile) continue;
    const value = artistScore(profile);
    score += value;
    if (!reason && value > 0) {
      if (profile.likes > 0) reason = { key: "reason.becauseYouLike", vars: { name: profile.artist } };
      else if (profile.completions >= profile.plays && profile.plays >= 2)
        reason = { key: "reason.similarToRecent", vars: { name: profile.artist } };
      else if (profile.plays >= 1) reason = { key: "reason.basedOnHistory", vars: { name: profile.artist } };
    }
  }

  if (track.explicit === false && score > 0) score *= 1.02;

  const noise = variation * hash(track.id + salt) * 12;
  score += noise;

  if (!reason && score > 0) reason = { key: "reason.basedOnHistory" };

  return { track, score, reason };
}

export function rankCandidates(
  candidates: Track[],
  summary: HistorySummary,
  opts: { variation?: number; salt?: number; personalization?: boolean } = {},
): ScoredTrack[] {
  const variation = opts.variation ?? 0.15;
  const personalization = opts.personalization ?? true;
  const salt = opts.salt ?? 0;

  if (!personalization) {
    return candidates.map((track, index) => ({
      track,
      score: hash(track.id + salt) * 10 + (candidates.length - index) * 0.01,
      reason: { key: "reason.discoverNew" },
    }));
  }

  return candidates
    .map((track) => scoreTrack(track, summary, variation, salt))
    .sort((a, b) => b.score - a.score);
}

/** Deterministic pseudo-random in [0, 1) — stable across reloads for one id. */
export function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function reasonLabel(reason: Reason | null, translate: (key: MessageKey, vars?: Record<string, string | number>) => string): string | null {
  if (!reason) return null;
  return translate(reason.key, reason.vars);
}
