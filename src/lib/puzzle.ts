// Puzzle rules, with no user interface in them so they can be tested directly.
//
// A puzzle is a position and a line of moves: the solver's move, the reply,
// the solver's next move, and so on. Every move is checked for legality
// before it is accepted or played.
import { moveByUci, sideToMove, type PlayedMove } from './position';

export type PuzzleSource = 'daily' | 'lichess' | 'builtin';

export interface Puzzle {
  id: string;
  /** Position in which the solver moves. */
  fen: string;
  /** The opponent's last move (UCI), shown as the move that set the puzzle up. */
  lastMove?: string;
  /** Solver's move, reply, solver's move… in UCI. */
  solution: string[];
  rating?: number;
  themes: string[];
  source: PuzzleSource;
}

export type PuzzleStatus = 'solving' | 'solved' | 'revealed';

export interface PuzzleState {
  puzzle: Puzzle;
  /** Current position. */
  fen: string;
  /** Last move on the board, for the highlight. */
  lastMove?: [string, string];
  check: boolean;
  /** Index in `solution` of the solver's next move. */
  step: number;
  /** Wrong tries so far. */
  mistakes: number;
  /** Help showing for the current move: 0 none, 1 the piece to move, 2 the move itself. */
  hint: 0 | 1 | 2;
  /** Help was taken at some point in this puzzle, so it is not a first-try solve. */
  hintUsed: boolean;
  status: PuzzleStatus;
  /** Moves played so far, in notation. */
  line: string[];
}

export type PuzzleResult = 'first_try' | 'solved' | 'revealed';

/** Checks a puzzle before it is shown: a legal position and a fully legal solution. */
export const validatePuzzle = (p: Puzzle): string | undefined => {
  if (!p.solution.length) return 'empty solution';
  let fen = p.fen;
  for (const [i, uci] of p.solution.entries()) {
    const played = moveByUci(fen, uci);
    if (!played) return i === 0 && !moveByUci(p.fen, p.solution[0]) && !fen ? 'bad position' : `illegal move ${uci} at step ${i + 1}`;
    fen = played.fen;
  }
  return undefined;
};

export const startPuzzle = (puzzle: Puzzle): PuzzleState => ({
  puzzle,
  fen: puzzle.fen,
  lastMove: puzzle.lastMove && puzzle.lastMove.length >= 4 ? [puzzle.lastMove.slice(0, 2), puzzle.lastMove.slice(2, 4)] : undefined,
  check: false,
  step: 0,
  mistakes: 0,
  hint: 0,
  hintUsed: false,
  status: 'solving',
  line: [],
});

export const solverColor = (p: Puzzle): 'white' | 'black' => sideToMove(p.fen);

/** The move the solver is expected to play now. */
export const expectedMove = (s: PuzzleState): PlayedMove | undefined =>
  s.status === 'solving' ? moveByUci(s.fen, s.puzzle.solution[s.step]) : undefined;

export interface TryOutcome {
  /** 'wrong' leaves the position as it was. */
  outcome: 'correct' | 'solved' | 'wrong';
  /** State right after the solver's move (before any reply). */
  afterMove: PuzzleState;
  /** State after the opponent's reply, when there is one. */
  afterReply?: PuzzleState;
}

/**
 * Applies the solver's move. It is right when it is the solution's move, or,
 * as on Lichess, when it delivers checkmate even by another route.
 */
export const tryMove = (s: PuzzleState, move: PlayedMove): TryOutcome => {
  if (s.status !== 'solving') return { outcome: 'wrong', afterMove: s };
  const expected = expectedMove(s);
  const right = !!expected && (move.uci === expected.uci || move.mate);
  if (!right) return { outcome: 'wrong', afterMove: { ...s, mistakes: s.mistakes + 1 } };

  const afterMove: PuzzleState = {
    ...s,
    fen: move.fen,
    lastMove: [move.from, move.to],
    check: move.check,
    line: [...s.line, move.san],
    step: s.step + 1,
  };
  const reply = move.mate ? undefined : s.puzzle.solution[s.step + 1];
  const replied = reply ? moveByUci(move.fen, reply) : undefined;
  // Solved when the line is over, the move mates, or nothing is left for the solver after the reply.
  if (!replied || s.step + 2 >= s.puzzle.solution.length) {
    const end: PuzzleState = replied
      ? { ...afterMove, fen: replied.fen, lastMove: [replied.from, replied.to], check: replied.check, line: [...afterMove.line, replied.san], step: s.step + 2, status: 'solved' }
      : { ...afterMove, status: 'solved' };
    return replied ? { outcome: 'solved', afterMove, afterReply: end } : { outcome: 'solved', afterMove: end };
  }
  return {
    outcome: 'correct',
    afterMove,
    afterReply: { ...afterMove, fen: replied.fen, lastMove: [replied.from, replied.to], check: replied.check, line: [...afterMove.line, replied.san], step: s.step + 2, hint: 0 },
  };
};

/** One more level of help: first the piece to move, then the move itself. */
export const takeHint = (s: PuzzleState): PuzzleState =>
  s.status === 'solving' && s.hint < 2 ? { ...s, hint: (s.hint + 1) as 1 | 2, hintUsed: true } : s;

/** Plays the rest of the solution out. Returns every position on the way, for the board to step through. */
export const revealSolution = (s: PuzzleState): PuzzleState[] => {
  const frames: PuzzleState[] = [];
  let cur = s;
  for (let i = s.step; i < s.puzzle.solution.length; i++) {
    const played = moveByUci(cur.fen, s.puzzle.solution[i]);
    if (!played) break;
    cur = { ...cur, fen: played.fen, lastMove: [played.from, played.to], check: played.check, line: [...cur.line, played.san], step: i + 1, status: 'revealed', hint: 0 };
    frames.push(cur);
  }
  if (!frames.length) frames.push({ ...s, status: 'revealed' });
  return frames;
};

/** How the puzzle ended, for the score. Unfinished: undefined. */
export const resultOf = (s: PuzzleState): PuzzleResult | undefined => {
  if (s.status === 'revealed') return 'revealed';
  if (s.status !== 'solved') return undefined;
  return s.mistakes === 0 && !s.hintUsed ? 'first_try' : 'solved';
};

export interface PuzzleScore {
  solved: number;
  firstTry: number;
  revealed: number;
  /** First-try solves in a row. */
  streak: number;
  bestStreak: number;
}

export const EMPTY_SCORE: PuzzleScore = { solved: 0, firstTry: 0, revealed: 0, streak: 0, bestStreak: 0 };

export const addResult = (score: PuzzleScore, result: PuzzleResult): PuzzleScore => {
  const streak = result === 'first_try' ? score.streak + 1 : 0;
  return {
    solved: score.solved + (result === 'revealed' ? 0 : 1),
    firstTry: score.firstTry + (result === 'first_try' ? 1 : 0),
    revealed: score.revealed + (result === 'revealed' ? 1 : 0),
    streak,
    bestStreak: Math.max(score.bestStreak, streak),
  };
};

export const ratingBand = (rating: number | undefined): 'under_1200' | '1200_1599' | '1600_1999' | '2000_plus' | 'unknown' =>
  rating === undefined ? 'unknown' : rating < 1200 ? 'under_1200' : rating < 1600 ? '1200_1599' : rating < 2000 ? '1600_1999' : '2000_plus';

interface LichessPuzzleJson {
  puzzle?: { id?: string; fen?: string; lastMove?: string; solution?: string[]; rating?: number; themes?: string[] };
}

/** Reads a puzzle from the Lichess API answer and refuses it unless it validates. */
export const fromLichess = (data: unknown, source: PuzzleSource): Puzzle | undefined => {
  const p = (data as LichessPuzzleJson)?.puzzle;
  if (!p || typeof p.id !== 'string' || typeof p.fen !== 'string' || !Array.isArray(p.solution)) return undefined;
  const puzzle: Puzzle = {
    id: p.id.slice(0, 12),
    fen: p.fen,
    lastMove: typeof p.lastMove === 'string' ? p.lastMove : undefined,
    solution: p.solution.filter((m): m is string => typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)),
    rating: typeof p.rating === 'number' ? Math.round(p.rating) : undefined,
    themes: Array.isArray(p.themes) ? p.themes.filter((x): x is string => typeof x === 'string').slice(0, 12) : [],
    source,
  };
  return puzzle.solution.length === p.solution.length && !validatePuzzle(puzzle) ? puzzle : undefined;
};
