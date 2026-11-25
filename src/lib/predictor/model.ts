// The move predictor: a fitted choice model over the legal moves.
//
// Every legal move gets a score, a weighted sum of its features. The weights
// were fitted on the two players' earlier classical games (see
// scripts/train-predictor.mjs and docs/PREDICTOR.md). Scores become
// probabilities that sum to one over all legal moves. There is one set of
// weights shared by everyone, a correction for each of the two players, and
// a correction that grows as the mover's clock runs down.
//
// The match situation (score and games left) is not something the data can
// teach: the earlier games are tournaments, not matches. It enters through
// one rule that is written down here and labelled as a rule wherever it is
// shown, never as something the model learned.
import { candidates, FEATURES, positionKey, type Candidate } from './features';

export interface PredictorModel {
  version: number;
  features: string[];
  weights: {
    shared: number[];
    /** Corrections per player key ("gukesh", "sindarov"). */
    players: Record<string, number[]>;
    /** Correction applied in proportion to clock pressure (0 to 1). */
    clock: number[];
  };
  /** Scores are divided by this before they become probabilities. Fitted on the calibration games. */
  temperature: number;
  /** FIDE id to player key. */
  players: Record<string, string>;
  /** Moves played before in a position: position key, then UCI, then count. By player key, and for everyone. */
  priors: { players: Record<string, Record<string, Record<string, number>>>; any: Record<string, Record<string, number>> };
  /** The match-situation rule: the most it can add to or take from a move's score. */
  stakesMax: number;
  /** Seconds on the clock below which pressure starts to count. */
  clockFullSeconds: number;
}

export interface MatchSituation {
  moverPoints: number;
  opponentPoints: number;
  /** Games still to be played, counting the one in progress. */
  gamesLeft: number;
}

export interface PredictInput {
  fen: string;
  lastMove?: string;
  ownLastMove?: string;
  /** FIDE id of the player to move. */
  moverId?: string;
  /** Seconds on the mover's clock before this move, when known. */
  secondsLeft?: number;
  match?: MatchSituation;
}

export interface PredictedMove {
  uci: string;
  san: string;
  /** Probability among all legal moves, between 0 and 1. */
  p: number;
}

export interface Prediction {
  /** Whether the model has weights of its own for this player. */
  supported: boolean;
  /** Every legal move, most likely first. Empty when the game is over in this position. */
  moves: PredictedMove[];
  /** What is left after the first three: the probability of any other move. */
  other: number;
  /** Clock pressure used, 0 (none) to 1. */
  pressure: number;
  /** The match rule's strength used, between -1 (mover leads, last game) and 1 (mover trails, last game). 0: no effect. */
  urgency: number;
  /** The player has been in this exact position before in the data. */
  seenBefore: boolean;
}

const TRADE = FEATURES.indexOf('trade');

/** 0 while there is plenty of time, rising to 1 as the clock runs out. */
export const clockPressure = (secondsLeft: number | undefined, fullSeconds: number): number =>
  secondsLeft === undefined || !Number.isFinite(secondsLeft) ? 0 : Math.max(0, Math.min(1, (fullSeconds - secondsLeft) / fullSeconds));

/**
 * How much the match situation presses on the mover: the points they are
 * behind, per game left. Positive when trailing, negative when leading,
 * between -1 and 1, and close to 0 early in a long match.
 */
export const matchUrgency = (m: MatchSituation | undefined): number =>
  m && m.gamesLeft > 0 ? Math.max(-1, Math.min(1, (m.opponentPoints - m.moverPoints) / m.gamesLeft)) : 0;

/** Scores of the candidates under the fitted weights alone, before the temperature and the match rule. */
export const fittedScores = (model: PredictorModel, cands: Candidate[], playerKey: string | undefined, pressure: number): number[] => {
  const own = playerKey ? model.weights.players[playerKey] : undefined;
  return cands.map(c => {
    let score = 0;
    for (let k = 0; k < c.f.length; k++) {
      if (c.f[k] === 0) continue;
      score += c.f[k] * (model.weights.shared[k] + (own ? own[k] : 0) + pressure * model.weights.clock[k]);
    }
    return score;
  });
};

export const softmax = (scores: number[]): number[] => {
  const max = Math.max(...scores);
  const e = scores.map(s => Math.exp(s - max));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map(x => x / sum);
};

/** The model's estimate for the next move in a position. */
export const predict = (model: PredictorModel, input: PredictInput): Prediction => {
  const playerKey = input.moverId ? model.players[input.moverId] : undefined;
  const key = positionKey(input.fen);
  const repPlayer = playerKey ? model.priors.players[playerKey]?.[key] : undefined;
  const cands = candidates({ fen: input.fen, lastMove: input.lastMove, ownLastMove: input.ownLastMove, repPlayer, repAny: model.priors.any[key] });
  const pressure = clockPressure(input.secondsLeft, model.clockFullSeconds);
  const urgency = matchUrgency(input.match);
  if (cands.length === 0) return { supported: !!playerKey, moves: [], other: 0, pressure, urgency, seenBefore: false };
  const scores = fittedScores(model, cands, playerKey, pressure).map(
    // The match rule: a player who is behind is taken to avoid even trades a little, one who is ahead to welcome them.
    (s, i) => s / model.temperature - urgency * model.stakesMax * cands[i].f[TRADE],
  );
  const p = softmax(scores);
  const moves = cands.map((c, i) => ({ uci: c.uci, san: c.san, p: p[i] })).sort((a, b) => b.p - a.p || a.uci.localeCompare(b.uci));
  const top = moves.slice(0, 3).reduce((sum, m) => sum + m.p, 0);
  return { supported: !!playerKey, moves, other: Math.max(0, 1 - top), pressure, urgency, seenBefore: !!repPlayer };
};

export interface Shares {
  top: { uci: string; san: string; percent: number }[];
  /** Everything that is not one of the moves shown. */
  other: number;
}

/**
 * The first three moves as whole percentages, with the rest as "other", so
 * that what is shown adds up to exactly 100. The three are rounded down to
 * leave "other" at least its true share: they are never stretched to fill
 * the hundred.
 */
export const shares = (prediction: Prediction, count = 3): Shares => {
  const top = prediction.moves.slice(0, count).map(m => ({ uci: m.uci, san: m.san, percent: Math.floor(m.p * 100 + 1e-9) }));
  if (top.length === 0) return { top, other: 0 };
  if (prediction.moves.length <= count && top.length > 0) {
    // every legal move is on the list: the rounding remainder goes to the first of them, and nothing is "other"
    top[0].percent += 100 - top.reduce((sum, m) => sum + m.percent, 0);
    return { top, other: 0 };
  }
  return { top, other: 100 - top.reduce((sum, m) => sum + m.percent, 0) };
};
