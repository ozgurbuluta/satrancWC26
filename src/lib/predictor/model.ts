// The move predictor: a model of the board, pulled towards what strong
// players play in the position, and then towards what this player has played
// there before.
//
// The board model gives every legal move a score, a weighted sum of features
// read off the board, and turns the scores into probabilities. Its weights
// were fitted on the two players' earlier classical games (see
// scripts/train-predictor.mjs and docs/PREDICTOR.md).
//
// In the opening it knows no theory, so two things are laid over it:
//
//   base(m) = (theory(m) + ν · board(m)) / (all theory + ν)
//   p(m)    = (own(m) + μ · same(m) + κ · base(m)) / (own + μ · same + κ)
//
//   theory  how often players rated 2600 or more played m here;
//   own     how often this player did, in earlier tournaments;
//   same    how often this player did in the earlier games of this match,
//           read from the games as they are played.
//
// Every count is aged, so a game of last month weighs more than one of three
// years ago. A last step spreads a small share ε evenly over every legal
// move. Up to that step the estimate lies between the three ingredients:
// the board model where nothing else is known, theory where strong players
// have been, the player's own habits where the player has.
//
// The match situation (score and games left) is not something the two
// players' own games can teach: they are tournaments, not matches. It enters
// through a small correction to the board model's scores, learned from other
// players' two-game knockout matches (scripts/predictor-v3-situation.mjs)
// and scaled by how many points the mover is behind for each game left.
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { candidates, positionKey, type Candidate } from './features';

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
  /** How the estimate is put together. All of it chosen on the selection games. */
  blend: {
    /** How many of the player's own games the base is worth. */
    kappa: number;
    /** The player's own counts halve with every this many years; null for no ageing. Already applied to the table. */
    halfLifeYears: number | null;
    /** A small share spread evenly over every legal move. */
    epsilon: number;
    /** How many theory games the board model is worth; null where no theory is used. */
    nu: number | null;
    /** Theory counts halve with every this many years; already applied to the table. */
    theoryHalfLifeYears: number | null;
    /** Theory is used for the first this many half-moves of a game. */
    theoryPlies: number;
    /** What a move of the player in an earlier game of this match counts for, next to one in an earlier tournament. */
    same: number;
    /** The day the tables are aged as of. */
    asOf: string;
  };
  /** FIDE id to player key. */
  players: Record<string, string>;
  /** Whose count a letter in the tables stands for: a player key, or "others". */
  priorColumns: Record<string, string>;
  /**
   * Moves played before, as one text: "key=move,move;key=move". A move is
   * its UCI followed by a letter and a count for each column that has one:
   * "e2e4g2.5x1" is e2e4, 2.5 times by the player of column g and once by
   * column x. Counts are already aged. Keys are the last eight characters
   * of the position key.
   */
  priors: string;
  /** What players rated 2600 or more played, the same way: "key=move12.5,move3;…", a count right after each move. */
  theory: string;
  /**
   * What the score of the match does to a move's score, a weight for each feature: added in full for a player
   * who must win the last game, taken off in full for one a draw is enough for, scaled by the urgency in between.
   */
  situation: number[];
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
  /** The earlier games of this match, oldest first: what the two have already played against each other. */
  earlier?: EarlierGame[];
}

/** A finished game of the match being followed. */
export interface EarlierGame {
  whiteId?: string;
  blackId?: string;
  /** Its moves in UCI, from the first. */
  moves: string[];
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
  /** How much the score presses on the mover, between -1 (leads, last game) and 1 (trails, last game). 0: no effect. */
  urgency: number;
  /** The player has been in this exact position before in the data. */
  seenBefore: boolean;
}

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

/** The key a position is stored under in the tables: the last eight characters of its position key. */
export const tableKey = (fen: string): string => positionKey(fen).slice(-8);

/** A table of a model by key, read from its text once and kept. */
const tables = new WeakMap<PredictorModel, Record<string, Map<string, string>>>();
const tableOf = (model: PredictorModel, which: 'priors' | 'theory'): Map<string, string> => {
  let both = tables.get(model);
  if (!both) tables.set(model, (both = {}));
  let table = both[which];
  if (!table) {
    table = new Map();
    for (const part of (model[which] ?? '').split(';')) {
      const at = part.indexOf('=');
      if (at > 0) table.set(part.slice(0, at), part.slice(at + 1));
    }
    both[which] = table;
  }
  return table;
};

/** What the two players played before in a position: for each move, how often by each of them. */
export const earlierMoves = (model: PredictorModel, key: string): Map<string, Record<string, number>> => {
  const moves = new Map<string, Record<string, number>>();
  const entry = tableOf(model, 'priors').get(key);
  if (!entry) return moves;
  for (const part of entry.split(',')) {
    const move = /^([a-h][1-8][a-h][1-8][qrbn]?)(.*)$/.exec(part);
    if (!move) continue;
    const counts: Record<string, number> = {};
    for (const [, letter, count] of move[2].matchAll(/([a-z])(\d*\.?\d+)/g)) {
      const who = model.priorColumns[letter];
      if (who) counts[who] = Number(count);
    }
    moves.set(move[1], counts);
  }
  return moves;
};

/** What strong players played in a position: for each move, how often (aged). */
export const theoryMoves = (model: PredictorModel, key: string): Map<string, number> => {
  const moves = new Map<string, number>();
  const entry = tableOf(model, 'theory').get(key);
  if (!entry) return moves;
  for (const part of entry.split(',')) {
    const move = /^([a-h][1-8][a-h][1-8][qrbn]?)(\d*\.?\d+)$/.exec(part);
    if (move) moves.set(move[1], Number(move[2]));
  }
  return moves;
};

/** The first half-moves of a game as positions and the moves played in them. Stops at a move it cannot play. */
const replays = new WeakMap<string[], { key: string; uci: string; white: boolean }[]>();
export const positionsOf = (moves: string[], limit = 40): { key: string; uci: string; white: boolean }[] => {
  const known = replays.get(moves);
  if (known) return known;
  const out: { key: string; uci: string; white: boolean }[] = [];
  const pos = Chess.default();
  for (const uci of moves.slice(0, limit)) {
    const move = parseUci(uci);
    if (!move || !pos.isLegal(move)) break;
    out.push({ key: tableKey(makeFen(pos.toSetup())), uci, white: pos.turn === 'white' });
    pos.play(move);
  }
  replays.set(moves, out);
  return out;
};

/** The model's estimate for the next move in a position. */
export const predict = (model: PredictorModel, input: PredictInput): Prediction => {
  const playerKey = input.moverId ? model.players[input.moverId] : undefined;
  const cands = candidates({ fen: input.fen, lastMove: input.lastMove, ownLastMove: input.ownLastMove });
  const pressure = clockPressure(input.secondsLeft, model.clockFullSeconds);
  const urgency = matchUrgency(input.match);
  if (cands.length === 0) return { supported: !!playerKey, moves: [], other: 0, pressure, urgency, seenBefore: false };
  const scores = fittedScores(model, cands, playerKey, pressure).map((s, i) => {
    // The score of the match: what a player who must win does differently from one a draw is enough for.
    let shift = 0;
    if (urgency !== 0) for (let k = 0; k < model.situation.length; k++) shift += model.situation[k] * cands[i].f[k];
    return s / model.temperature + urgency * shift;
  });
  let p = softmax(scores);
  let seenBefore = false;
  if (playerKey && Object.values(model.priorColumns).includes(playerKey)) {
    const { kappa, epsilon, nu, theoryPlies, same } = model.blend;
    const key = tableKey(input.fen);
    const fields = input.fen.trim().split(/\s+/);
    const ply = ((Number(fields[5]) || 1) - 1) * 2 + (fields[1] === 'b' ? 1 : 0);
    // the board model, pulled towards what strong players played here
    if (nu !== null && ply < theoryPlies) {
      const theory = theoryMoves(model, key);
      if (theory.size) {
        const played = cands.map(c => theory.get(c.uci) ?? 0);
        const total = played.reduce((sum, x) => sum + x, nu);
        p = p.map((q, i) => (played[i] + nu * q) / total);
      }
    }
    // then towards the player's own earlier moves here: in earlier tournaments, and in this match's earlier games
    const own = earlierMoves(model, key);
    const mass = p.map(q => kappa * q);
    let total = kappa;
    const add = (uci: string, weight: number) => {
      const at = cands.findIndex(c => c.uci === uci);
      if (at < 0 || weight <= 0) return;
      seenBefore = true;
      mass[at] += weight;
      total += weight;
    };
    for (const [uci, counts] of own) add(uci, counts[playerKey] ?? 0);
    if (same > 0) {
      for (const game of input.earlier ?? []) {
        const moverIsWhite = game.whiteId === input.moverId ? true : game.blackId === input.moverId ? false : undefined;
        if (moverIsWhite === undefined) continue;
        for (const step of positionsOf(game.moves)) if (step.white === moverIsWhite && step.key === key) add(step.uci, same);
      }
    }
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
