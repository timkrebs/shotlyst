/**
 * vite.config.ts — build, dev server and Vitest configuration for the PWA.
 *
 * In Compose the SPA is served through Caddy on :8080, which also routes
 * /api/v1/* to the services, so the browser sees one origin and session
 * cookies work without CORS. The dev server therefore needs no proxy.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Compose sets VITE_POLL: bind mounts from macOS into the container VM
    // deliver no file events (same reason .air.toml polls).
    watch: process.env.VITE_POLL ? { usePolling: true, interval: 500 } : {},
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
