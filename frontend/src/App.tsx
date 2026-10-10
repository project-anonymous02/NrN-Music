import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AlbumPage, ArtistPage } from "./pages/ArtistAlbum";
import { HomePage } from "./pages/Home";
import { LibraryPage } from "./pages/Library";
import { PlaylistPage } from "./pages/Playlist";
import { SearchPage } from "./pages/Search";
import { SettingsPage } from "./pages/Settings";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/artist/:id" element={<ArtistPage />} />
        <Route path="/album/:id" element={<AlbumPage />} />
        <Route path="/playlist/:id" element={<PlaylistPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
