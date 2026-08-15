import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import sirv from "sirv";

// Local dev only: tiles/ and data/interim/ hold multi-hundred-MB pmtiles and
// parquet files that production fetches from Cloudflare R2 (see
// src/lib/config.ts). They must NEVER live under public/, because `vite
// build` copies public/ verbatim into dist/ — including through symlinks —
// which would bundle ~1.5GB into every Netlify build for no reason. Instead,
// serve them directly off disk via dev-server-only middleware (sirv supports
// HTTP Range requests, which both pmtiles and duckdb-wasm's Parquet reads
// depend on).
function localDataMiddleware(): Plugin {
  const tilesDir = path.resolve(__dirname, "../tiles");
  const dataDir = path.resolve(__dirname, "../data/interim");
  return {
    name: "local-data-middleware",
    configureServer(server) {
      server.middlewares.use("/tiles", sirv(tilesDir, { dev: true }));
      server.middlewares.use("/data", sirv(dataDir, { dev: true }));
    },
    configurePreviewServer(server) {
      server.middlewares.use("/tiles", sirv(tilesDir, { dev: true }));
      server.middlewares.use("/data", sirv(dataDir, { dev: true }));
    },
  };
}

export default defineConfig({
  plugins: [react(), localDataMiddleware()],
  test: {
    // Only the component and hook suites need a DOM; the rest (style
    // expressions, formatters, the stats client) run fine without one, so
    // jsdom is opted into per-file with `@vitest-environment jsdom`.
    environment: "node",
    // Required for @testing-library/react's automatic cleanup to register.
    // Without it, renders accumulate across tests in a file and queries
    // start matching elements left over from an earlier test.
    globals: true,
  },
});
