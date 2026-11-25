// Builds src/data/puzzles.json, the small offline puzzle set, from puzzle
// files downloaded from the Lichess API (https://lichess.org/api/puzzle/next).
// Lichess puzzles are in the public domain (CC0). Only the position and the
// solution are kept: no game, no player names.
//
//   node scripts/build-puzzles.mjs <folder-of-json-files>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';

// Loads the site's own TypeScript modules, so the same validation runs here and in the browser.
const vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { fromLichess } = await vite.ssrLoadModule('/src/lib/puzzle.ts');
const { moveByUci } = await vite.ssrLoadModule('/src/lib/position.ts');

const dir = process.argv[2];
if (!dir) throw new Error('usage: build-puzzles.mjs <folder>');
const seen = new Set();
const out = [];
for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const puzzle = fromLichess(JSON.parse(readFileSync(join(dir, file), 'utf8')), 'builtin');
  if (!puzzle || seen.has(puzzle.id)) {
    console.log(`skipped ${file}: ${puzzle ? 'duplicate' : 'did not validate'}`);
    continue;
  }
  // A mating theme must end in mate, or the data is not what it claims to be.
  let fen = puzzle.fen;
  let last;
  for (const uci of puzzle.solution) {
    last = moveByUci(fen, uci);
    fen = last.fen;
  }
  if (puzzle.themes.some(t => t.startsWith('mateIn')) && !last.mate) {
    console.log(`skipped ${file}: mate theme without mate`);
    continue;
  }
  seen.add(puzzle.id);
  out.push({ id: puzzle.id, fen: puzzle.fen, lastMove: puzzle.lastMove, solution: puzzle.solution, rating: puzzle.rating, themes: puzzle.themes });
}
out.sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0));
writeFileSync(new URL('../src/data/puzzles.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${out.length} puzzles, ratings ${out.map(p => p.rating).join(', ')}`);
await vite.close();
