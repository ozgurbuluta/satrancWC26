// Copies the single-threaded Stockfish build into public/engine so it is
// served as a static worker. Single-threaded on purpose: the multi-threaded
// build needs cross-origin isolation, which blocks YouTube/Twitch embeds.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish', 'bin');
const dest = join(root, 'public', 'engine');
mkdirSync(dest, { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  copyFileSync(join(src, f), join(dest, f));
}
console.log('engine copied to public/engine');
