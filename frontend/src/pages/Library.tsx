import { Download, Heart, ListMusic, Play, Plus, Search, Trash2, Upload, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MediaCard } from "../components/MediaCard";
import { EmptyState } from "../components/States";
import { TrackRow } from "../components/TrackRow";
import { useT } from "../hooks/useT";
import { listLocalTracks, localToTrack, importLocalFile, type LocalTrack } from "../lib/localMusic";
import type { Track } from "../types";
import { useLibrary } from "../stores/library";
import { useHistory } from "../stores/history";
import { usePlayer } from "../stores/player";
import { useUi } from "../stores/ui";

export function LibraryPage() {
  const t = useT();
  const navigate = useNavigate();
  const toast = useUi((state) => state.toast);
  const playList = usePlayer((state) => state.playList);

  const liked = useLibrary((state) => state.liked);
  const playlists = useLibrary((state) => state.playlists);
  const followed = useLibrary((state) => state.followed);
  const savedAlbums = useLibrary((state) => state.savedAlbums);
  const cached = useLibrary((state) => state.cached);
  const createPlaylist = useLibrary((state) => state.createPlaylist);
  const deletePlaylist = useLibrary((state) => state.deletePlaylist);
  const renamePlaylist = useLibrary((state) => state.renamePlaylist);

  const plays = useHistory((state) => state.plays);

  const [localFiles, setLocalFiles] = useState<LocalTrack[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);

  useEffect(() => {
    void listLocalTracks().then(setLocalFiles);
  }, []);

  const localTracks = useMemo(() => localFiles.map(localToTrack), [localFiles]);

  const topTracks = useMemo(() => {
    const counts = new Map<string, { track: Track; plays: number; completed: number }>();
    for (const play of plays) {
      if (!play.track) continue;
      const entry = counts.get(play.trackId) ?? { track: play.track, plays: 0, completed: 0 };
      entry.plays += play.completed ? 2 : 1;
      entry.completed += play.completed ? 1 : 0;
      counts.set(play.trackId, entry);
    }
    return [...counts.values()].sort((a, b) => b.plays - a.plays).slice(0, 50).map((entry) => entry.track);
  }, [plays]);

  const recentTracks = useMemo(
    () => plays.map((play) => play.track).filter((track): track is Track => Boolean(track)).slice(0, 20),
    [plays],
  );

  const cachedTracks = useMemo(
    () => [...liked, ...recentTracks].filter((track, index, all) => all.findIndex((entry) => entry.id === track.id) === index && cached.includes(track.id)),
    [liked, recentTracks, cached],
  );

  const recentSearches = useHistory((state) => state.searches);

  const hasAnything =
    liked.length || playlists.length || followed.length || savedAlbums.length || localFiles.length || recentTracks.length;

  const handleImport = async (files: FileList | null) => {
    if (!files?.length) return;
    let imported = 0;
    for (const file of Array.from(files)) {
      try {
        await importLocalFile(file);
        imported += 1;
      } catch {
        toast(`${t("error.generic")}: ${file.name}`, "error");
      }
    }
    if (imported) {
      setLocalFiles(await listLocalTracks());
      toast(`${t("library.downloads")} · ${imported}`);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t("library.title")}</h1>
          <p className="page-subtitle">{t("library.localOnly")}</p>
        </div>
        <button
          type="button"
          className="icon-btn accent"
          aria-label={t("library.createPlaylist")}
          onClick={() => setCreating((value) => !value)}
        >
          <Plus size={20} />
        </button>
      </header>

      {creating && (
        <div className="settings-group" style={{ padding: 16 }}>
          <div className="field">
            <label htmlFor="playlist-name">{t("library.playlistName")}</label>
            <input
              id="playlist-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("library.newPlaylist")}
              autoFocus
            />
          </div>
          <button
            type="button"
            className="btn primary block"
            disabled={!name.trim()}
            onClick={() => {
              const created = createPlaylist(name);
              if (created) {
                toast(`${t("library.createPlaylist")} · ${created.name}`);
                setName("");
                setCreating(false);
                navigate(`/playlist/${created.id}`);
              }
            }}
          >
            {t("library.save")}
          </button>
        </div>
      )}

      {!hasAnything && (
        <EmptyState
          title={t("library.empty.title")}
          body={t("library.empty.body")}
          action={
            <Link to="/search" className="btn primary">
              <Search size={16} /> {t("search.title")}
            </Link>
          }
        />
      )}

      {topTracks.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("library.top50")}</h2>
            <span className="section-hint">{topTracks.length}</span>
          </div>
          <div className="list">
            {topTracks.slice(0, 10).map((track, index) => (
              <TrackRow key={track.id} track={track} tracks={topTracks} index={index} showIndex />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">{t("library.liked")}</h2>
          <span className="section-hint">{liked.length}</span>
        </div>
        {liked.length === 0 ? (
          <EmptyState title={t("empty")} body={t("library.empty.body")} icon={<Heart size={30} />} />
        ) : (
          <div className="list">
            {liked.slice(0, 8).map((track) => (
              <TrackRow key={track.id} track={track} tracks={liked} />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">{t("library.downloads")}</h2>
          <label className="btn" style={{ cursor: "pointer" }}>
            <Upload size={16} /> {t("library.uploaded")}
            <input
              type="file"
              accept="audio/*"
              multiple
              hidden
              onChange={(event) => void handleImport(event.target.files)}
            />
          </label>
        </div>
        <p className="section-hint" style={{ marginBottom: 8 }}>
          {t("settings.downloadsDesc")}
        </p>
        {localTracks.length === 0 ? (
          <EmptyState title={t("empty")} body={t("settings.downloadsDesc")} icon={<Download size={30} />} />
        ) : (
          <div className="list">
            {localTracks.map((track) => (
              <TrackRow key={track.id} track={track} tracks={localTracks} />
            ))}
          </div>
        )}
      </section>

      {cachedTracks.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("library.cached")}</h2>
            <span className="section-hint">{t("settings.cache")}</span>
          </div>
          <div className="list">
            {cachedTracks.slice(0, 6).map((track) => (
              <TrackRow key={track.id} track={track} tracks={cachedTracks} />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">{t("library.savedPlaylists")}</h2>
          <span className="section-hint">{playlists.length}</span>
        </div>
        {playlists.length === 0 ? (
          <EmptyState title={t("empty")} body={t("library.createPlaylist")} icon={<ListMusic size={30} />} />
        ) : (
          <div className="list">
            {playlists.map((playlist) => (
              <div key={playlist.id} className="track-row">
                <button type="button" className="icon-btn ghost" aria-label={t("player.play")} onClick={() => playList(playlist.tracks, 0)}>
                  <Play size={18} />
                </button>
                <button type="button" className="track-main" style={{ textAlign: "left" }} onClick={() => navigate(`/playlist/${playlist.id}`)}>
                  <span className="track-title">{playlist.name}</span>
                  <span className="track-meta">{t("trackCount", { count: playlist.tracks.length })}</span>
                </button>
                <div className="track-side">
                  <button
                    type="button"
                    className="icon-btn ghost"
                    aria-label={t("library.rename")}
                    onClick={() => setRenaming(renaming === playlist.id ? null : playlist.id)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="icon-btn ghost"
                    aria-label={t("library.delete")}
                    onClick={() => deletePlaylist(playlist.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {renaming === playlist.id && (
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, marginTop: 8 }}>
                    <input
                      className="input"
                      defaultValue={playlist.name}
                      aria-label={t("library.rename")}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          renamePlaylist(playlist.id, (event.target as HTMLInputElement).value);
                          setRenaming(null);
                        }
                      }}
                      autoFocus
                    />
                    <button type="button" className="btn" onClick={() => setRenaming(null)}>
                      {t("library.save")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">{t("library.followed")}</h2>
          <span className="section-hint">{followed.length}</span>
        </div>
        {followed.length === 0 ? (
          <EmptyState title={t("empty")} body={t("action.follow")} icon={<User size={30} />} />
        ) : (
          <div className="h-scroll">
            {followed.map((artist) => (
              <MediaCard key={artist.id} kind="artist" item={artist} />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">{t("library.savedAlbums")}</h2>
          <span className="section-hint">{savedAlbums.length}</span>
        </div>
        {savedAlbums.length === 0 ? (
          <EmptyState title={t("empty")} body={t("action.save")} />
        ) : (
          <div className="h-scroll">
            {savedAlbums.map((album) => (
              <MediaCard key={album.id ?? album.title} kind="album" item={album} />
            ))}
          </div>
        )}
      </section>

      {recentTracks.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("library.recent")}</h2>
          </div>
          <div className="list">
            {recentTracks.slice(0, 8).map((track, index) => (
              <TrackRow key={`${track.id}-${index}`} track={track} tracks={recentTracks} />
            ))}
          </div>
        </section>
      )}

      {recentSearches.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("search.recent")}</h2>
          </div>
          <div className="chip-row">
            {recentSearches.map((entry) => (
              <Link key={entry} className="chip" to={`/search?q=${encodeURIComponent(entry)}`}>
                {entry}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
