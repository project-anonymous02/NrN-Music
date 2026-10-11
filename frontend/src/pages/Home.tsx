import { Clock, Download, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MediaCard } from "../components/MediaCard";
import { SkeletonCards, SkeletonRows, EmptyState } from "../components/States";
import { TrackRow } from "../components/TrackRow";
import { useT } from "../hooks/useT";
import { api, type SearchResponse } from "../lib/api";
import { getApiBase } from "../lib/api";
import { artistNames } from "../lib/format";
import { ensureBackend } from "../lib/discovery";
import { isNative, probeBackend } from "../lib/discovery";
import { rankCandidates, reasonLabel, summarize } from "../lib/recommend";
import { useAsync } from "../lib/useAsync";
import { useHistory } from "../stores/history";
import { usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import { listLocalTracks, localToTrack, type LocalTrack } from "../lib/localMusic";
import type { HomeSection, PlaylistItem, Track } from "../types";

type HomeData = {
  sections: HomeSection[];
  charts: Awaited<ReturnType<typeof api.charts>>;
  explore: Awaited<ReturnType<typeof api.explore>>;
  discovery: SearchResponse;
};

function greetingKey(): "home.greeting.morning" | "home.greeting.afternoon" | "home.greeting.evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "home.greeting.morning";
  if (hour < 18) return "home.greeting.afternoon";
  return "home.greeting.evening";
}

export function HomePage() {
  const t = useT();
  const playList = usePlayer((state) => state.playList);
  const plays = useHistory((state) => state.plays);
  const [localFiles, setLocalFiles] = useState<LocalTrack[]>([]);
  const personalization = useSettings((state) => state.settings.privacy.personalization);
  const variation = useSettings((state) => state.settings.privacy.variation);

  const { data, loading, error, reload } = useAsync<HomeData>(async () => {
    if (isNative() && !(await probeBackend(getApiBase(), 1200))) {
      throw new Error("Online catalog is unavailable.");
    }
    const [sections, charts, explore, discovery] = await Promise.all([
      api.home(8),
      api.charts(),
      api.explore(),
      api.search("instrumental chill", "playlists", 8),
    ]);
    return { sections: sections.sections, charts, explore, discovery };
  }, []);

  useEffect(() => {
    let active = true;
    void listLocalTracks().then((files) => active && setLocalFiles(files));
    const onBackendFound = () => reload();
    window.addEventListener("nrn:backend-found", onBackendFound);
    return () => {
      active = false;
      window.removeEventListener("nrn:backend-found", onBackendFound);
    };
  }, [reload]);

  const firstTime = plays.length === 0 && !loading && !error;

  const recentTracks = useMemo(
    () => plays.map((play) => play.track).filter((track): track is Track => Boolean(track)).slice(0, 8),
    [plays],
  );
  const recentLocal = useMemo(
    () => plays.filter((play) => play.track?.source === "local").slice(0, 6),
    [plays],
  );

  const forYou = useMemo(() => {
    if (!personalization || plays.length === 0) return [];
    const summary = summarize(plays);
    const pool = [
      ...(data?.sections.flatMap((section) => section.items.filter((item) => item.kind === "track").map((item) => item.item as Track)) ?? []),
      ...(data?.explore.newVideos ?? []),
      ...(data?.discovery.results.filter((entry) => entry.kind === "track").map((entry) => entry.item as Track) ?? []),
    ];
    const unique = Array.from(new Map(pool.map((track) => [track.id, track])).values()).slice(0, 40);
    return rankCandidates(unique, summary, { variation: variation / 100 }).slice(0, 8);
  }, [data, plays, personalization, variation]);

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">{t(greetingKey())}</h1>
        </div>
        <SkeletonCards count={5} />
        <div style={{ height: 24 }} />
        <SkeletonRows count={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page page-offline">
        <header className="page-header">
          <div>
            <p className="page-subtitle">{t(greetingKey())}</p>
            <h1 className="page-title">{t("app.name")}</h1>
          </div>
          <Link to="/settings" className="icon-btn" aria-label={t("settings.title")}>
            <SettingsIcon size={18} />
          </Link>
        </header>

        <section className="offline-note" role="status">
          <span className="offline-indicator" aria-hidden="true" />
          <div>
            <strong>{t("home.offlineTitle")}</strong>
            <p>{t("home.offlineHint")}</p>
          </div>
          <button type="button" className="btn compact" onClick={() => void ensureBackend().finally(reload)}>
            {t("error.retry")}
          </button>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("home.onDevice")}</h2>
            <Link to="/library" className="section-hint">{t("showAll")}</Link>
          </div>
          {localFiles.length ? (
            <div className="list">
              {localFiles.slice(0, 8).map((file) => {
                const track = localToTrack(file);
                return <TrackRow key={track.id} track={track} tracks={localFiles.map(localToTrack)} />;
              })}
            </div>
          ) : (
            <div className="offline-library-empty">
              <Download size={20} aria-hidden="true" />
              <div>
                <strong>{t("home.noLocalMusic")}</strong>
                <p>{t("home.addLocalMusic")}</p>
              </div>
              <Link to="/library" className="btn primary">{t("library.title")}</Link>
            </div>
          )}
        </section>

        <section className="section offline-recent">
          <div className="section-head"><h2 className="section-title">{t("home.recentlyPlayed")}</h2></div>
          {recentLocal.length ? (
            <div className="list">
              {recentLocal.map((play, index) => play.track ? (
                <TrackRow key={`${play.trackId}-${play.ts}-${index}`} track={play.track} tracks={[play.track]} />
              ) : null)}
            </div>
          ) : (
            <p className="section-hint">{t("home.nothingPlayed")}</p>
          )}
        </section>
      </div>
    );
  }

  const chartPlaylists: PlaylistItem[] = data?.charts.playlists ?? [];
  const popularArtists = data?.charts.artists ?? [];

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-subtitle">{t(greetingKey())}</p>
          <h1 className="page-title">{t("app.name")}</h1>
        </div>
        <Link to="/settings" className="icon-btn" aria-label={t("settings.title")}>
          <SettingsIcon size={18} />
        </Link>
      </header>

      {recentTracks.length > 0 && (
        <section className="section home-continue">
          <div className="section-head">
            <h2 className="section-title">{t("home.recentlyPlayed")}</h2>
            <span className="section-hint"><Clock size={12} /> {recentTracks.length}</span>
          </div>
          <div className="list">
            {recentTracks.slice(0, 4).map((track, index) => (
              <TrackRow key={`${track.id}-${index}`} track={track} tracks={recentTracks} index={index} />
            ))}
          </div>
        </section>
      )}

      {firstTime && (
        <section className="section">
          <div className="state" style={{ padding: "24px 8px 8px", textAlign: "left", alignItems: "flex-start" }}>
            <Sparkles size={30} style={{ color: "var(--accent)" }} />
            <h3 style={{ fontSize: "var(--text-xl)" }}>{t("home.discover.first")}</h3>
            <p>{t("home.discover.hint")}</p>
            <Link to="/search" className="btn primary">
              {t("search.title")}
            </Link>
          </div>
        </section>
      )}

      {forYou.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("home.similarToFavorites")}</h2>
            <span className="section-hint">{t("settings.personalization")}</span>
          </div>
          <div className="list">
            {forYou.map(({ track, reason }) => (
              <TrackRow
                key={track.id}
                track={track}
                tracks={forYou.map((entry) => entry.track)}
                reason={reasonLabel(reason, t)}
              />
            ))}
          </div>
        </section>
      )}

      {chartPlaylists.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("home.topSongs")}</h2>
            <span className="section-hint">{t("home.charts")}</span>
          </div>
          <div className="h-scroll">
            {chartPlaylists.slice(0, 8).map((playlist) => (
              <MediaCard key={playlist.id} kind="playlist" item={playlist} />
            ))}
          </div>
        </section>
      )}

      {popularArtists.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("home.popularArtists")}</h2>
          </div>
          <div className="h-scroll">
            {popularArtists.slice(0, 10).map((artist) => (
              <MediaCard key={artist.id} kind="artist" item={artist} />
            ))}
          </div>
        </section>
      )}

      {data?.sections.map((section, index) => (
        <HorizontalSection key={`${section.title}-${index}`} section={section} label={section.title} onPlay={playList} />
      ))}

      {data && data.explore.newReleases.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("home.newReleases")}</h2>
          </div>
          <div className="h-scroll">
            {data.explore.newReleases.slice(0, 10).map((album) => (
              <MediaCard key={album.id ?? album.title} kind="album" item={album} />
            ))}
          </div>
        </section>
      )}

      {data && data.explore.trending.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("home.trending")}</h2>
          </div>
          <div className="h-scroll">
            {data.explore.trending.slice(0, 10).map((playlist) => (
              <MediaCard key={playlist.id} kind="playlist" item={playlist} />
            ))}
          </div>
        </section>
      )}

      {data && data.discovery.results.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("home.instrumental")}</h2>
          </div>
          <div className="h-scroll">
            {data.discovery.results
              .filter((entry) => entry.kind === "playlist")
              .slice(0, 10)
              .map((entry) => (
                <MediaCard key={(entry.item as PlaylistItem).id ?? (entry.item as PlaylistItem).title} kind="playlist" item={entry.item as PlaylistItem} />
              ))}
          </div>
        </section>
      )}

      {!firstTime && recentTracks.length === 0 && forYou.length === 0 && (
        <EmptyState title={t("empty")} body={t("search.empty.body")} />
      )}
    </div>
  );
}

function HorizontalSection({
  section,
  label,
  onPlay,
}: {
  section: HomeSection;
  label: string;
  onPlay: (tracks: Track[], index?: number) => void;
}) {
  const tracks = section.items.filter((item) => item.kind === "track").map((item) => item.item as Track);
  const others = section.items.filter((item) => item.kind !== "track");

  if (!tracks.length && !others.length) return null;

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{label}</h2>
        {tracks.length > 0 && (
          <button type="button" className="section-hint" onClick={() => onPlay(tracks, 0)}>
            ▶ {tracks.length}
          </button>
        )}
      </div>
      <div className="h-scroll">
        {tracks.map((track) => (
          <MediaCard
            key={track.id}
            kind="track"
            item={track}
            subtitle={artistNames(track.artists)}
            onPlay={() => onPlay(tracks, tracks.findIndex((entry) => entry.id === track.id))}
          />
        ))}
        {others.map((entry, index) =>
          entry.kind === "album" ? (
            <MediaCard key={`${entry.item.id ?? index}`} kind="album" item={entry.item} />
          ) : (
            <MediaCard key={`${entry.item.id ?? index}`} kind="playlist" item={entry.item} />
          ),
        )}
      </div>
    </section>
  );
}
