export interface Thumbnail {
  url: string;
  width?: number | null;
  height?: number | null;
}

export interface ArtistRef {
  name: string;
  id: string | null;
}

export interface AlbumRef {
  name: string;
  id: string | null;
  thumbnails?: Thumbnail[];
}

export interface Track {
  id: string;
  title: string;
  artists: ArtistRef[];
  album: AlbumRef | null;
  duration: number | null;
  durationText?: string | null;
  thumbnails: Thumbnail[];
  views?: string | null;
  year?: string | null;
  explicit?: boolean;
  available?: boolean;
  source?: string;
}

export interface ArtistItem {
  id: string;
  name: string;
  subscribers?: string | null;
  monthlyListeners?: string | null;
  thumbnails: Thumbnail[];
  description?: string | null;
}

export interface AlbumItem {
  id: string | null;
  title: string;
  artists: ArtistRef[];
  year?: string | null;
  type?: string | null;
  thumbnails: Thumbnail[];
}

export interface PlaylistItem {
  id: string | null;
  title: string;
  author?: string | null;
  itemCount?: number | string | null;
  description?: string | null;
  thumbnails: Thumbnail[];
}

export type SearchKind = "track" | "artist" | "album" | "playlist";

export interface SearchEntry {
  kind: SearchKind;
  item: Track | ArtistItem | AlbumItem | PlaylistItem;
}

export interface HomeSection {
  title: string;
  items: { kind: "track" | "album" | "playlist"; item: Track | AlbumItem | PlaylistItem }[];
}

export interface LyricLine {
  text: string | null;
  startTimeMs: number | null;
  durationMs: number | null;
}

export interface Lyrics {
  available: boolean;
  synced: boolean;
  source: string;
  lines: LyricLine[];
  text: string;
}

export interface StreamMeta {
  videoId: string;
  ext: string;
  acodec: string;
  bitrate?: number | null;
  filesize?: number | null;
  contentType: string;
  expiresIn: number;
}

export type RepeatMode = "off" | "all" | "one";

export type Lang = "en" | "id";
