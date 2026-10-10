import { ArrowDown, ArrowUp, ListMusic, MoreHorizontal, Play, Shuffle, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Sheet } from "../components/Sheet";
import { ErrorState, SkeletonRows } from "../components/States";
import { TrackRow } from "../components/TrackRow";
import { useT } from "../hooks/useT";
import { api } from "../lib/api";
import { bestThumb } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { useUi } from "../stores/ui";
import type { Track } from "../types";

/**
 * Local playlists live in IndexedDB; everything else is fetched from YouTube
 * Music. The two shapes are merged into one view model below.
 */
export function PlaylistPage() {
  const { id = "" } = useParams();
  const t = useT();
  const playList = usePlayer((state) => state.playList);
  const enqueueMany = usePlayer((state) => state.enqueueMany);
  const toast = useUi((state) => state.toast);
  const openMenu = useUi((state) => state.openMenu);
  const local = useLibrary((state) => state.playlists.find((playlist) => playlist.id === id));
  const removeFromPlaylist = useLibrary((state) => state.removeFromPlaylist);
  const reorderPlaylist = useLibrary((state) => state.reorderPlaylist);
  const [manageOpen, setManageOpen] = useState(false);

  const isLocal = Boolean(local);
  const remote = useAsync(
    async () => (local ? { playlist: null, tracks: [], suggestions: [] } : api.playlist(id)),
    [id, isLocal],
  );

  if (!local && remote.loading) {
    return (
      <div className="page">
        <SkeletonRows count={6} />
      </div>
    );
  }
  if (!local && (remote.error || !remote.data)) {
    return <ErrorState title={t("error.generic")} body={remote.error?.message} onRetry={remote.reload} />;
  }

  const remotePlaylist = local ? null : (remote.data?.playlist ?? null);
  const tracks: Track[] = local ? local.tracks : (remote.data?.tracks ?? []);
  const suggestions: Track[] = remote.data?.suggestions ?? [];
  const title = local ? local.name : (remotePlaylist?.title ?? "");
  const author = remotePlaylist?.author ?? undefined;
  const art = bestThumb(remotePlaylist?.thumbnails ?? [], 600);

  return (
    <div className="page">
      <header className="page-header">
        <button
          type="button"
          className="icon-btn"
          aria-label={t("menu.viewDetails")}
          onClick={() =>
            tracks[0] ? openMenu({ track: tracks[0], playlistId: isLocal ? id : null }) : setManageOpen(true)
          }
        >
          <MoreHorizontal size={18} />
        </button>
        {isLocal && (
          <button type="button" className="icon-btn" aria-label={t("library.rename")} onClick={() => setManageOpen(true)}>
            <ListMusic size={18} />
          </button>
        )}
      </header>

      <div className="detail-hero">
        {art ? (
          <img className="detail-art" src={art} alt="" />
        ) : (
          <div className="detail-art" style={{ display: "grid", placeItems: "center", color: "var(--text-faint)" }}>
            <ListMusic size={44} />
          </div>
        )}
        <div>
          <h1 className="detail-title">{title}</h1>
          <p className="detail-sub">
            {[author, t("trackCount", { count: tracks.length }), isLocal ? t("library.localOnly") : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="detail-actions">
          <button type="button" className="btn primary" onClick={() => playList(tracks, 0)} disabled={!tracks.length}>
            <Play size={16} /> {t("action.playAll")}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("action.shuffle")}
            onClick={() => playList(tracks, 0, true)}
            disabled={!tracks.length}
          >
            <Shuffle size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("player.addToQueue")}
            onClick={() => {
              enqueueMany(tracks);
              toast(t("player.savedToQueue"));
            }}
            disabled={!tracks.length}
          >
            <ListMusic size={18} />
          </button>
        </div>
      </div>

      {tracks.length === 0 && <p className="page-subtitle">{t("library.empty.body")}</p>}

      <div className="list">
        {tracks.map((track, index) => (
          <div key={`${track.id}-${index}`} className="list-managed-row">
            <TrackRow track={track} tracks={tracks} index={index} showIndex />
            {isLocal && (
              <div className="list-manage-buttons">
                <button
                  type="button"
                  className="icon-btn ghost"
                  aria-label="Move up"
                  onClick={() => reorderPlaylist(id, index, Math.max(0, index - 1))}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn ghost"
                  aria-label="Move down"
                  onClick={() => reorderPlaylist(id, index, Math.min(tracks.length - 1, index + 1))}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {suggestions.length > 0 && (
        <section className="section" style={{ marginTop: 24 }}>
          <div className="section-head">
            <h2 className="section-title">{t("home.discoverNew")}</h2>
          </div>
          <div className="list">
            {suggestions.slice(0, 6).map((track) => (
              <TrackRow key={track.id} track={track} tracks={suggestions} />
            ))}
          </div>
        </section>
      )}

      <Sheet open={manageOpen} onClose={() => setManageOpen(false)} title={title}>
        <div className="list">
          <div className="sheet-item">{t("trackCount", { count: tracks.length })}</div>
          {isLocal && (
            <button
              type="button"
              className="sheet-item danger"
              onClick={() => {
                tracks.forEach((track) => removeFromPlaylist(id, track.id));
                setManageOpen(false);
                toast(t("library.delete"));
              }}
            >
              <Trash2 size={18} /> {t("library.removeFromPlaylist")}
            </button>
          )}
          <Link className="sheet-item" to="/library" onClick={() => setManageOpen(false)}>
            {t("nav.library")}
          </Link>
        </div>
      </Sheet>
    </div>
  );
}
