import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { FullPlayer } from "./FullPlayer";
import { MiniPlayer } from "./MiniPlayer";
import { PlaylistPicker } from "./PlaylistPicker";
import { SongMenu } from "./SongMenu";
import { Toasts } from "./Toasts";
import { usePlayer } from "../stores/player";

export function AppShell() {
  const location = useLocation();
  const hasTrack = usePlayer((state) => state.queue.tracks.length > 0);
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  return (
    <div className="app-shell">
      <main className={`app-main${hasTrack ? "" : " no-player"}`} key={location.pathname}>
        <Outlet />
      </main>

      <MiniPlayer />
      <BottomNav />
      <FullPlayer />
      <SongMenu />
      <PlaylistPicker />
      <Toasts />

      {!ready && <span className="sr-only">loading</span>}
    </div>
  );
}
