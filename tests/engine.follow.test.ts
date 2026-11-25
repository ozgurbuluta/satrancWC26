import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelEval, requestEval, type EvalResult } from '../src/lib/engine';

// Positions of a line the viewer might play on the board: each one is asked about in turn.
const A = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const B = 'rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2';
const C = 'rnbqkbnr/pppp1ppp/8/8/3pP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3';
// Answers are remembered per position for the visit, so each case uses positions of its own.
const D = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';
const E = 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2';
const F = 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2';
const G = 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3';

/** A stand-in for Lichess' cloud evaluation whose answers arrive when the test says so. */
const cloud = () => {
  const waiting = new Map<string, (body: unknown) => void>();
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const fen = new URL(url).searchParams.get('fen')!;
      asked.push(fen);
      return new Promise(resolve => waiting.set(fen, body => resolve({ ok: true, status: 200, json: async () => body })));
    }),
  );
  return {
    asked,
    /** Lichess answers for this position, however late. */
    answer: async (fen: string, cp: number, move: string) => {
      waiting.get(fen)!({ depth: 30, pvs: [{ cp, moves: move }] });
      await vi.advanceTimersByTimeAsync(0);
    },
  };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cancelEval();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the engine follows the position on the board', () => {
  it('an answer for a position the board has left is never delivered', async () => {
    const lichess = cloud();
    const forA = vi.fn<(e: EvalResult) => void>();
    const forB = vi.fn<(e: EvalResult) => void>();
    requestEval(A, forA, { useLocal: false });
    requestEval(B, forB, { useLocal: false }); // the viewer played a move before the first answer came

    await lichess.answer(A, 20, 'g1f3'); // the late answer for the old position
    expect(forA).not.toHaveBeenCalled();
    expect(forB).not.toHaveBeenCalled();

    await lichess.answer(B, -15, 'e5d4');
    expect(forA).not.toHaveBeenCalled();
    expect(forB).toHaveBeenCalledTimes(1);
    expect(forB.mock.calls[0][0]).toMatchObject({ fen: B, pvs: [{ cp: -15, moves: ['e5d4'] }] });
  });

  it('every result says which position it is for, also when positions change quickly', async () => {
    const lichess = cloud();
    const seen: EvalResult[] = [];
    for (const fen of [D, E, F, E, F]) requestEval(fen, e => seen.push(e), { useLocal: false });
    // answers arrive out of order, long after the board moved on
    await lichess.answer(E, 5, 'c2c4');
    await lichess.answer(D, 20, 'd7d5');
    await lichess.answer(F, 40, 'e7e6');
    expect(seen.map(e => e.fen)).toEqual([F]);
    expect(seen[0].pvs[0].moves).toEqual(['e7e6']);
  });

  it('a position that was answered before is answered again at once, as itself', async () => {
    const lichess = cloud();
    const first = vi.fn<(e: EvalResult) => void>();
    requestEval(C, first, { useLocal: false });
    await lichess.answer(C, 40, 'd1d4');
    expect(first).toHaveBeenCalledTimes(1);

    // away to another position and back, as when stepping through a line
    requestEval(G, vi.fn(), { useLocal: false });
    const again = vi.fn<(e: EvalResult) => void>();
    requestEval(C, again, { useLocal: false });
    expect(again).toHaveBeenCalledTimes(1);
    expect(again.mock.calls[0][0]).toMatchObject({ fen: C, pvs: [{ moves: ['d1d4'] }] });
    expect(lichess.asked.filter(fen => fen === C)).toHaveLength(1); // not asked twice
  });

  it('returning to the live position cancels the question about the line', async () => {
    const lichess = cloud();
    const forLine = vi.fn();
    const H = 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR b KQkq - 1 3';
    requestEval(H, forLine, { useLocal: false });
    cancelEval(); // the board left the line
    await lichess.answer(H, 40, 'g8f6');
    expect(forLine).not.toHaveBeenCalled();
  });
});
