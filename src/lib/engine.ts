import { LICHESS } from '../config';

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

type Listener = (e: EvalResult) => void;

const MULTI_PV = 3;
const isSmallDevice = () =>
  (navigator.hardwareConcurrency || 4) <= 4 || window.matchMedia?.('(pointer: coarse)').matches;

/** Local Stockfish in a web worker. Searches are strictly serialised. */
class LocalEngine {
  private worker?: Worker;
  private ready = false;
  private searching = false;
  private current?: { fen: string; cb: Listener };
  private queued?: { fen: string; cb: Listener };
  private lines = new Map<number, PV>();
  private depth = 0;
  private lastEmit = 0;
  failed = false;

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
    };
    this.worker.onmessage = ev => this.onLine(String(ev.data));
    this.worker.postMessage('uci');
  }

  private onLine(line: string) {
    if (line === 'uciok') {
      this.worker!.postMessage(`setoption name MultiPV value ${MULTI_PV}`);
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
      if (this.current && this.lines.size) this.emit(true);
      this.searching = false;
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
    const small = isSmallDevice();
    this.worker.postMessage(`position fen ${this.current.fen}`);
    this.worker.postMessage(`go depth ${small ? 18 : 24} movetime ${small ? 12000 : 30000}`);
  }

  analyse(fen: string, cb: Listener) {
    this.boot();
    if (this.failed) return;
    this.queued = { fen, cb };
    if (this.searching) this.worker?.postMessage('stop');
    else this.startQueued();
  }

  stop() {
    this.queued = undefined;
    this.current = undefined;
    if (this.searching) this.worker?.postMessage('stop');
  }
}

const local = new LocalEngine();
const cache = new Map<string, EvalResult>();
let cloudBlockedUntil = 0;
let active: { fen: string; ctrl: AbortController; recheck?: number } | undefined;

export const cachedEval = (fen: string) => cache.get(fen);

const better = (a: EvalResult, b: EvalResult | undefined) =>
  !b || a.depth > b.depth || (a.depth === b.depth && a.pvs.length >= b.pvs.length);

const fetchCloud = async (fen: string, signal: AbortSignal): Promise<EvalResult | undefined> => {
  if (Date.now() < cloudBlockedUntil) return undefined;
  const res = await fetch(`${LICHESS}/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${MULTI_PV}`, { signal });
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
export const requestEval = (fen: string, onUpdate: Listener, opts: { useLocal: boolean }) => {
  cancelEval();
  const ctrl = new AbortController();
  const mine = { fen, ctrl, recheck: undefined as number | undefined };
  active = mine;

  const push = (e: EvalResult) => {
    if (active !== mine) return;
    if (better(e, cache.get(fen))) cache.set(fen, e);
    onUpdate(cache.get(fen)!);
  };

  const hit = cache.get(fen);
  if (hit) onUpdate(hit);
  if (hit?.source === 'cloud') return;

  const tryCloud = async (startLocalOnMiss: boolean) => {
    let cloud: EvalResult | undefined;
    try {
      cloud = await fetchCloud(fen, ctrl.signal);
    } catch {
      cloud = undefined;
    }
    if (active !== mine) return;
    if (cloud) {
      local.stop();
      push(cloud);
      return;
    }
    if (startLocalOnMiss && opts.useLocal) local.analyse(fen, push);
  };

  void tryCloud(true);
  // Popular live positions get added to the cloud within a minute or so.
  mine.recheck = window.setTimeout(() => void tryCloud(false), 25000);
};

export const cancelEval = () => {
  if (!active) return;
  active.ctrl.abort();
  window.clearTimeout(active.recheck);
  active = undefined;
  local.stop();
};

/** White's winning chances in [-1, 1], using the same curve Lichess uses. */
export const winningChances = (pv: PV | undefined): number => {
  if (!pv) return 0;
  if (pv.mate !== undefined) return pv.mate > 0 ? 1 : -1;
  const cp = Math.max(-1000, Math.min(1000, pv.cp ?? 0));
  return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
};
