import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.VITE_API_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    css: false,
  },
});
