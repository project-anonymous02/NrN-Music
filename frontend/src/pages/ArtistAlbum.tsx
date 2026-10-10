import { Disc3, MoreHorizontal, Play, Shuffle, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Sheet } from "../components/Sheet";
import { ErrorState, SkeletonRows } from "../components/States";
import { TrackRow } from "../components/TrackRow";
import { MediaCard } from "../components/MediaCard";
import { useT } from "../hooks/useT";
import { api } from "../lib/api";
import { artistNames, bestThumb } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { useUi } from "../stores/ui";

export function ArtistPage() {
  const { id = "" } = useParams();
  const t = useT();
  const playList = usePlayer((state) => state.playList);
  const enqueueMany = usePlayer((state) => state.enqueueMany);
  const followed = useLibrary((state) => state.isFollowed(id));
  const toggleFollow = useLibrary((state) => state.toggleFollow);
  const toast = useUi((state) => state.toast);
  const [menuOpen, setMenuOpen] = useState(false);

  const { data, loading, error, reload } = useAsync(() => api.artist(id), [id]);

  if (loading) {
    return (
      <div className="page">
        <SkeletonRows count={6} />
      </div>
    );
  }
  if (error || !data) {
    return <ErrorState title={t("error.generic")} body={error?.message} onRetry={reload} />;
  }

  const { artist, topSongs, albums, singles, related } = data;
  const art = bestThumb(artist.thumbnails, 600);

  return (
    <div className="page">
      <header className="page-header">
        <button type="button" className="icon-btn" aria-label={t("menu.viewDetails")} onClick={() => setMenuOpen(true)}>
          <MoreHorizontal size={18} />
        </button>
      </header>

      <div className="detail-hero">
        {art && <img className="detail-art round" src={art} alt="" />}
        <div>
          <h1 className="detail-title">{artist.name}</h1>
          <p className="detail-sub">
            {[artist.subscribers && `${artist.subscribers}`, artist.monthlyListeners && `${artist.monthlyListeners} monthly listeners`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="detail-actions">
          <button
            type="button"
            className={`btn${followed ? "" : " primary"}`}
            onClick={() => {
              toggleFollow(artist);
              toast(followed ? t("action.unfollow") : t("action.follow"));
            }}
          >
            {followed ? <UserMinus size={16} /> : <UserPlus size={16} />}
            {followed ? t("action.unfollow") : t("action.follow")}
          </button>
          <button type="button" className="btn primary" onClick={() => playList(topSongs, 0)} disabled={!topSongs.length}>
            <Play size={16} /> {t("action.playAll")}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("action.shuffle")}
            onClick={() => playList(topSongs, 0, true)}
            disabled={!topSongs.length}
          >
            <Shuffle size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("player.addToQueue")}
            onClick={() => {
              enqueueMany(topSongs);
              toast(t("player.savedToQueue"));
            }}
            disabled={!topSongs.length}
          >
            <Disc3 size={18} />
          </button>
        </div>
      </div>

      {topSongs.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("home.topSongs")}</h2>
          </div>
          <div className="list">
            {topSongs.map((track, index) => (
              <TrackRow key={track.id} track={track} tracks={topSongs} index={index} showIndex />
            ))}
          </div>
        </section>
      )}

      {albums.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("filter.albums")}</h2>
          </div>
          <div className="h-scroll">
            {albums.map((album) => (
              <MediaCard key={album.id ?? album.title} kind="album" item={album} />
            ))}
          </div>
        </section>
      )}

      {singles.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("filter.songs")}</h2>
          </div>
          <div className="h-scroll">
            {singles.map((album) => (
              <MediaCard key={album.id ?? album.title} kind="album" item={album} />
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t("home.discoverNew")}</h2>
          </div>
          <div className="h-scroll">
            {related.map((entry) => (
              <MediaCard key={entry.id} kind="artist" item={entry} />
            ))}
          </div>
        </section>
      )}

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={artist.name}>
        <div className="list">
          <button
            type="button"
            className="sheet-item"
            onClick={() => {
              navigator.clipboard?.writeText(`https://music.youtube.com/channel/${artist.id}`);
              toast(t("action.copied"));
              setMenuOpen(false);
            }}
          >
            {t("action.share")}
          </button>
          <button type="button" className="sheet-item" onClick={() => setMenuOpen(false)}>
            {t("menu.viewDetails")}
            <span className="muted">{artist.id}</span>
          </button>
        </div>
      </Sheet>
    </div>
  );
}

export function AlbumPage() {
  const { id = "" } = useParams();
  const t = useT();
  const playList = usePlayer((state) => state.playList);
  const enqueueMany = usePlayer((state) => state.enqueueMany);
  const saved = useLibrary((state) => state.isSavedAlbum(id));
  const toggleAlbum = useLibrary((state) => state.toggleAlbum);
  const openMenu = useUi((state) => state.openMenu);
  const toast = useUi((state) => state.toast);

  const { data, loading, error, reload } = useAsync(() => api.album(id), [id]);

  if (loading) return <div className="page"><SkeletonRows count={6} /></div>;
  if (error || !data) return <ErrorState title={t("error.generic")} body={error?.message} onRetry={reload} />;

  const { album, tracks } = data;
  const art = bestThumb(album.thumbnails, 600);

  return (
    <div className="page">
      <header className="page-header">
        <button
          type="button"
          className="icon-btn"
          aria-label={t("menu.viewDetails")}
          onClick={() => openMenu({ track: tracks[0], albumId: id, artistId: tracks[0]?.artists[0]?.id ?? null })}
          disabled={!tracks.length}
        >
          <MoreHorizontal size={18} />
        </button>
      </header>

      <div className="detail-hero">
        {art && <img className="detail-art" src={art} alt="" />}
        <div>
          <h1 className="detail-title">{album.title}</h1>
          <p className="detail-sub">
            {[artistNames(album.artists), album.year, album.durationText].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="detail-actions">
          <button type="button" className="btn primary" onClick={() => playList(tracks, 0)} disabled={!tracks.length}>
            <Play size={16} /> {t("action.playAll")}
          </button>
          <button type="button" className="icon-btn" aria-label={t("action.shuffle")} onClick={() => playList(tracks, 0, true)} disabled={!tracks.length}>
            <Shuffle size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={saved ? t("action.unsave") : t("action.save")}
            onClick={() => {
              toggleAlbum(album);
              toast(saved ? t("action.unsave") : t("action.save"));
            }}
            style={{ color: saved ? "var(--accent)" : undefined }}
          >
            <Disc3 size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("player.addToQueue")}
            onClick={() => {
              enqueueMany(tracks);
              toast(t("player.savedToQueue"));
            }}
          >
            ▚
          </button>
        </div>
      </div>

      <div className="list">
        {tracks.map((track, index) => (
          <TrackRow
            key={track.id}
            track={{ ...track, album: { name: album.title, id: album.id ?? null } }}
            tracks={tracks}
            index={index}
            showIndex
          />
        ))}
      </div>
    </div>
  );
}
