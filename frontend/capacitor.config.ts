import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.nrnmusic.app",
  appName: "NrNMusic",
  webDir: "dist",
  server: {
    // Local assets are bundled; the API base URL is configurable in-app.
    androidScheme: "https",
  },
};

export default config;
