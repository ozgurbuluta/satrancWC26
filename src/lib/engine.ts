import { LICHESS } from '../config';
import winTable from '../data/winchance.json';
import { engineLineCount } from './engine-settings';
import { legalSans } from './position';

const WIN_TABLE = winTable as {
  stepCentipawns: number;
  limitCentipawns: number;
  white: number[];
  black: number[];
  mate: { forWhite: { white: number; black: number }; forBlack: { white: number; black: number } };
};

export interface PV {
  /** Centipawns from White's point of view. */
  cp?: number;
  /** Mate in N from White's point of view (negative: Black mates). */
  mate?: number;
  /** UCI moves. */
  moves: string[];
}

export interface EvalResult {
  fen: string;
  depth: number;
  pvs: PV[];
  source: 'cloud' | 'local';
}

/** Compact evaluation kept for every position of a game (graph, move quality). */
export interface Score {
  cp?: number;
  mate?: number;
  depth: number;
  /** Engine's preferred move in UCI. */
  best?: string;
}

type Listener = (e: EvalResult) => void;

const isSmallDevice = () =>
  (navigator.hardwareConcurrency || 4) <= 4 || window.matchMedia?.('(pointer: coarse)').matches;

/** Local Stockfish in a web worker. Searches are strictly serialised. */
class LocalEngine {
  private worker?: Worker;
  private ready = false;
  private searching = false;
  private current?: { fen: string; cb: Listener; done?: () => void; multiPv: number };
  private queued?: { fen: string; cb: Listener; done?: () => void; multiPv: number };
  private lines = new Map<number, PV>();
  private depth = 0;
  private lastEmit = 0;
  failed = false;

  constructor(
    private multiPv: number,
    private goCommand: () => string,
  ) {}

  private boot() {
    if (this.worker || this.failed) return;
    try {
      this.worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`);
    } catch {
      this.failed = true;
      return;
    }
    this.worker.onerror = () => {
      this.failed = true;
      this.current?.done?.();
      this.queued?.done?.();
    };
    this.worker.onmessage = ev => this.onLine(String(ev.data));
    this.worker.postMessage('uci');
  }

  private onLine(line: string) {
    if (line === 'uciok') {
      this.worker!.postMessage(`setoption name MultiPV value ${this.multiPv}`);
      this.worker!.postMessage('setoption name Hash value 32');
      this.worker!.postMessage('isready');
      return;
    }
    if (line === 'readyok') {
      this.ready = true;
      this.startQueued();
      return;
    }
    if (line.startsWith('bestmove')) {
      const finished = this.current;
      if (finished && !this.queued && this.lines.size) this.emit(true);
      this.searching = false;
      finished?.done?.();
      this.startQueued();
      return;
    }
    if (!line.startsWith('info ') || !this.current || this.queued) return;
    if (line.includes('lowerbound') || line.includes('upperbound')) return;
    const depth = Number(/ depth (\d+)/.exec(line)?.[1]);
    const idx = Number(/ multipv (\d+)/.exec(line)?.[1] ?? 1);
    const score = / score (cp|mate) (-?\d+)/.exec(line);
    const pv = / pv (.+)$/.exec(line)?.[1];
    if (!depth || !score || !pv) return;
    const blackToMove = this.current.fen.split(' ')[1] === 'b';
    const value = Number(score[2]) * (blackToMove ? -1 : 1);
    if (idx === 1 && depth !== this.depth) this.depth = depth;
    this.lines.set(idx, {
      moves: pv.trim().split(/\s+/),
      ...(score[1] === 'cp' ? { cp: value } : { mate: value }),
    });
    this.emit(false);
  }

  private emit(force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastEmit < 250) return;
    if (!this.current || this.depth < 8) return;
    this.lastEmit = now;
    const pvs = [...this.lines.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
    this.current.cb({ fen: this.current.fen, depth: this.depth, pvs, source: 'local' });
  }

  private startQueued() {
    if (!this.ready || this.searching || !this.queued || !this.worker) return;
    this.current = this.queued;
    this.queued = undefined;
    this.lines.clear();
    this.depth = 0;
    this.searching = true;
    this.worker.postMessage(`setoption name MultiPV value ${this.current.multiPv}`);
    this.worker.postMessage(`position fen ${this.current.fen}`);
    this.worker.postMessage(this.goCommand());
  }

  analyse(fen: string, cb: Listener, done?: () => void, multiPv = this.multiPv) {
    this.boot();
    if (this.failed) {
      done?.();
      return;
    }
    this.queued?.done?.();
    this.queued = { fen, cb, done, multiPv };
    if (this.searching) this.worker?.postMessage('stop');
    else this.startQueued();
  }

  stop() {
    this.queued?.done?.();
    this.queued = undefined;
    this.current = undefined;
    if (this.searching) this.worker?.postMessage('stop');
  }
}

/** Deep analysis of the position on the board, with the viewer's chosen line count. */
const local = new LocalEngine(3, () => (isSmallDevice() ? 'go depth 18 movetime 12000' : 'go depth 24 movetime 30000'));
/** Quick single-line scores for the whole game (graph and move quality). */
const quick = new LocalEngine(1, () => (isSmallDevice() ? 'go depth 11' : 'go depth 13'));

const cache = new Map<string, EvalResult>();
const scores = new Map<string, Score>();
let cloudBlockedUntil = 0;
let active: { fen: string; ctrl: AbortController; recheck?: number } | undefined;

// --- tiny subscription so charts re-render when new scores arrive ---
let version = 0;
let notifyQueued = false;
const subscribers = new Set<() => void>();
const bump = () => {
  version++;
  if (notifyQueued) return;
  notifyQueued = true;
  window.setTimeout(() => {
    notifyQueued = false;
    subscribers.forEach(fn => fn());
  }, 150);
};
export const subscribeScores = (fn: () => void) => {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
};
export const scoresVersion = () => version;

const cacheKey = (fen: string, multiPv: number) => `${multiPv}:${fen}`;
export const cachedEval = (fen: string, multiPv = 3) => cache.get(cacheKey(fen, engineLineCount(multiPv)));
export const scoreOf = (fen: string): Score | undefined => scores.get(fen);

const recordScore = (fen: string, s: Score) => {
  const old = scores.get(fen);
  if (old && old.depth >= s.depth) return;
  scores.set(fen, s);
  bump();
};

const recordFromEval = (e: EvalResult) => {
  const pv = e.pvs[0];
  if (pv) recordScore(e.fen, { cp: pv.cp, mate: pv.mate, depth: e.depth, best: pv.moves[0] });
};

/** Scores that came with the feed (Lichess adds them after a game is analysed). */
export const seedScore = (fen: string, s: Score) => recordScore(fen, s);

const better = (a: EvalResult, b: EvalResult | undefined, needed: number) => {
  if (!b) return true;
  // A deep cloud entry may contain fewer lines than requested. Do not let it
  // permanently hide the complete local result, or replace one with a partial answer.
  const completeA = a.pvs.length >= needed;
  const completeB = b.pvs.length >= needed;
  if (completeA !== completeB) return completeA;
  return a.depth > b.depth || (a.depth === b.depth && a.pvs.length >= b.pvs.length);
};

const fetchCloud = async (fen: string, multiPv: number, signal?: AbortSignal): Promise<EvalResult | undefined> => {
  if (Date.now() < cloudBlockedUntil) return undefined;
  const res = await fetch(`${LICHESS}/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`, { signal });
  if (res.status === 429) {
    cloudBlockedUntil = Date.now() + 60000;
    return undefined;
  }
  if (!res.ok) return undefined;
  const data = (await res.json()) as { depth: number; pvs: { cp?: number; mate?: number; moves: string }[] };
  return {
    fen,
    depth: data.depth,
    source: 'cloud',
    pvs: data.pvs.map(p => ({ cp: p.cp, mate: p.mate, moves: p.moves.split(' ') })),
  };
};

/**
 * Evaluates a position: Lichess' cloud database first (instant and deep when
 * the position is known), the in-browser engine otherwise. `onUpdate` fires
 * every time a better evaluation is available. Only one request is active.
 */
export const requestEval = (fen: string, onUpdate: Listener, opts: { useLocal: boolean; multiPv?: number }) => {
  cancelEval();
  const multiPv = engineLineCount(opts.multiPv);
  const needed = Math.min(multiPv, Math.max(1, legalSans(fen).length));
  const key = cacheKey(fen, multiPv);
  const ctrl = new AbortController();
  const mine = { fen, ctrl, recheck: undefined as number | undefined };
  active = mine;

  const push = (e: EvalResult) => {
    if (active !== mine) return;
    const trimmed = { ...e, pvs: e.pvs.slice(0, multiPv) };
    if (better(trimmed, cache.get(key), needed)) cache.set(key, trimmed);
    recordFromEval(cache.get(key)!);
    onUpdate(cache.get(key)!);
  };

  const hit = cache.get(key);
  if (hit) onUpdate(hit);
  if (hit?.source === 'cloud' && (hit.pvs.length >= needed || !opts.useLocal)) return;

  const tryCloud = async (startLocalOnMiss: boolean) => {
    let cloud: EvalResult | undefined;
    try {
      cloud = await fetchCloud(fen, multiPv, ctrl.signal);
    } catch {
      cloud = undefined;
    }
    if (active !== mine) return;
    if (cloud) {
      push(cloud);
      if (cloud.pvs.length >= needed) {
        local.stop();
        return;
      }
    }
    if (startLocalOnMiss && opts.useLocal) local.analyse(fen, push, undefined, multiPv);
  };

  void tryCloud(true);
  // Popular live positions get added to the cloud within a minute or so.
  mine.recheck = window.setTimeout(() => void tryCloud(false), 25000);
};

/**
 * Looks a position up in the cloud database only, and keeps what it finds. For a position the board is not on (the
 * newest position of the game while the viewer is looking at an earlier move): the board's own analysis is left alone.
 */
export const lookUpEval = async (fen: string, multiPv?: number): Promise<void> => {
  const lines = engineLineCount(multiPv);
  const key = cacheKey(fen, lines);
  if (cache.has(key)) return;
  let cloud: EvalResult | undefined;
  try {
    cloud = await fetchCloud(fen, lines);
  } catch {
    cloud = undefined;
  }
  if (!cloud || !cloud.pvs.length || cache.has(key)) return;
  cache.set(key, { ...cloud, pvs: cloud.pvs.slice(0, lines) });
  recordFromEval(cloud);
  bump();
};

export const cancelEval = () => {
  if (!active) return;
  active.ctrl.abort();
  window.clearTimeout(active.recheck);
  active = undefined;
  local.stop();
};

let fillRun = 0;

/**
 * Fills in a quick score for every given position, one at a time: cloud first,
 * a shallow local search otherwise. A newer call cancels the previous one.
 */
export const fillScores = async (fens: string[]) => {
  const run = ++fillRun;
  for (const fen of fens) {
    if (run !== fillRun) return;
    if (scores.has(fen)) continue;
    let cloud: EvalResult | undefined;
    try {
      cloud = await fetchCloud(fen, 1);
    } catch {
      cloud = undefined;
    }
    if (run !== fillRun) return;
    if (cloud) {
      recordFromEval(cloud);
      continue;
    }
    if (quick.failed) continue;
    await new Promise<void>(resolve => {
      quick.analyse(fen, recordFromEval, resolve);
    });
  }
};

export const stopFillScores = () => {
  fillRun++;
  quick.stop();
};

/** White's winning chances in [-1, 1], using the same curve Lichess uses. */
export const winningChances = (s: { cp?: number; mate?: number } | undefined): number => {
  if (!s) return 0;
  if (s.mate !== undefined) return s.mate > 0 ? 1 : -1;
  const cp = Math.max(-1000, Math.min(1000, s.cp ?? 0));
  return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
};

/**
 * Win, draw and loss for White from an evaluation: how games actually ended
 * from positions with that evaluation, in classical games between players
 * rated 2600 or more (src/data/winchance.json, made by
 * scripts/fit-win-chance.py; docs/WIN-CHANCE.md). Not a formula: a table of
 * counted shares, read off a straight line between two neighbouring entries.
 * A winning evaluation is therefore not 100 %: games are drawn, and now and
 * then lost, from four pawns up.
 */
export const wdl = (s: { cp?: number; mate?: number } | undefined): { win: number; draw: number; loss: number } => {
  if (!s) return { win: 0, draw: 1, loss: 0 };
  if (s.mate !== undefined) {
    const m = s.mate > 0 ? WIN_TABLE.mate.forWhite : WIN_TABLE.mate.forBlack;
    return { win: m.white, loss: m.black, draw: Math.max(0, 1 - m.white - m.black) };
  }
  const limit = WIN_TABLE.limitCentipawns;
  const at = (Math.max(-limit, Math.min(limit, s.cp ?? 0)) + limit) / WIN_TABLE.stepCentipawns;
  const lower = Math.floor(at);
  const upper = Math.min(lower + 1, WIN_TABLE.white.length - 1);
  const between = (list: number[]) => list[lower] + (at - lower) * (list[upper] - list[lower]);
  const win = between(WIN_TABLE.white);
  const loss = between(WIN_TABLE.black);
  return { win, loss, draw: Math.max(0, 1 - win - loss) };
};

/**
 * The three shares as whole percentages that add up to 100, for showing. A
 * share that exists but rounds to nothing reads "<1", and one that rounds to
 * everything while another exists reads ">99": neither "0" nor "100" is said
 * of a game that is still open.
 */
export const wdlPercents = (split: { win: number; draw: number; loss: number }): { win: string; draw: string; loss: string } => {
  const shares = [split.win, split.draw, split.loss];
  const whole = shares.map(x => Math.floor(x * 100 + 1e-9));
  // the points lost to rounding down go to the largest remainders
  const order = shares.map((x, i) => [x * 100 - whole[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const short = Math.min(3, 100 - whole.reduce((a, b) => a + b, 0));
  for (let k = 0; k < short; k++) whole[order[k][1]]++;
  const text = whole.map((n, i) => (n === 0 && shares[i] > 0 ? '<1' : n === 100 && shares[i] < 1 ? '>99' : String(n)));
  return { win: text[0], draw: text[1], loss: text[2] };
};

export type MoveQuality = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/**
 * How narrow the choice is for the side to move, read from the engine's
 * lines: one good move, or two, and what the next line would cost. A line is
 * "good" while it gives away less than an inaccuracy against the best one,
 * by the same thresholds as judgeMove. Where every line shown is good there
 * is nothing to say, and nothing is returned.
 */
export interface MoveChoice {
  /** `only`: the second line is a mistake or worse. `best`: it is an inaccuracy. `two`: two good lines, the third is not. */
  kind: 'only' | 'best' | 'two';
  /** Index of the first line that is not good, and what playing it would be. */
  next: number;
  quality: 'inaccuracy' | 'mistake' | 'blunder';
}

/** From this many centipawns the score is read as "winning", here and in the words above the board. */
export const WINNING_CP = 250;

/**
 * Whether one side is winning by the engine's best line, and whether the
 * winning side, when it is to move, has only one move that keeps it so.
 */
export interface Standing {
  winner: 'white' | 'black';
  /** Moves to mate, when the best line is a forced mate. */
  mate?: number;
  /** The winner is to move and the second line no longer wins. */
  onlyMove: boolean;
}

export const standing = (pvs: PV[], whiteToMove: boolean): Standing | undefined => {
  const best = pvs[0];
  if (!best) return undefined;
  const wins = (pv: PV, white: boolean) => (pv.mate !== undefined ? pv.mate > 0 === white : (pv.cp ?? 0) * (white ? 1 : -1) >= WINNING_CP);
  const winner = wins(best, true) ? 'white' : wins(best, false) ? 'black' : undefined;
  if (!winner) return undefined;
  const toMove = (winner === 'white') === whiteToMove;
  return { winner, mate: best.mate !== undefined ? Math.abs(best.mate) : undefined, onlyMove: toMove && pvs.length >= 2 && !wins(pvs[1], winner === 'white') };
};

export const moveChoice = (pvs: PV[], whiteToMove: boolean): MoveChoice | undefined => {
  if (pvs.length < 2) return undefined;
  const sign = whiteToMove ? 1 : -1;
  const loss = (i: number) => (winningChances(pvs[0]) - winningChances(pvs[i])) * sign;
  const qualityOf = (x: number): MoveChoice['quality'] => (x >= 0.3 ? 'blunder' : x >= 0.2 ? 'mistake' : 'inaccuracy');
  if (loss(1) >= 0.1) return { kind: loss(1) >= 0.2 ? 'only' : 'best', next: 1, quality: qualityOf(loss(1)) };
  if (pvs.length >= 3 && loss(2) >= 0.1) return { kind: 'two', next: 2, quality: qualityOf(loss(2)) };
  return undefined;
};

/**
 * Judges a move by how much of the mover's winning chances it gave away,
 * with the thresholds Lichess uses. Needs a score before and after the move.
 */
export const judgeMove = (
  before: Score | undefined,
  after: Score | undefined,
  whiteMoved: boolean,
  playedBest: boolean,
): { quality: MoveQuality; loss: number } | undefined => {
  if (!before || !after || before.depth < 10 || after.depth < 10) return undefined;
  const sign = whiteMoved ? 1 : -1;
  const loss = (winningChances(before) - winningChances(after)) * sign;
  let quality: MoveQuality = 'good';
  if (loss >= 0.3) quality = 'blunder';
  else if (loss >= 0.2) quality = 'mistake';
  else if (loss >= 0.1) quality = 'inaccuracy';
  else if (playedBest) quality = 'best';
  return { quality, loss };
};
