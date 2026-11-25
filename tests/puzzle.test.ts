import { describe, expect, it } from 'vitest';
import builtin from '../src/data/puzzles.json';
import { isPromotion, legalDests, legalSans, moveBySquares, moveByText, moveByUci, positionOf, sideToMove } from '../src/lib/position';
import {
  addResult,
  EMPTY_SCORE,
  expectedMove,
  fromLichess,
  ratingBand,
  resultOf,
  revealSolution,
  solverColor,
  startPuzzle,
  takeHint,
  tryMove,
  validatePuzzle,
  type Puzzle,
} from '../src/lib/puzzle';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const puzzles: Puzzle[] = (builtin as Omit<Puzzle, 'source'>[]).map(p => ({ ...p, source: 'builtin' }));

/** Two-move mate from the built-in set: rook check, forced king move, pawn mate. */
const MATE_IN_2: Puzzle = puzzles.find(p => p.id === 'gdnLv')!;

describe('built-in puzzles', () => {
  it('there is a usable offline set', () => {
    expect(puzzles.length).toBeGreaterThanOrEqual(10);
    expect(new Set(puzzles.map(p => p.id)).size).toBe(puzzles.length);
  });

  it.each(puzzles.map(p => [p.id, p] as const))('%s is a legal position with a fully legal solution', (_id, p) => {
    expect(positionOf(p.fen), 'position').toBeDefined();
    expect(validatePuzzle(p)).toBeUndefined();
    // the solver moves first and last
    expect(p.solution.length % 2).toBe(1);
    expect(solverColor(p)).toBe(sideToMove(p.fen));
    // the move that set the puzzle up really happened: its target square holds an opponent's piece
    if (p.lastMove) {
      const target = positionOf(p.fen)!.board.get(('abcdefgh'.indexOf(p.lastMove[2]) + 8 * (Number(p.lastMove[3]) - 1)) as never);
      expect(target?.color).toBe(sideToMove(p.fen) === 'white' ? 'black' : 'white');
    }
  });

  it.each(puzzles.filter(p => p.themes.some(t => t.startsWith('mateIn'))).map(p => [p.id, p] as const))('%s (a mating puzzle) ends in checkmate', (_id, p) => {
    let fen = p.fen;
    let last;
    for (const uci of p.solution) {
      last = moveByUci(fen, uci)!;
      fen = last.fen;
    }
    expect(last!.mate).toBe(true);
    expect(positionOf(fen)!.isCheckmate()).toBe(true);
  });

  it('holds positions and solutions only: no game, no player names', () => {
    for (const p of builtin as Record<string, unknown>[]) {
      expect(Object.keys(p).sort()).toEqual(['fen', 'id', 'lastMove', 'rating', 'solution', 'themes']);
    }
  });
});

describe('solving a puzzle', () => {
  it('a right move is played and the reply follows', () => {
    const s = startPuzzle(MATE_IN_2);
    const first = expectedMove(s)!;
    const out = tryMove(s, first);
    expect(out.outcome).toBe('correct');
    expect(out.afterMove.fen).toBe(first.fen);
    expect(out.afterReply!.step).toBe(2);
    expect(out.afterReply!.line).toHaveLength(2);
    expect(sideToMove(out.afterReply!.fen)).toBe(solverColor(MATE_IN_2));
  });

  it('a wrong but legal move changes nothing except the count of mistakes', () => {
    const s = startPuzzle(MATE_IN_2);
    const right = expectedMove(s)!;
    const wrong = legalSans(s.fen)
      .map(san => moveByText(s.fen, san, 'en')!)
      .find(m => m.uci !== right.uci && !m.mate)!;
    const out = tryMove(s, wrong);
    expect(out.outcome).toBe('wrong');
    expect(out.afterMove.fen).toBe(s.fen);
    expect(out.afterMove.step).toBe(0);
    expect(out.afterMove.mistakes).toBe(1);
    expect(out.afterReply).toBeUndefined();
  });

  it('the last move solves it; solving without mistakes or hints is "first try"', () => {
    let s = startPuzzle(MATE_IN_2);
    s = tryMove(s, expectedMove(s)!).afterReply!;
    const end = tryMove(s, expectedMove(s)!);
    expect(end.outcome).toBe('solved');
    expect(end.afterMove.status).toBe('solved');
    expect(resultOf(end.afterMove)).toBe('first_try');
    // nothing more can be played
    expect(expectedMove(end.afterMove)).toBeUndefined();
    expect(tryMove(end.afterMove, moveByUci(MATE_IN_2.fen, MATE_IN_2.solution[0])!).outcome).toBe('wrong');
  });

  it('a mistake or a hint on the way makes it "solved", not "first try"', () => {
    let s = startPuzzle(MATE_IN_2);
    const wrong = legalSans(s.fen).map(san => moveByText(s.fen, san, 'en')!).find(m => m.uci !== expectedMove(s)!.uci && !m.mate)!;
    s = tryMove(s, wrong).afterMove;
    s = tryMove(s, expectedMove(s)!).afterReply!;
    s = tryMove(s, expectedMove(s)!).afterMove;
    expect(resultOf(s)).toBe('solved');

    let h = takeHint(startPuzzle(MATE_IN_2));
    expect(h.hint).toBe(1);
    h = takeHint(takeHint(h));
    expect(h.hint).toBe(2); // two levels, no more
    h = tryMove(h, expectedMove(h)!).afterReply!;
    expect(h.hint).toBe(0); // a new move starts without a hint showing
    expect(h.hintUsed).toBe(true); // but the help is not forgotten
    h = tryMove(h, expectedMove(h)!).afterMove;
    expect(resultOf(h)).toBe('solved');
  });

  it('any move that mates is accepted, as on Lichess', () => {
    // White mates with either rook: Ra8 or Rb8 (the listed solution is Ra8).
    const twoMates: Puzzle = { id: 't', fen: '6k1/5ppp/8/8/8/8/8/RR4K1 w - - 0 1', solution: ['a1a8'], themes: ['mateIn1'], source: 'builtin' };
    expect(validatePuzzle(twoMates)).toBeUndefined();
    const other = moveByUci(twoMates.fen, 'b1b8')!;
    expect(other.mate).toBe(true);
    const out = tryMove(startPuzzle(twoMates), other);
    expect(out.outcome).toBe('solved');
    expect(out.afterMove.status).toBe('solved');
  });

  it('revealing plays the rest of the solution with legal moves and counts as revealed', () => {
    const frames = revealSolution(startPuzzle(MATE_IN_2));
    expect(frames).toHaveLength(MATE_IN_2.solution.length);
    expect(frames.at(-1)!.status).toBe('revealed');
    expect(positionOf(frames.at(-1)!.fen)!.isCheckmate()).toBe(true);
    expect(resultOf(frames.at(-1)!)).toBe('revealed');
  });

  it('keeps score: solved, first try, revealed and the first-try streak', () => {
    let score = EMPTY_SCORE;
    score = addResult(score, 'first_try');
    score = addResult(score, 'first_try');
    expect(score).toMatchObject({ solved: 2, firstTry: 2, streak: 2, bestStreak: 2 });
    score = addResult(score, 'solved');
    expect(score).toMatchObject({ solved: 3, firstTry: 2, streak: 0, bestStreak: 2 });
    score = addResult(score, 'revealed');
    expect(score).toMatchObject({ solved: 3, revealed: 1, streak: 0, bestStreak: 2 });
    expect(ratingBand(1150)).toBe('under_1200');
    expect(ratingBand(1600)).toBe('1600_1999');
    expect(ratingBand(undefined)).toBe('unknown');
  });
});

describe('puzzles from the network are checked before use', () => {
  const good = { puzzle: { id: 'abc12', fen: MATE_IN_2.fen, lastMove: 'g7f6', solution: MATE_IN_2.solution, rating: 1303.4, themes: ['mateIn2'] } };

  it('accepts a well-formed puzzle', () => {
    expect(fromLichess(good, 'lichess')).toMatchObject({ id: 'abc12', rating: 1303, source: 'lichess' });
  });

  it('refuses an illegal solution, a broken position, or a malformed answer', () => {
    expect(fromLichess({ puzzle: { ...good.puzzle, solution: ['e7e8', 'f6e6'] } }, 'lichess')).toBeUndefined();
    expect(fromLichess({ puzzle: { ...good.puzzle, solution: ['<script>'] } }, 'lichess')).toBeUndefined();
    expect(fromLichess({ puzzle: { ...good.puzzle, fen: 'not a position' } }, 'lichess')).toBeUndefined();
    expect(fromLichess({ puzzle: { ...good.puzzle, solution: [] } }, 'lichess')).toBeUndefined();
    expect(fromLichess({}, 'lichess')).toBeUndefined();
    expect(fromLichess(null, 'lichess')).toBeUndefined();
    expect(fromLichess('<html>', 'lichess')).toBeUndefined();
  });
});

describe('moves entered by a visitor', () => {
  it('only legal moves exist', () => {
    expect(moveBySquares(START, 'e2', 'e4')).toMatchObject({ san: 'e4', uci: 'e2e4' });
    expect(moveBySquares(START, 'e2', 'e5')).toBeUndefined();
    expect(moveBySquares(START, 'e7', 'e5')).toBeUndefined(); // not Black's turn
    expect(moveBySquares(START, 'z9', 'e4')).toBeUndefined();
    expect(moveByUci(START, 'e2e4q')).toBeUndefined();
    expect(legalSans(START)).toHaveLength(20);
    expect(legalDests(START).get('g1')?.sort()).toEqual(['f3', 'h3']);
  });

  it('understands Turkish and English notation for typed moves', () => {
    expect(moveByText(START, 'Af3', 'tr')).toMatchObject({ uci: 'g1f3' });
    expect(moveByText(START, 'Nf3', 'en')).toMatchObject({ uci: 'g1f3' });
    expect(moveByText(START, 'Nf3', 'tr')).toMatchObject({ uci: 'g1f3' }); // either works in either setting
    expect(moveByText(START, ' e4 ', 'tr')).toMatchObject({ uci: 'e2e4' });
    expect(moveByText(START, 'Ke2', 'en')).toBeUndefined();
    expect(moveByText(START, '', 'tr')).toBeUndefined();
    expect(moveByText(START, 'e4; drop table', 'tr')).toBeUndefined();
  });

  it('"K" means the rook in Turkish and the king in English', () => {
    const fen = '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1';
    expect(moveByText(fen, 'Kd1', 'tr')).toMatchObject({ uci: 'a1d1' }); // Kale
    expect(moveByText(fen, 'Kd1', 'en')).toMatchObject({ uci: 'e1d1' }); // King
    expect(moveByText(fen, 'Şd1', 'tr')).toMatchObject({ uci: 'e1d1' }); // Şah
  });

  it('castling is accepted in every way it can be given, and shown on the king’s real square', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    for (const m of [moveBySquares(fen, 'e1', 'g1'), moveBySquares(fen, 'e1', 'h1'), moveByUci(fen, 'e1g1'), moveByText(fen, 'O-O', 'tr'), moveByText(fen, '0-0', 'en')]) {
      expect(m).toMatchObject({ san: 'O-O', uci: 'e1h1', from: 'e1', to: 'g1' });
    }
    expect(moveByText(fen, '0-0-0', 'tr')).toMatchObject({ san: 'O-O-O', to: 'c1' });
  });

  it('a pawn reaching the last rank needs a piece, and gets the one chosen', () => {
    const fen = '8/4P1k1/8/8/8/8/8/4K3 w - - 0 1';
    expect(isPromotion(fen, 'e7', 'e8')).toBe(true);
    expect(isPromotion(fen, 'e1', 'e2')).toBe(false);
    expect(moveBySquares(fen, 'e7', 'e8')).toBeUndefined();
    expect(moveBySquares(fen, 'e7', 'e8', 'queen')).toMatchObject({ san: 'e8=Q' });
    expect(moveBySquares(fen, 'e7', 'e8', 'knight')).toMatchObject({ san: 'e8=N+', check: true });
    expect(moveByText(fen, 'e8=V', 'tr')).toMatchObject({ san: 'e8=Q' });
  });

  it('reports captures, checks and mate', () => {
    expect(moveByUci('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', 'e4d5')).toMatchObject({ capture: true, check: false });
    expect(moveByUci('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8')).toMatchObject({ check: true, mate: true });
  });
});
