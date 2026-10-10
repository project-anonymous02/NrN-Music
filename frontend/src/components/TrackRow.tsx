import { MoreHorizontal, Play } from "lucide-react";
import { artistNames, bestThumb, formatTime } from "../lib/format";
import { usePlayer } from "../stores/player";
import { useUi } from "../stores/ui";
import type { Track } from "../types";

interface TrackRowProps {
  track: Track;
  tracks: Track[];
  index?: number;
  showArt?: boolean;
  showIndex?: boolean;
  reason?: string | null;
  onRemove?: () => void;
}

export function TrackRow({ track, tracks, index, showArt = true, showIndex = false, reason, onRemove }: TrackRowProps) {
  const playList = usePlayer((state) => state.playList);
  const current = usePlayer((state) => state.queue.tracks[state.queue.index]);
  const openMenu = useUi((state) => state.openMenu);
  const isCurrent = current?.id === track.id;

  const handlePlay = () => {
    const startIndex = Math.max(0, tracks.findIndex((entry) => entry.id === track.id));
    playList(tracks, startIndex);
  };

  const artistId = track.artists.find((artist) => artist.id)?.id ?? null;

  return (
    <div className={`track-row${isCurrent ? " playing" : ""}`}>
      {showIndex && typeof index === "number" ? (
        <span className="track-index">{index + 1}</span>
      ) : showArt ? (
        <button type="button" onClick={handlePlay} aria-label={`Play ${track.title}`} className="icon-btn ghost">
          {bestThumb(track.thumbnails, 120) ? (
            <img className="track-thumb" src={bestThumb(track.thumbnails, 120)} alt="" loading="lazy" />
          ) : (
            <Play size={18} />
          )}
        </button>
      ) : (
        <span className="track-index">{isCurrent ? "▶" : ""}</span>
      )}

      <button
        type="button"
        className="track-main"
        onClick={handlePlay}
        style={{ textAlign: "left", background: "none" }}
      >
        <span className="track-title">{track.title}</span>
        <span className="track-meta">
          {track.explicit && <span className="badge neutral">E</span>}
          {artistNames(track.artists) || track.album?.name || ""}
        </span>
        {reason && <span className="section-hint">{reason}</span>}
      </button>

      <div className="track-side">
        <span>{track.durationText ?? formatTime(track.duration)}</span>
        <button
          type="button"
          className="icon-btn ghost"
          aria-label="More actions"
          onClick={() => openMenu({ track, artistId, albumId: track.album?.id ?? null })}
        >
          <MoreHorizontal size={18} />
        </button>
        {onRemove && (
          <button type="button" className="icon-btn ghost" aria-label="Remove" onClick={onRemove}>
            ×
          </button>
        )}
      </div>
    </div>
  );
}
