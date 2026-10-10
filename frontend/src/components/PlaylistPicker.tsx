import { useState } from "react";
import { useT } from "../hooks/useT";
import { useLibrary } from "../stores/library";
import { useUi } from "../stores/ui";
import { Sheet } from "./Sheet";

/** "Add to playlist" picker — creates a playlist inline when none exist. */
export function PlaylistPicker() {
  const t = useT();
  const track = useUi((state) => state.playlistPicker);
  const setTrack = useUi((state) => state.setPlaylistPicker);
  const toast = useUi((state) => state.toast);
  const playlists = useLibrary((state) => state.playlists);
  const addToPlaylist = useLibrary((state) => state.addToPlaylist);
  const createPlaylist = useLibrary((state) => state.createPlaylist);
  const [name, setName] = useState("");

  const close = () => setTrack(null);

  return (
    <Sheet open={Boolean(track)} onClose={close} title={t("menu.addToPlaylist")}>
      {playlists.length > 0 && (
        <div className="list" style={{ marginBottom: 16 }}>
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              className="sheet-item"
              onClick={() => {
                if (track) addToPlaylist(playlist.id, track);
                toast(`${t("library.save")} · ${playlist.name}`);
                close();
              }}
            >
              {playlist.name}
              <span className="muted">{playlist.tracks.length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="field">
        <label htmlFor="new-playlist-name">{t("library.playlistName")}</label>
        <input
          id="new-playlist-name"
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("library.newPlaylist")}
        />
      </div>
      <button
        type="button"
        className="btn primary block"
        onClick={() => {
          const created = createPlaylist(name, track ? [track] : []);
          if (created) {
            toast(`${t("library.createPlaylist")} · ${created.name}`);
            setName("");
            close();
          }
        }}
        disabled={!name.trim()}
      >
        {t("library.createPlaylist")}
      </button>
    </Sheet>
  );
}
