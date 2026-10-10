import { Play } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { artistNames, bestThumb } from "../lib/format";
import type { AlbumItem, ArtistItem, PlaylistItem, Track } from "../types";

type Entity = Track | AlbumItem | ArtistItem | PlaylistItem;

interface MediaCardProps {
  kind: "track" | "album" | "artist" | "playlist";
  item: Entity;
  subtitle?: string | null;
  onPlay?: () => void;
  action?: ReactNode;
}

function hrefFor(kind: MediaCardProps["kind"], item: Entity): string | null {
  if (kind === "artist" && "id" in item && item.id) return `/artist/${item.id}`;
  if (kind === "album" && "id" in item && item.id) return `/album/${item.id}`;
  if (kind === "playlist" && "id" in item && item.id) return `/playlist/${item.id}`;
  return null;
}

export function MediaCard({ kind, item, subtitle, onPlay, action }: MediaCardProps) {
  const href = hrefFor(kind, item);
  const thumbnails = "thumbnails" in item ? item.thumbnails : [];
  const src = bestThumb(thumbnails, 300);

  const title =
    kind === "track" ? (item as Track).title : kind === "artist" ? (item as ArtistItem).name : ((item as AlbumItem).title ?? (item as PlaylistItem).title);

  const fallbackSubtitle =
    kind === "track"
      ? artistNames((item as Track).artists)
      : kind === "artist"
        ? (item as ArtistItem).subscribers
          ? `${(item as ArtistItem).subscribers} subscribers`
          : ""
        : kind === "album"
          ? [(item as AlbumItem).artists.map((artist) => artist.name).join(", "), (item as AlbumItem).year]
              .filter(Boolean)
              .join(" · ")
          : ((item as PlaylistItem).author ?? "");

  const body = (
    <>
      <div className={`card-art${kind === "artist" ? " round" : ""}`}>
        {src && <img src={src} alt="" loading="lazy" />}
        {onPlay && (
          <button
            type="button"
            className="icon-btn accent"
            aria-label={`Play ${title}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onPlay();
            }}
            style={{ position: "absolute", right: 8, bottom: 8 }}
          >
            <Play size={16} fill="currentColor" />
          </button>
        )}
      </div>
      <span className="card-title">{title}</span>
      <span className="card-sub">{subtitle ?? fallbackSubtitle}</span>
      {action}
    </>
  );

  if (href) {
    return (
      <Link className="card" to={href}>
        {body}
      </Link>
    );
  }

  if (onPlay) {
    return (
      <button type="button" className="card" onClick={onPlay} style={{ textAlign: "left" }}>
        {body}
      </button>
    );
  }

  return <div className="card">{body}</div>;
}
