import { describe, expect, it } from 'vitest';
import shipped from '../src/data/predictor.json';
import { legalSans } from '../src/lib/position';
import { candidates, FEATURES, FEATURE_COUNT, positionKey } from '../src/lib/predictor/features';
import { clockPressure, earlierMoves, matchUrgency, predict, shares, type PredictorModel } from '../src/lib/predictor/model';

const MODEL = shipped as unknown as PredictorModel;
/** A model with no weights and no tables: every legal move equally likely. */
const FLAT: PredictorModel = {
  ...MODEL,
  weights: { shared: MODEL.features.map(() => 0), players: {}, clock: MODEL.features.map(() => 0) },
  temperature: 1,
  blend: { kappa: 1, others: 0, halfLifeYears: null, epsilon: 0, asOf: '2026-11-01' },
  priorColumns: ['gukesh', 'sindarov'],
  priors: {},
};
const GUKESH = '46616543';
const SINDAROV = '14205483';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ITALIAN = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
const POSITIONS = [
  START,
  ITALIAN,
  'r3k2r/pp1b1ppp/2n1pn2/q2p4/3P4/2PBPN2/PP3PPP/R1BQ1RK1 b kq - 2 10', // middlegame, castling still possible
  '8/3P1k2/8/8/8/8/5K2/8 w - - 0 60', // a pawn about to promote
  '8/8/8/3k4/8/3K4/3R4/8 b - - 0 70', // a king with few moves
  '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 30', // en passant possible
];
const feature = (fen: string, uci: string, name: (typeof FEATURES)[number], extra: Partial<Parameters<typeof candidates>[0]> = {}) => {
  const cand = candidates({ fen, ...extra }).find(c => c.uci === uci);
  if (!cand) throw new Error(`${uci} is not legal in ${fen}`);
  return cand.f[FEATURES.indexOf(name)];
};

describe('the candidates of a position', () => {
  it('are exactly its legal moves, each with a full row of finite numbers', () => {
    for (const fen of POSITIONS) {
      const cands = candidates({ fen });
      expect(cands.map(c => c.san).sort(), fen).toEqual(legalSans(fen));
      expect(new Set(cands.map(c => c.uci)).size).toBe(cands.length);
      for (const c of cands) {
        expect(c.f).toHaveLength(FEATURE_COUNT);
        for (const x of c.f) expect(Number.isFinite(x)).toBe(true);
      }
    }
  });

  it('a finished or unreadable position has none', () => {
    expect(candidates({ fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3' })).toEqual([]); // mate
    expect(candidates({ fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1' })).toEqual([]); // stalemate
    expect(candidates({ fen: 'not a position' })).toEqual([]);
  });

  it('counts what an exchange wins or loses', () => {
    // a pawn takes an undefended knight: three pawns' worth
    expect(feature('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1', 'e4d5', 'exchange')).toBeCloseTo(3 / 9);
    // a knight takes a pawn that a pawn defends: wins one, loses three
    expect(feature('4k3/4p3/3p4/8/4N3/8/8/4K3 w - - 0 1', 'e4d6', 'exchange')).toBeCloseTo(-2 / 9);
    expect(feature('4k3/4p3/3p4/8/4N3/8/8/4K3 w - - 0 1', 'e4d6', 'losesMaterial')).toBe(1);
    // a quiet move onto a square a pawn attacks loses the piece
    expect(feature('4k3/8/3p4/8/8/3N4/8/4K3 w - - 0 1', 'd3e5', 'exchange')).toBeCloseTo(-3 / 9);
    // a quiet move to a safe square loses nothing
    expect(feature('4k3/8/3p4/8/8/3N4/8/4K3 w - - 0 1', 'd3f4', 'exchange')).toBe(0);
  });

  it('knows a recapture, a trade, a check, a mate, castling and promotion', () => {
    // Black has just taken on d5 with the queen; taking back with the knight is a recapture
    const afterCapture = 'rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 3';
    expect(feature(afterCapture, 'c3d5', 'recapture', { lastMove: 'd8d5' })).toBe(1);
    expect(feature(afterCapture, 'c3d5', 'recapture')).toBe(0); // without knowing the last move it is only a capture
    // queen takes a defended queen: an even trade. Taking a queen nothing defends is not a trade, it wins her.
    expect(feature('3qk3/8/8/8/8/8/8/3QK3 w - - 0 1', 'd1d8', 'trade')).toBe(1); // the king takes back
    expect(feature('r2qk3/8/8/8/8/8/8/3QK3 w - - 0 1', 'd1d8', 'trade')).toBe(1); // the rook takes back
    expect(feature('3q4/8/8/8/8/8/k7/3QK3 w - - 0 1', 'd1d8', 'trade')).toBe(0);
    expect(feature('3q4/8/8/8/8/8/k7/3QK3 w - - 0 1', 'd1d8', 'exchange')).toBeCloseTo(1);
    expect(feature('3qk3/8/8/8/8/8/8/3QK3 w - - 0 1', 'd1d8', 'capture')).toBe(1);
    expect(feature('4k3/8/8/8/8/8/8/4KR2 w - - 0 1', 'f1f8', 'check')).toBe(1);
    expect(feature('6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1', 'e1e8', 'mate')).toBe(1);
    const castles = candidates({ fen: ITALIAN }).filter(c => c.f[FEATURES.indexOf('castle')] === 1);
    expect(castles.map(c => c.san)).toEqual(['O-O']);
    const promotions = candidates({ fen: '8/3P1k2/8/8/8/8/5K2/8 w - - 0 60' }).filter(c => c.f[FEATURES.indexOf('promotion')] > 0);
    expect(promotions.map(c => c.san.replace('+', '')).sort()).toEqual(['d8=B', 'd8=N', 'd8=Q', 'd8=R']);
  });

  it('measures what is left hanging against the safest move, not in absolute terms', () => {
    // White's queen is attacked by a pawn. Moving it away leaves nothing; any other move leaves it hanging.
    const fen = '4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1';
    const hanging = FEATURES.indexOf('leftHanging');
    const cands = candidates({ fen });
    expect(cands.find(c => c.uci === 'd4a4')!.f[hanging]).toBe(0);
    expect(cands.find(c => c.uci === 'e1e2')!.f[hanging]).toBeCloseTo(1);
    expect(feature(fen, 'd4a4', 'escape')).toBe(1);
  });

  it('counts moves played before in the same position', () => {
    expect(feature(START, 'e2e4', 'repPlayer', { repPlayer: { e2e4: 7 } })).toBeCloseTo(Math.log(8));
    expect(feature(START, 'd2d4', 'repPlayer', { repPlayer: { e2e4: 7 } })).toBe(0);
    expect(feature(START, 'e2e4', 'repAny', { repAny: { e2e4: 2 } })).toBeCloseTo(Math.log(3));
  });

  it('gives a position the same key whatever its move counters say', () => {
    expect(positionKey(START)).toBe(positionKey(START.replace('0 1', '12 40')));
    expect(positionKey(START)).not.toBe(positionKey(START.replace(' w ', ' b ')));
    expect(positionKey(START)).not.toBe(positionKey(ITALIAN));
    expect(positionKey(START)).toMatch(/^[0-9a-z]{6,12}$/);
  });
});

describe('the estimate', () => {
  it('spreads exactly one over the legal moves, most likely first', () => {
    for (const fen of POSITIONS) {
      const p = predict(MODEL, { fen, moverId: GUKESH });
      expect(p.moves.map(m => m.san).sort()).toEqual(legalSans(fen));
      expect(p.moves.reduce((sum, m) => sum + m.p, 0)).toBeCloseTo(1, 9);
      for (let i = 1; i < p.moves.length; i++) expect(p.moves[i - 1].p).toBeGreaterThanOrEqual(p.moves[i].p);
      expect(p.other).toBeCloseTo(1 - p.moves.slice(0, 3).reduce((sum, m) => sum + m.p, 0), 9);
      expect(p.other).toBeGreaterThanOrEqual(0);
    }
  });

  it('shows whole percentages that add up to exactly 100, and never stretches the three to fill it', () => {
    for (const fen of POSITIONS) {
      for (const moverId of [GUKESH, SINDAROV, undefined]) {
        const p = predict(MODEL, { fen, moverId });
        const s = shares(p);
        expect(s.top.reduce((sum, m) => sum + m.percent, 0) + s.other).toBe(100);
        expect(s.top.length).toBe(Math.min(3, p.moves.length));
        if (p.moves.length > 3) {
          // what is shown for "other" is never less than its true share
          expect(s.other).toBeGreaterThanOrEqual(Math.floor(p.other * 100));
          for (let i = 0; i < 3; i++) expect(s.top[i].percent).toBeLessThanOrEqual(p.moves[i].p * 100 + 1e-6);
        } else {
          expect(s.other).toBe(0);
        }
      }
    }
  });

  it('marks a legal move whose share rounds down to nothing, and changes no number for it', () => {
    // the first move of the game: two moves take nearly everything, the third has a share far under one percent
    for (const moverId of [GUKESH, SINDAROV]) {
      const p = predict(MODEL, { fen: START, moverId });
      const before = JSON.stringify(p);
      const s = shares(p);
      expect(p.moves[2].p).toBeGreaterThan(0);
      expect(p.moves[2].p).toBeLessThan(0.01);
      expect(s.top.map(m => m.belowOne)).toEqual([false, false, true]);
      expect(s.top[2].percent).toBe(0);
      expect(s.otherBelowOne).toBe(false);
      // the whole numbers still add up to 100, and the estimate itself is untouched
      expect(s.top.reduce((sum, m) => sum + m.percent, 0) + s.other).toBe(100);
      expect(JSON.stringify(p)).toBe(before);
    }
    // a move is marked only when it has a share and that share shows as 0
    for (const fen of POSITIONS) {
      const p = predict(MODEL, { fen, moverId: GUKESH });
      shares(p).top.forEach((m, i) => expect(m.belowOne).toBe(m.percent === 0 && p.moves[i].p > 0));
    }
  });

  it('marks "other" the same way when the moves left over are almost nothing', () => {
    const move = (uci: string, p: number) => ({ uci, san: uci, p });
    const base = { supported: true, pressure: 0, urgency: 0, seenBefore: false };
    // one move all but certain, with more legal moves than the list shows
    const sure = { ...base, moves: [move('a1a2', 1 - 1e-12), move('a1a3', 5e-13), move('a1a4', 3e-13), move('a1a5', 2e-13)], other: 2e-13 };
    expect(shares(sure)).toMatchObject({ other: 0, otherBelowOne: true });
    expect(shares(sure).top.map(m => m.belowOne)).toEqual([false, true, true]);
    // every legal move on the list: nothing is "other", marked or not
    const two = { ...base, moves: [move('a1a2', 0.997), move('a1a3', 0.003)], other: 0 };
    expect(shares(two)).toEqual({ top: [{ uci: 'a1a2', san: 'a1a2', percent: 100, belowOne: false }, { uci: 'a1a3', san: 'a1a3', percent: 0, belowOne: true }], other: 0, otherBelowOne: false });
    // a share of exactly nothing is not marked
    const none = { ...base, moves: [move('a1a2', 1), move('a1a3', 0)], other: 0 };
    expect(shares(none).top.map(m => m.belowOne)).toEqual([false, false]);
  });

  it('breaks exact ties by the move text, the same way every time', () => {
    const p = predict(FLAT, { fen: START });
    expect(new Set(p.moves.map(m => m.p.toFixed(12))).size).toBe(1);
    expect(p.moves.map(m => m.uci)).toEqual([...p.moves.map(m => m.uci)].sort());
  });

  it('has nothing to show when the game is over in the position', () => {
    const p = predict(MODEL, { fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', moverId: GUKESH });
    expect(p.moves).toEqual([]);
    expect(shares(p)).toEqual({ top: [], other: 0, otherBelowOne: false });
  });

  it('says whether it knows the player', () => {
    expect(predict(MODEL, { fen: START, moverId: GUKESH }).supported).toBe(true);
    expect(predict(MODEL, { fen: START, moverId: SINDAROV }).supported).toBe(true);
    expect(predict(MODEL, { fen: START, moverId: '1503014' }).supported).toBe(false);
    expect(predict(MODEL, { fen: START }).supported).toBe(false);
  });

  it('uses the player’s own opening table', () => {
    const p = predict(MODEL, { fen: START, moverId: SINDAROV });
    expect(p.seenBefore).toBe(true);
    // far from any opening the table has nothing
    expect(predict(MODEL, { fen: '8/8/8/3k4/8/3K4/3R4/8 b - - 0 70', moverId: SINDAROV }).seenBefore).toBe(false);
  });
});

describe('earlier moves blended with the base model', () => {
  // A base model that finds all twenty first moves equally likely, so every number below can be worked out by hand.
  const at = (model: PredictorModel, uci: string, moverId = GUKESH) => predict(model, { fen: START, moverId }).moves.find(m => m.uci === uci)!.p;
  const withTable = (entry: string, blend: Partial<PredictorModel['blend']> = {}): PredictorModel => ({ ...FLAT, blend: { ...FLAT.blend, ...blend }, priors: { [positionKey(START)]: entry } });

  it('is the base model where nothing was played before', () => {
    const p = predict(FLAT, { fen: START, moverId: GUKESH });
    for (const m of p.moves) expect(m.p).toBeCloseTo(1 / 20, 12);
    expect(p.seenBefore).toBe(false);
  });

  it('pulls towards what the player played, by (own + κ·base) / (games + κ)', () => {
    // Gukesh: e4 three times, d4 once. κ = 2, so the base model is worth two games.
    const model = withTable('e2e4 3 0|d2d4 1 5', { kappa: 2 });
    expect(at(model, 'e2e4')).toBeCloseTo((3 + 2 / 20) / (4 + 2), 12);
    expect(at(model, 'd2d4')).toBeCloseTo((1 + 2 / 20) / (4 + 2), 12);
    expect(at(model, 'g1f3')).toBeCloseTo((2 / 20) / (4 + 2), 12);
    expect(predict(model, { fen: START, moverId: GUKESH }).seenBefore).toBe(true);
    // the other player's column is their own: Sindarov has only played d4 here
    expect(at(model, 'd2d4', SINDAROV)).toBeCloseTo((5 + 2 / 20) / (5 + 2), 12);
    expect(at(model, 'e2e4', SINDAROV)).toBeCloseTo((2 / 20) / (5 + 2), 12);
  });

  it('before ε, lies between the base model and the share that was played, and does not sharpen a mixed repertoire', () => {
    // 60 / 40 in a hundred games stays close to 60 / 40, a little towards the base model's 5 % each
    const model = withTable('e2e4 60 0|d2d4 40 0', { kappa: 2 });
    expect(at(model, 'e2e4')).toBeLessThan(0.6);
    expect(at(model, 'e2e4')).toBeGreaterThan(0.58);
    expect(at(model, 'd2d4')).toBeLessThan(0.4);
    expect(at(model, 'd2d4')).toBeGreaterThan(0.39);
    // a move that was never played is above its played share of nothing: it keeps the base model's part
    expect(at(model, 'g1f3')).toBeCloseTo((2 / 20) / 102, 12);
    // every move is between its base probability and its played share, whichever of the two is larger
    for (const m of predict(model, { fen: START, moverId: GUKESH }).moves) {
      const played = m.uci === 'e2e4' ? 0.6 : m.uci === 'd2d4' ? 0.4 : 0;
      expect(m.p).toBeGreaterThanOrEqual(Math.min(played, 1 / 20) - 1e-12);
      expect(m.p).toBeLessThanOrEqual(Math.max(played, 1 / 20) + 1e-12);
    }
    // ε is a third ingredient, mixed in afterwards: (1 − ε) of the blend plus ε / 20 for every move
    const smoothed = withTable('e2e4 60 0|d2d4 40 0', { kappa: 2, epsilon: 0.1 });
    expect(at(smoothed, 'e2e4')).toBeCloseTo(0.9 * at(model, 'e2e4') + 0.1 / 20, 12);
    expect(at(smoothed, 'g1f3')).toBeCloseTo(0.9 * at(model, 'g1f3') + 0.1 / 20, 12);
    // one game is weak evidence: the move is likelier than the rest, far from certain
    const once = withTable('e2e4 1 0', { kappa: 2 });
    expect(at(once, 'e2e4')).toBeCloseTo((1 + 0.1) / 3, 12);
  });

  it('counts other people’s moves at a discount, or not at all', () => {
    // a third column: moves played here by anyone but the two
    const model: PredictorModel = { ...withTable('e2e4 1 0 0|c2c4 0 2 6', { kappa: 1, others: 0.25 }), priorColumns: ['gukesh', 'sindarov', 'others'] };
    // for Gukesh: one own e4; Sindarov's two and the others' six c4 count a quarter each
    expect(at(model, 'c2c4')).toBeCloseTo((0.25 * 8 + 1 / 20) / (1 + 2 + 1), 12);
    expect(at(model, 'e2e4')).toBeCloseTo((1 + 1 / 20) / (1 + 2 + 1), 12);
    const none: PredictorModel = { ...model, blend: { ...model.blend, others: 0 } };
    expect(at(none, 'c2c4')).toBeCloseTo((1 / 20) / 2, 12);
    // a position only others have been in is not one the player has seen
    const onlyOthers: PredictorModel = { ...model, priors: { [positionKey(START)]: 'c2c4 0 0 6' } };
    expect(predict(onlyOthers, { fen: START, moverId: GUKESH }).seenBefore).toBe(false);
  });

  it('leaves every legal move a small share when ε is set', () => {
    const model = withTable('e2e4 1000 0', { kappa: 0.25, epsilon: 0.02 });
    const p = predict(model, { fen: START, moverId: GUKESH });
    expect(p.moves.reduce((sum, m) => sum + m.p, 0)).toBeCloseTo(1, 12);
    for (const m of p.moves) expect(m.p).toBeGreaterThanOrEqual(0.02 / 20 - 1e-12);
    expect(p.moves[0].p).toBeLessThan(1 - 0.02 * (19 / 20) + 1e-12);
  });

  it('ignores a table entry for a move that is not legal, and a player it has no column for', () => {
    const model = withTable('e2e5 9 9|e2e4 1 0', { kappa: 1 });
    const p = predict(model, { fen: START, moverId: GUKESH });
    expect(p.moves).toHaveLength(20);
    expect(p.moves.reduce((sum, m) => sum + m.p, 0)).toBeCloseTo(1, 12);
    expect(at(model, 'e2e4')).toBeCloseTo((1 + 1 / 20) / 2, 12);
    // someone else to move: the base model alone, and the panel is told it does not know them
    const stranger = predict(model, { fen: START, moverId: '1503014' });
    expect(stranger.supported).toBe(false);
    for (const m of stranger.moves) expect(m.p).toBeCloseTo(1 / 20, 12);
  });

  it('applies the match rule to the base model, not to what was played', () => {
    const model = withTable('e2e4 1 0', { kappa: 1 });
    const calm = predict(model, { fen: START, moverId: GUKESH });
    const behind = predict(model, { fen: START, moverId: GUKESH, match: { moverPoints: 0, opponentPoints: 3, gamesLeft: 3 } });
    // no first move is a trade, so the rule changes nothing here
    expect(behind.urgency).toBe(1);
    expect(behind.moves.map(m => m.p)).toEqual(calm.moves.map(m => m.p));
  });
});

describe('clock pressure and the match rule', () => {
  it('pressure is nothing with time to spare and grows as the clock runs down', () => {
    expect(clockPressure(undefined, 600)).toBe(0);
    expect(clockPressure(7200, 600)).toBe(0);
    expect(clockPressure(600, 600)).toBe(0);
    expect(clockPressure(300, 600)).toBeCloseTo(0.5);
    expect(clockPressure(0, 600)).toBe(1);
    expect(clockPressure(Number.NaN, 600)).toBe(0);
  });

  it('urgency is the points behind per game left, and nearly nothing early in a long match', () => {
    expect(matchUrgency(undefined)).toBe(0);
    expect(matchUrgency({ moverPoints: 1, opponentPoints: 1, gamesLeft: 12 })).toBe(0);
    expect(matchUrgency({ moverPoints: 0.5, opponentPoints: 1.5, gamesLeft: 12 })).toBeCloseTo(1 / 12);
    expect(matchUrgency({ moverPoints: 6.5, opponentPoints: 7, gamesLeft: 1 })).toBeCloseTo(0.5);
    expect(matchUrgency({ moverPoints: 7, opponentPoints: 6, gamesLeft: 1 })).toBe(-1);
    expect(matchUrgency({ moverPoints: 0, opponentPoints: 7, gamesLeft: 2 })).toBe(1); // never beyond one
    expect(matchUrgency({ moverPoints: 3, opponentPoints: 4, gamesLeft: 0 })).toBe(0);
  });

  it('the match rule only shifts even trades, in the direction it says', () => {
    // a queen trade is on offer
    const fen = 'r2qk3/8/8/8/8/8/8/3QK3 w - - 0 30';
    const trade = (match?: { moverPoints: number; opponentPoints: number; gamesLeft: number }) => predict(MODEL, { fen, moverId: GUKESH, match }).moves.find(m => m.uci === 'd1d8')!.p;
    const neutral = trade();
    expect(trade({ moverPoints: 6, opponentPoints: 6, gamesLeft: 2 })).toBeCloseTo(neutral, 12);
    expect(trade({ moverPoints: 6, opponentPoints: 7, gamesLeft: 1 })).toBeLessThan(neutral); // behind: fewer trades
    expect(trade({ moverPoints: 7, opponentPoints: 6, gamesLeft: 1 })).toBeGreaterThan(neutral); // ahead: more
    // early in the match the rule barely moves anything
    expect(Math.abs(trade({ moverPoints: 0.5, opponentPoints: 1.5, gamesLeft: 12 }) - neutral)).toBeLessThan(0.02);
    // and it never touches a position without a trade
    const quiet = (match?: { moverPoints: number; opponentPoints: number; gamesLeft: number }) => predict(MODEL, { fen: START, moverId: GUKESH, match }).moves.map(m => m.p);
    expect(quiet({ moverPoints: 0, opponentPoints: 7, gamesLeft: 1 })).toEqual(quiet());
  });
});

describe('the model that is shipped', () => {
  const report = (shipped as unknown as { report: Record<string, any> }).report;

  it('has weights for exactly the features the code computes, and no weight on the old repertoire features', () => {
    expect(MODEL.features).toEqual([...FEATURES]);
    for (const w of [MODEL.weights.shared, MODEL.weights.clock, MODEL.weights.players.gukesh, MODEL.weights.players.sindarov]) {
      expect(w).toHaveLength(FEATURE_COUNT);
      for (const x of w) expect(Number.isFinite(x)).toBe(true);
      // earlier moves enter through the blend, not through the weighted sum
      expect(w[FEATURES.indexOf('repPlayer')]).toBe(0);
      expect(w[FEATURES.indexOf('repAny')]).toBe(0);
    }
    expect(MODEL.temperature).toBeGreaterThan(0);
    expect(MODEL.players).toEqual({ [GUKESH]: 'gukesh', [SINDAROV]: 'sindarov' });
  });

  it('blends with settings that were chosen on the selection games', () => {
    expect(MODEL.blend).toEqual({ kappa: 0.5, others: 0.5, halfLifeYears: 4, epsilon: 0.005, asOf: '2026-11-01' });
    expect(report.chosen.family).toBe('B');
    expect(report.chosen.onSelection.B).toBeLessThan(report.chosen.onSelection.A);
  });

  it('has tables that read as counts for the columns it names, for legal moves only', () => {
    expect(MODEL.priorColumns).toEqual(['gukesh', 'sindarov', 'others']);
    const keys = Object.keys(MODEL.priors);
    expect(keys.length).toBeGreaterThan(1000);
    for (const key of keys) {
      const moves = earlierMoves(MODEL, key);
      expect(moves.size).toBeGreaterThan(0);
      for (const [uci, counts] of moves) {
        expect(uci).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
        expect(counts).toHaveLength(3);
        for (const x of counts) expect(x).toBeGreaterThanOrEqual(0);
        expect(counts.some(x => x > 0)).toBe(true);
      }
    }
    // the first move of a game: both players have been there many times, and every move in the table is legal
    const first = earlierMoves(MODEL, positionKey(START));
    const legal = new Set(candidates({ fen: START }).map(c => c.uci));
    for (const uci of first.keys()) expect(legal.has(uci)).toBe(true);
    expect([...first.values()].reduce((sum, c) => sum + c[0], 0)).toBeGreaterThan(5);
    expect([...first.values()].reduce((sum, c) => sum + c[1], 0)).toBeGreaterThan(5);
  });

  it('carries its own measurements: a blind one on the untouched holdout, and the reused benchmark', () => {
    expect(report.selection.selected).toBe(455);
    expect(report.selection.tournaments).toBe(43);
    expect(report.split.fit).toMatchObject({ games: 233, decisions: 10578 });
    expect(report.split.selection).toMatchObject({ games: 118, decisions: 5733 });
    expect(report.split.holdout).toMatchObject({ games: 83, decisions: 4240 });
    expect(report.split.benchmark).toMatchObject({ games: 21, decisions: 963 });
    // what the panel quotes is the untouched holdout
    expect(report.shown.blind).toBe(true);
    expect(report.shown.n).toBe(4240);
    expect(report.shown.games).toBe(83);
    expect(report.shown.top3).toBeGreaterThanOrEqual(report.shown.top1);
    expect(report.shown.whenSure).toEqual(report.shown.sure70);
    expect(report.shown.whenSure.n).toBeGreaterThan(0);
    for (const k of ['logLoss', 'brier', 'top1', 'top3', 'ece']) {
      const [low, high] = report.shown.intervals[k];
      expect(low).toBeLessThanOrEqual(report.shown[k]);
      expect(high).toBeGreaterThanOrEqual(report.shown[k]);
    }
    // the benchmark is the first version's 963 decisions, and its published numbers are reproduced there
    expect(report.benchmark.blind).toBe(false);
    expect(report.benchmark.v1).toMatchObject({ n: 963, top1: 0.2876, top3: 0.5369, logLoss: 2.5489, brier: 0.8537, ece: 0.0949 });
    expect(report.benchmark.v2.n).toBe(963);
    expect(report.benchmark.v2.difference.logLoss.value).toBeCloseTo(report.benchmark.v2.logLoss - report.benchmark.v1.logLoss, 3);
    // the claim is the rule applied to the numbers, nothing else
    const c = report.claims;
    expect(c.benchmarkLogLossLower).toBe(report.benchmark.v2.difference.logLoss.interval[1] < 0);
    expect(c.benchmarkCalibrationErrorLower).toBe(report.benchmark.v2.ece < report.benchmark.v1.ece);
    expect(c.moreReliableThanV1).toBe(c.benchmarkLogLossLower && c.benchmarkCalibrationErrorLower && c.benchmarkGapAt70Smaller && c.holdoutLogLossNotWorseThanOther && c.holdoutCalibrationErrorNotWorseThanOther);
  });
});
