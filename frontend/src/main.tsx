import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MotionConfig } from "motion/react";
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

  const container = document.getElementById("root");
  if (!container) return;

  function MotionPolicy({ children }: { children: ReactNode }) {
    const animation = useSettings((state) => state.settings.animation);
    const reduced = animation.reduceMotion || !animation.enabled || animation.performanceMode;
    return (
      <MotionConfig
        reducedMotion={reduced ? "always" : "user"}
        transition={{ duration: 0.22 / Math.max(0.5, animation.speed), ease: "easeOut" }}
      >
        {children}
      </MotionConfig>
    );
  }

  createRoot(container).render(
    <StrictMode>
      <BrowserRouter>
        <MotionPolicy>
          <App />
        </MotionPolicy>
      </BrowserRouter>
    </StrictMode>,
  );

  // Never hold the first paint while searching the LAN. A saved server is
  // checked first; a short beacon scan can connect in the background.
  if (isNative()) {
    void (async () => {
      const found = await discoverBackend({ fallbackToSubnet: false });
      if (found) {
        setApiBase(found);
        window.dispatchEvent(new Event("nrn:backend-found"));
      }
    })();
  }
}

void boot();
