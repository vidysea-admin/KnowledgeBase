import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset URLs: one build serves any base path. The web container sets <base href> and
  // config.js from APP_BASE_PATH at start (apps/web/docker/40-lkb-runtime-config.sh).
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
});
