import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import streams from './api/streams.js';

/** Runs the Vercel function in dev and preview, so the stream finder works locally too. */
const localApi = (): Plugin => {
  // Must return nothing: Vite treats a returned function as a hook to run later.
  const mount = (server: { middlewares: { use: (path: string, fn: (req: unknown, res: unknown) => void) => unknown } }): void => {
    server.middlewares.use('/api/streams', (req, res) => void streams(req, res));
  };
  return { name: 'local-api', configureServer: mount, configurePreviewServer: mount };
};

export default defineConfig({
  plugins: [react(), localApi()],
  server: { host: true, port: 5173 },
});
