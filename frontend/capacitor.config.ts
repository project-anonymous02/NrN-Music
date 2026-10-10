import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.nrnmusic.app",
  appName: "NrNMusic",
  webDir: "dist",
  server: {
    // Local assets are bundled; the backend is found on the LAN automatically.
    androidScheme: "https",
  },
  android: {
    // The backend runs on plain http://<lan-ip>:8000 inside an https-scheme
    // WebView page; mixed content must be allowed for discovery and playback.
    allowMixedContent: true,
  },
};

export default config;
