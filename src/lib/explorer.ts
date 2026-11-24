// Lichess masters database: over-the-board games by strong players, by position.

const EXPLORER = 'https://explorer.lichess.ovh';

export interface ExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
}

export interface ExplorerGame {
  id: string;
  winner: 'white' | 'black' | null;
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  year: number;
  month?: string;
}

export interface ExplorerData {
  white: number;
  draws: number;
  black: number;
  moves: ExplorerMove[];
  topGames: ExplorerGame[];
  opening?: { eco: string; name: string } | null;
}

export const totalGames = (d: { white: number; draws: number; black: number }) => d.white + d.draws + d.black;

const cache = new Map<string, Promise<ExplorerData>>();
let chain: Promise<unknown> = Promise.resolve();

/** Position lookup. Requests run one at a time and every answer is cached. */
export const getMasters = (fen: string): Promise<ExplorerData> => {
  const hit = cache.get(fen);
  if (hit) return hit;
  const run = chain.then(async () => {
    const res = await fetch(`${EXPLORER}/masters?fen=${encodeURIComponent(fen)}&moves=8&topGames=6`);
    if (!res.ok) throw new Error(`explorer ${res.status}`);
    return (await res.json()) as ExplorerData;
  });
  chain = run.catch(() => undefined);
  cache.set(fen, run);
  run.catch(() => cache.delete(fen));
  return run;
};

const pgnCache = new Map<string, Promise<string>>();

export const getMasterPgn = (id: string): Promise<string> => {
  const hit = pgnCache.get(id);
  if (hit) return hit;
  const run = fetch(`${EXPLORER}/masters/pgn/${id}`).then(res => {
    if (!res.ok) throw new Error(`explorer pgn ${res.status}`);
    return res.text();
  });
  pgnCache.set(id, run);
  run.catch(() => pgnCache.delete(id));
  return run;
};

/**
 * Finds the first move after which the position no longer exists in the masters
 * database, looking only at the first `upTo` plies (so nothing hidden leaks).
 * Returns the 1-based ply of the novelty, or null while the game is still "in book".
 * Game counts only shrink along a line, so a binary search needs few requests.
 */
export const findNovelty = async (fens: string[], upTo: number): Promise<number | null> => {
  const n = Math.min(upTo, fens.length);
  if (n === 0) return null;
  const known = async (ply: number) => totalGames(await getMasters(fens[ply - 1])) > 0;
  if (await known(n)) return null;
  let lo = 0; // last ply known to be in the database (0 = starting position)
  let hi = n; // first ply known to be outside it
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (await known(mid)) lo = mid;
    else hi = mid;
  }
  return hi;
};
