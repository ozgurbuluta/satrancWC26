import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatEval } from '../src/lib/format';
import { engineLineCount } from '../src/lib/engine-settings';
import type { EvalResult } from '../src/lib/engine';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const moves = ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'b1c3'];
const result = (count: number) => ({ depth: 40, pvs: moves.slice(0, count).map((moves, i) => ({ cp: 24 - i, moves })) });
let engine: typeof import('../src/lib/engine');

class FakeWorker {
  static instances: FakeWorker[] = [];
  sent: string[] = [];
  onmessage?: (ev: { data: string }) => void;
  onerror?: () => void;
  constructor() { FakeWorker.instances.push(this); }
  postMessage(message: string) { this.sent.push(message); }
  reply(data: string) { this.onmessage?.({ data }); }
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
  engine = await import('../src/lib/engine');
});
afterEach(() => {
  engine.cancelEval();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('engine precision', () => {
  it('keeps centipawns visible, also around zero and beyond ten pawns, without changing mate notation', () => {
    expect([0, 1, -1, 10, -120, 1035].map(cp => formatEval({ cp })))
      .toEqual(['0.00', '+0.01', '−0.01', '+0.10', '−1.20', '+10.35']);
    expect(formatEval({ cp: -0 })).toBe('0.00');
    expect(formatEval({ mate: 4 })).toBe('#4');
    expect(formatEval({ mate: -4 })).toBe('#−4');
  });
});

describe('one to five engine lines', () => {
  it('requests the chosen cloud count and keeps caches separate when the count changes', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const n = Number(new URL(url).searchParams.get('multiPv'));
      return { ok: true, status: 200, json: async () => result(n) };
    });
    vi.stubGlobal('fetch', fetcher);
    const seen: EvalResult[] = [];
    for (const n of [1, 5, 1]) {
      engine.requestEval(START, e => seen.push(e), { useLocal: true, multiPv: n });
      await vi.advanceTimersByTimeAsync(0);
      expect(seen.at(-1)!.pvs).toHaveLength(n);
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(engine.cachedEval(START, 1)!.pvs).toHaveLength(1);
    expect(engine.cachedEval(START, 5)!.pvs).toHaveLength(5);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('fills an incomplete deep cloud answer with all five local lines', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => result(3) })));
    const seen: EvalResult[] = [];
    engine.requestEval(START, e => seen.push(e), { useLocal: true, multiPv: 5 });
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.at(-1)).toMatchObject({ source: 'cloud', depth: 40 });
    const worker = FakeWorker.instances[0];
    worker.reply('uciok');
    worker.reply('readyok');
    expect(worker.sent).toContain('setoption name MultiPV value 5');
    moves.forEach((move, i) => worker.reply(`info depth 12 multipv ${i + 1} score cp ${24 - i} pv ${move}`));
    worker.reply('bestmove e2e4');
    expect(seen.at(-1)).toMatchObject({ source: 'local', depth: 12 });
    expect(seen.at(-1)!.pvs).toHaveLength(5);
    // A later cloud recheck still has only three: it cannot remove the five lines.
    await vi.advanceTimersByTimeAsync(25000);
    expect(seen.at(-1)!.pvs).toHaveLength(5);
    expect(seen.at(-1)!.source).toBe('local');
  });

  it('serialises local searches when the line count changes during a search', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    const old = vi.fn();
    const next = vi.fn();
    engine.requestEval(START, old, { useLocal: true, multiPv: 5 });
    await vi.advanceTimersByTimeAsync(0);
    const worker = FakeWorker.instances[0];
    worker.reply('uciok'); worker.reply('readyok');
    engine.requestEval(START, next, { useLocal: true, multiPv: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(worker.sent).toContain('stop');
    worker.reply('info depth 14 multipv 1 score cp 25 pv e2e4');
    expect(old).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    worker.reply('bestmove e2e4');
    expect(worker.sent.slice(-3)[0]).toBe('setoption name MultiPV value 1');
    worker.reply('info depth 12 multipv 1 score cp 21 pv d2d4');
    worker.reply('bestmove d2d4');
    expect(next.mock.calls.at(-1)![0].pvs).toEqual([{ cp: 21, moves: ['d2d4'] }]);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it('accepts fewer lines when the position has only one legal move', async () => {
    const fen = '7k/8/5K2/8/8/8/8/7R b - - 0 1'; // only Kg8
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ depth: 35, pvs: [{ cp: 500, moves: 'h8g8' }] }) })));
    const seen = vi.fn();
    engine.requestEval(fen, seen, { useLocal: true, multiPv: 5 });
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.mock.calls[0][0].pvs).toHaveLength(1);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('ignores a late cloud answer for the previous line count', async () => {
    const replies = new Map<number, (r: unknown) => void>();
    vi.stubGlobal('fetch', vi.fn((url: string) => new Promise(resolve => replies.set(Number(new URL(url).searchParams.get('multiPv')), resolve))));
    const old = vi.fn(); const next = vi.fn();
    engine.requestEval(START, old, { useLocal: false, multiPv: 1 });
    engine.requestEval(START, next, { useLocal: false, multiPv: 5 });
    for (const n of [5, 1]) {
      replies.get(n)!({ ok: true, status: 200, json: async () => result(n) });
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(old).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].pvs).toHaveLength(5);
  });

  it('defaults invalid persisted values without allowing arbitrary worker options', () => {
    for (const n of [undefined, null, '5', -1, 0, 6, 1.5, NaN]) expect(engineLineCount(n)).toBe(3);
    for (const n of [1, 2, 3, 4, 5]) expect(engineLineCount(n)).toBe(n);
  });
});
