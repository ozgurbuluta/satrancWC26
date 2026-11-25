import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import streams from './api/streams.js';

// "/" by default. "/satranc/" serves the site from a sub-folder of another site.
const base = (process.env.VITE_BASE_PATH || '/').replace(/\/*$/, '/');

/** Runs the Vercel function in dev and preview, so the stream finder works locally too. */
const localApi = (): Plugin => {
  // Must return nothing: Vite treats a returned function as a hook to run later.
  const mount = (server: { middlewares: { use: (path: string, fn: (req: unknown, res: unknown) => void) => unknown } }): void => {
    server.middlewares.use(`${base}api/streams`, (req, res) => void streams(req, res));
  };
  return { name: 'local-api', configureServer: mount, configurePreviewServer: mount };
};

/** The production security headers from vercel.json, so `vite preview` is tested under the same policy. */
const productionHeaders = (): Record<string, string> => {
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
    headers: { source: string; has?: unknown; headers: { key: string; value: string }[] }[];
  };
  const everywhere = config.headers.find(h => h.source === '/(.*)' && !h.has);
  return Object.fromEntries((everywhere?.headers ?? []).map(h => [h.key, h.value]));
};

export default defineConfig({
  base,
  plugins: [react(), localApi()],
  server: { host: true, port: 5173 },
  preview: { headers: productionHeaders() },
});
