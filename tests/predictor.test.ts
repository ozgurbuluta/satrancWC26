import { describe, expect, it } from 'vitest';
import shipped from '../src/data/predictor.json';
import { legalSans } from '../src/lib/position';
import { candidates, FEATURES, FEATURE_COUNT, positionKey } from '../src/lib/predictor/features';
import { clockPressure, matchUrgency, predict, shares, type PredictorModel } from '../src/lib/predictor/model';

const MODEL = shipped as unknown as PredictorModel;
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

  it('breaks exact ties by the move text, the same way every time', () => {
    const flat: PredictorModel = { ...MODEL, weights: { shared: MODEL.features.map(() => 0), players: {}, clock: MODEL.features.map(() => 0) }, priors: { players: {}, any: {} } };
    const p = predict(flat, { fen: START });
    expect(new Set(p.moves.map(m => m.p.toFixed(12))).size).toBe(1);
    expect(p.moves.map(m => m.uci)).toEqual([...p.moves.map(m => m.uci)].sort());
  });

  it('has nothing to show when the game is over in the position', () => {
    const p = predict(MODEL, { fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', moverId: GUKESH });
    expect(p.moves).toEqual([]);
    expect(shares(p)).toEqual({ top: [], other: 0 });
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

  it('has weights for exactly the features the code computes', () => {
    expect(MODEL.features).toEqual([...FEATURES]);
    for (const w of [MODEL.weights.shared, MODEL.weights.clock, MODEL.weights.players.gukesh, MODEL.weights.players.sindarov]) {
      expect(w).toHaveLength(FEATURE_COUNT);
      for (const x of w) expect(Number.isFinite(x)).toBe(true);
    }
    expect(MODEL.temperature).toBeGreaterThan(0);
    expect(MODEL.players).toEqual({ [GUKESH]: 'gukesh', [SINDAROV]: 'sindarov' });
    expect(Object.keys(MODEL.priors.players.gukesh).length).toBeGreaterThan(100);
    expect(Object.keys(MODEL.priors.players.sindarov).length).toBeGreaterThan(100);
  });

  it('carries its own measurements, and says the shown ones are not from a blind test', () => {
    expect(report.selection.selected).toBe(104);
    expect(report.split.fit).toMatchObject({ games: 74, decisions: 3761 });
    expect(report.split.calibration).toMatchObject({ games: 9, decisions: 479, gukesh: 0 });
    expect(report.split.test).toMatchObject({ games: 21, decisions: 963 });
    expect(report.shown.blind).toBe(false);
    expect(report.shown.n).toBe(963);
    for (const key of ['firstProtocol', 'revision']) {
      const p = report[key];
      expect(p.test.all.n).toBe(963);
      expect(p.test.all.top1).toBeGreaterThan(p.baselines.uniform.top1);
      expect(p.test.all.logLoss).toBeLessThan(p.baselines.uniform.logLoss);
      expect(p.test.all.top3).toBeGreaterThanOrEqual(p.test.all.top1);
    }
    // the first protocol is kept as it was measured
    expect(report.firstProtocol.test.all.top1).toBeCloseTo(0.292, 2);
    // what the panel quotes is the revision
    expect(report.shown.top1).toBe(report.revision.test.all.top1);
    // "every move equally likely" is scored by expectation: 1/n, averaged
    expect(report.revision.baselines.uniform.top1).toBeLessThan(0.06);
    expect(report.revision.baselines.uniform.top3).toBeCloseTo(3 * report.revision.baselines.uniform.top1, 1);
  });
});
