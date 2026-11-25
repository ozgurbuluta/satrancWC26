// The move predictor: a base choice model over the legal moves, blended with
// what the player has played in the position before.
//
// The base model gives every legal move a score, a weighted sum of features
// read off the board, and turns the scores into probabilities. Its weights
// were fitted on the two players' earlier classical games (see
// scripts/train-predictor.mjs and docs/PREDICTOR.md): one set shared by
// everyone, a correction for each of the two players where the selection
// games supported one, and a correction that grows as the clock runs down.
//
// Where the player has been in the position before, the estimate is pulled
// towards what they played there:
//
//   p(m) = (own(m) + w · others(m) + κ · base(m)) / (own + w · others + κ)
//
// Up to this point the estimate lies between the base model and the share
// actually played (other people's moves counted at their discount w): it is
// the base model where there are no earlier games, and close to the played
// share where there are many. A last step then spreads a small share ε
// evenly over every legal move, a third ingredient that is neither of the
// two. Counts are aged, so a game of last month weighs more than one of
// three years ago.
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
    /** Corrections per player key ("gukesh", "sindarov"). All zero where none were fitted. */
    players: Record<string, number[]>;
    /** Correction applied in proportion to clock pressure (0 to 1). */
    clock: number[];
  };
  /** The base model's scores are divided by this before they become probabilities. Chosen on the selection games. */
  temperature: number;
  /** How earlier moves are blended with the base model. All of it chosen on the selection games. */
  blend: {
    /** How many earlier games the base model is worth. */
    kappa: number;
    /** What a move played here by someone else counts for, next to one of the player's own. */
    others: number;
    /** Counts halve with every this many years of age; null for no ageing. Already applied to the tables. */
    halfLifeYears: number | null;
    /** A small share spread evenly over every legal move. */
    epsilon: number;
    /** The day the tables are aged as of. */
    asOf: string;
  };
  /** FIDE id to player key. */
  players: Record<string, string>;
  /** Whose counts the numbers of a table entry are, in order: player keys, then "others" if they count. */
  priorColumns: string[];
  /** Moves played before in a position: position key, then "uci count count …" for each move, joined by "|". */
  priors: Record<string, string>;
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

/** What was played before in a position: for each move, one count per column of `priorColumns`. */
export const earlierMoves = (model: PredictorModel, key: string): Map<string, number[]> => {
  const moves = new Map<string, number[]>();
  const entry = model.priors[key];
  if (!entry) return moves;
  for (const part of entry.split('|')) {
    const [uci, ...counts] = part.split(' ');
    moves.set(uci, counts.map(Number));
  }
  return moves;
};

/** The model's estimate for the next move in a position. */
export const predict = (model: PredictorModel, input: PredictInput): Prediction => {
  const playerKey = input.moverId ? model.players[input.moverId] : undefined;
  const cands = candidates({ fen: input.fen, lastMove: input.lastMove, ownLastMove: input.ownLastMove });
  const pressure = clockPressure(input.secondsLeft, model.clockFullSeconds);
  const urgency = matchUrgency(input.match);
  if (cands.length === 0) return { supported: !!playerKey, moves: [], other: 0, pressure, urgency, seenBefore: false };
  const scores = fittedScores(model, cands, playerKey, pressure).map(
    // The match rule: a player who is behind is taken to avoid even trades a little, one who is ahead to welcome them.
    (s, i) => s / model.temperature - urgency * model.stakesMax * cands[i].f[TRADE],
  );
  let p = softmax(scores);
  let seenBefore = false;
  const column = playerKey ? model.priorColumns.indexOf(playerKey) : -1;
  if (column >= 0) {
    // the player's own earlier moves here, other people's at a discount, and the base model as kappa games' worth
    const { kappa, others, epsilon } = model.blend;
    const played = earlierMoves(model, positionKey(input.fen));
    const mass = p.map(q => kappa * q);
    let total = kappa;
    cands.forEach((c, i) => {
      const counts = played.get(c.uci);
      if (!counts) return;
      const own = counts[column] ?? 0;
      const rest = counts.reduce((sum, x) => sum + x, 0) - own;
      if (own > 0) seenBefore = true;
      mass[i] += own + others * rest;
      total += own + others * rest;
    });
    p = mass.map(m => ((1 - epsilon) * m) / total + epsilon / cands.length);
  }
  const moves = cands.map((c, i) => ({ uci: c.uci, san: c.san, p: p[i] })).sort((a, b) => b.p - a.p || a.uci.localeCompare(b.uci));
  const top = moves.slice(0, 3).reduce((sum, m) => sum + m.p, 0);
  return { supported: !!playerKey, moves, other: Math.max(0, 1 - top), pressure, urgency, seenBefore };
};

export interface Share {
  uci: string;
  san: string;
  percent: number;
  /** Has a share, but under one percent. Shown as "<1 %": a 0 would say the move cannot be played. */
  belowOne: boolean;
}

export interface Shares {
  top: Share[];
  /** Everything that is not one of the moves shown. */
  other: number;
  /** There are other legal moves, and together they have under one percent. */
  otherBelowOne: boolean;
}

/**
 * The first three moves as whole percentages, with the rest as "other", so
 * that what is shown adds up to exactly 100. The three are rounded down to
 * leave "other" at least its true share: they are never stretched to fill
 * the hundred.
 *
 * Rounding down can leave a legal move at 0. It is marked `belowOne` so the
 * page can say "<1 %" instead. Only the wording changes: the whole numbers
 * and the probabilities behind them stay as they are.
 */
export const shares = (prediction: Prediction, count = 3): Shares => {
  const top: Share[] = prediction.moves.slice(0, count).map(m => ({ uci: m.uci, san: m.san, percent: Math.floor(m.p * 100 + 1e-9), belowOne: false }));
  if (top.length === 0) return { top, other: 0, otherBelowOne: false };
  const all = prediction.moves.length <= count;
  const rest = 100 - top.reduce((sum, m) => sum + m.percent, 0);
  // every legal move is on the list: the rounding remainder goes to the first of them, and nothing is "other"
  if (all) top[0].percent += rest;
  top.forEach((m, i) => {
    m.belowOne = m.percent === 0 && prediction.moves[i].p > 0;
  });
  return { top, other: all ? 0 : rest, otherBelowOne: !all && rest === 0 && prediction.moves.slice(count).some(m => m.p > 0) };
};
