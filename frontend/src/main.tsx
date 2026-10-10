import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { discoverBackend, isNative } from "./lib/discovery";
import { setApiBase } from "./lib/api";
import { useHistory } from "./stores/history";
import { useLibrary } from "./stores/library";
import { usePlayer } from "./stores/player";
import { useSettings } from "./stores/settings";
import "./styles/global.css";

async function boot() {
  // Settings first so the correct theme/colours are on :root before paint.
  await useSettings.getState().hydrate();
  await Promise.all([useLibrary.getState().hydrate(), useHistory.getState().hydrate()]);

  usePlayer.getState().init();

  // Native builds have no same-origin backend: find it on the LAN first so
  // the first paint already has data instead of an error screen.
  if (isNative()) {
    const found = await discoverBackend();
    if (found) setApiBase(found);
  }

  const container = document.getElementById("root");
  if (!container) return;
  createRoot(container).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

void boot();
