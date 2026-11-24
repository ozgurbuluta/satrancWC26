import { judgeMove, scoreOf, seedScore, type MoveQuality, type Score } from './engine';
import { firstMoveSquares } from './format';
import type { GameData } from './pgn';

export interface PlyJudgement {
  quality: MoveQuality;
  /** Winning chances given away by the mover, 0..2. */
  loss: number;
  before: Score;
  after: Score;
}

export const QUALITY_GLYPH: Record<MoveQuality, string> = {
  best: '★',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

/** Makes evaluations that came with the feed available to charts and move quality. */
export const seedGameScores = (game: GameData) => {
  for (const p of game.plies) if (p.ev) seedScore(p.fen, p.ev);
};

/** Quality of the move at 0-based index `i`, once both surrounding positions have a score. */
export const judgePly = (game: GameData, i: number): PlyJudgement | undefined => {
  const ply = game.plies[i];
  if (!ply) return undefined;
  const fenBefore = i === 0 ? game.initialFen : game.plies[i - 1].fen;
  const before = scoreOf(fenBefore);
  const after = scoreOf(ply.fen);
  if (!before || !after) return undefined;
  const whiteStarts = game.initialFen.split(' ')[1] !== 'b';
  const whiteMoved = (i % 2 === 0) === whiteStarts;
  const bestSquares = firstMoveSquares(fenBefore, before.best);
  const playedBest = !!bestSquares && bestSquares[0] === ply.from && bestSquares[1] === ply.to;
  const judged = judgeMove(before, after, whiteMoved, playedBest);
  return judged ? { ...judged, before, after } : undefined;
};
