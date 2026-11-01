/**
 * vite.config.ts — build, dev server and Vitest configuration for the PWA.
 *
 * In Compose the SPA is served through Caddy on :8080, which also routes
 * /api/v1/* to the services, so the browser sees one origin and session
 * cookies work without CORS. The dev server therefore needs no proxy.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173, strictPort: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
