import {
  Disc3,
  ListPlus,
  ListStart,
  Music2,
  Pause,
  Play,
  Radio,
  Share2,
  Trash2,
  User,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useT } from "../hooks/useT";
import { api } from "../lib/api";
import { useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { useUi } from "../stores/ui";
import { Sheet } from "./Sheet";

type MenuEntry = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  meta?: string;
};

/** Actions available for a track; the list changes with the object it was opened for. */
export function SongMenu() {
  const t = useT();
  const navigate = useNavigate();
  const menu = useUi((state) => state.menu);
  const closeMenu = useUi((state) => state.closeMenu);
  const toast = useUi((state) => state.toast);
  const setPlaylistPicker = useUi((state) => state.setPlaylistPicker);
  const setDetailsTrack = useUi((state) => state.setDetailsTrack);
  const announce = useUi((state) => state.announceText);

  const enqueue = usePlayer((state) => state.enqueue);
  const enqueueNext = usePlayer((state) => state.enqueueNext);
  const playList = usePlayer((state) => state.playList);
  const openFull = usePlayer((state) => state.openFull);
  const loadLyrics = usePlayer((state) => state.loadLyrics);

  const liked = useLibrary((state) => (menu ? state.liked.some((entry) => entry.id === menu.track.id) : false));
  const toggleLike = useLibrary((state) => state.toggleLike);
  const removeFromPlaylist = useLibrary((state) => state.removeFromPlaylist);
  const saved = useLibrary((state) => (menu ? state.isSavedAlbum(menu.albumId ?? null) : false));
  const toggleAlbum = useLibrary((state) => state.toggleAlbum);
  const playlistCount = useLibrary((state) => state.playlists.length);

  if (!menu) return null;
  const { track, artistId, albumId, playlistId } = menu;

  let entries: MenuEntry[] = [
    {
      key: "radio",
      label: t("menu.startRadio"),
      icon: <Radio size={18} />,
      onSelect: async () => {
        try {
          const context = await api.watch(track.id);
          const tracks = [track, ...context.tracks.filter((entry) => entry.id !== track.id)];
          playList(tracks, 0);
          closeMenu();
        } catch {
          toast(t("player.error"), "error");
        }
      },
    },
    { key: "next", label: t("player.playNext"), icon: <ListStart size={18} />, onSelect: () => { enqueueNext(track); toast(t("player.savedPlayNext")); closeMenu(); } },
    { key: "queue", label: t("player.addToQueue"), icon: <ListPlus size={18} />, onSelect: () => { enqueue(track); toast(t("player.savedToQueue")); closeMenu(); } },
    { key: "playlist", label: t("menu.addToPlaylist"), icon: <Music2 size={18} />, onSelect: () => { setPlaylistPicker(track); closeMenu(); } },
    {
      key: "like",
      label: liked ? t("menu.unlike") : t("menu.like"),
      icon: <Zap size={18} />,
      onSelect: () => {
        const added = toggleLike(track);
        announce(added ? t("player.like") : t("player.unlike"));
        closeMenu();
      },
    },
    {
      key: "artist",
      label: t("menu.viewArtist"),
      icon: <User size={18} />,
      onSelect: () => {
        if (artistId) navigate(`/artist/${artistId}`);
        closeMenu();
      },
      meta: track.artists[0]?.name,
    },
    {
      key: "album",
      label: t("menu.viewAlbum"),
      icon: <Disc3 size={18} />,
      onSelect: () => {
        if (albumId) navigate(`/album/${albumId}`);
        closeMenu();
      },
      meta: track.album?.name ?? undefined,
    },
    {
      key: "save-album",
      label: saved ? t("action.unsave") : t("action.save"),
      icon: <Disc3 size={18} />,
      onSelect: () => {
        if (albumId) {
          toggleAlbum({ id: albumId, title: track.album?.name ?? albumId, artists: track.artists, thumbnails: track.thumbnails, year: null, type: null });
          toast(saved ? t("action.unsave") : t("action.save"));
        }
        closeMenu();
      },
    },
    {
      key: "details",
      label: t("menu.viewDetails"),
      icon: <Play size={18} />,
      onSelect: () => {
        setDetailsTrack(track);
        closeMenu();
      },
    },
    {
      key: "lyrics",
      label: t("menu.openLyrics"),
      icon: <Music2 size={18} />,
      onSelect: () => {
        void loadLyrics(true);
        openFull();
        closeMenu();
      },
    },
    {
      key: "share",
      label: t("action.share"),
      icon: <Share2 size={18} />,
      onSelect: async () => {
        const url = `https://music.youtube.com/watch?v=${track.id}`;
        try {
          if (navigator.share) await navigator.share({ title: track.title, url });
          else {
            await navigator.clipboard.writeText(url);
            toast(t("action.copied"));
          }
        } catch {
          toast(t("error.generic"), "error");
        }
        closeMenu();
      },
    },
  ];

  if (playlistId) {
    entries.push({
      key: "remove-playlist",
      label: t("library.removeFromPlaylist"),
      icon: <Trash2 size={18} />,
      danger: true,
      onSelect: () => {
        removeFromPlaylist(playlistId, track.id);
        closeMenu();
      },
    });
  }

  if (!albumId) entries = entries.filter((entry) => entry.key !== "save-album" && entry.key !== "album");
  if (!artistId) entries = entries.filter((entry) => entry.key !== "artist");

  return (
    <Sheet open onClose={closeMenu} title={track.title} labelledBy="song-menu-title">
      <p className="page-subtitle" style={{ marginTop: -8, marginBottom: 12 }}>
        {track.artists.map((artist) => artist.name).join(", ")}
        {playlistCount === 0 && <span className="section-hint"> · {t("library.empty.body")}</span>}
      </p>
      <div className="list">
        {entries.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={`sheet-item${entry.danger ? " danger" : ""}`}
            onClick={entry.onSelect}
          >
            <span aria-hidden="true">{entry.icon}</span>
            {entry.label}
            {entry.meta && <span className="muted">{entry.meta}</span>}
          </button>
        ))}
      </div>
      <button type="button" className="sheet-item" onClick={closeMenu} style={{ justifyContent: "center", color: "var(--text-muted)" }}>
        <Pause size={18} /> {t("library.cancel")}
      </button>
    </Sheet>
  );
}
