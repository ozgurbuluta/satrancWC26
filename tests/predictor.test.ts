import { describe, expect, it } from 'vitest';
import matchPgn from '../data/predictor-v3/match-2026.pgn?raw';
import shipped from '../src/data/predictor.json';
import { parseGame, splitGames } from '../src/lib/pgn';
import { legalSans } from '../src/lib/position';
import { candidates, FEATURES, FEATURE_COUNT, positionKey } from '../src/lib/predictor/features';
import { clockPressure, earlierMoves, matchUrgency, positionsOf, predict, shares, tableKey, theoryMoves, type PredictorModel } from '../src/lib/predictor/model';

const MODEL = shipped as unknown as PredictorModel;
/** A model with no weights and no tables: every legal move equally likely. */
const FLAT: PredictorModel = {
  ...MODEL,
  weights: { shared: MODEL.features.map(() => 0), players: {}, clock: MODEL.features.map(() => 0) },
  temperature: 1,
  blend: { kappa: 1, halfLifeYears: null, epsilon: 0, nu: null, theoryHalfLifeYears: null, theoryPlies: 24, same: 0, asOf: '2026-11-01' },
  priorColumns: { g: 'gukesh', s: 'sindarov' },
  priors: '',
  theory: '',
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
    // Black's reply to 1. d4: two moves take nearly everything in the players' own games, the third has a share under one percent
    const afterD4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';
    for (const moverId of [GUKESH, SINDAROV]) {
      const p = predict(MODEL, { fen: afterD4, moverId });
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
  const withTable = (entry: string, blend: Partial<PredictorModel['blend']> = {}): PredictorModel => ({ ...FLAT, blend: { ...FLAT.blend, ...blend }, priors: `${tableKey(START)}=${entry}` });

  it('is the base model where nothing was played before', () => {
    const p = predict(FLAT, { fen: START, moverId: GUKESH });
    for (const m of p.moves) expect(m.p).toBeCloseTo(1 / 20, 12);
    expect(p.seenBefore).toBe(false);
  });

  it('pulls towards what the player played, by (own + κ·base) / (games + κ)', () => {
    // Gukesh: e4 three times, d4 once. κ = 2, so the base model is worth two games.
    const model = withTable('e2e4g3,d2d4g1s5', { kappa: 2 });
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
    const model = withTable('e2e4g60,d2d4g40', { kappa: 2 });
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
    const smoothed = withTable('e2e4g60,d2d4g40', { kappa: 2, epsilon: 0.1 });
    expect(at(smoothed, 'e2e4')).toBeCloseTo(0.9 * at(model, 'e2e4') + 0.1 / 20, 12);
    expect(at(smoothed, 'g1f3')).toBeCloseTo(0.9 * at(model, 'g1f3') + 0.1 / 20, 12);
    // one game is weak evidence: the move is likelier than the rest, far from certain
    const once = withTable('e2e4g1', { kappa: 2 });
    expect(at(once, 'e2e4')).toBeCloseTo((1 + 0.1) / 3, 12);
  });

  it('lays theory over the board model, by (theory + ν·board) / (all theory + ν)', () => {
    // strong players: e4 sixty times, d4 forty. ν = 2, so the board model is worth two theory games.
    const model: PredictorModel = { ...FLAT, blend: { ...FLAT.blend, nu: 2 }, theory: `${tableKey(START)}=e2e460,d2d440` };
    expect(theoryMoves(model, tableKey(START))).toEqual(new Map([['e2e4', 60], ['d2d4', 40]]));
    expect(at(model, 'e2e4')).toBeCloseTo((60 + 2 / 20) / 102, 12);
    expect(at(model, 'd2d4')).toBeCloseTo((40 + 2 / 20) / 102, 12);
    expect(at(model, 'g1f3')).toBeCloseTo((2 / 20) / 102, 12);
    // theory is the same for both players, and knowing theory is not the player having been here
    expect(at(model, 'e2e4', SINDAROV)).toBe(at(model, 'e2e4'));
    expect(predict(model, { fen: START, moverId: GUKESH }).seenBefore).toBe(false);
    // with ν null there is no theory step at all
    const off: PredictorModel = { ...model, blend: { ...model.blend, nu: null } };
    expect(at(off, 'e2e4')).toBeCloseTo(1 / 20, 12);
  });

  it('then pulls towards the player’s own moves, with theory as the base', () => {
    // theory says e4 60 / d4 40; Gukesh himself has played c4 here three times; κ = 1
    const model: PredictorModel = { ...withTable('c2c4g3', { kappa: 1, nu: 2 }), theory: `${tableKey(START)}=e2e460,d2d440` };
    const base = (count: number) => (count + 2 / 20) / 102;
    expect(at(model, 'c2c4')).toBeCloseTo((3 + base(0)) / 4, 12);
    expect(at(model, 'e2e4')).toBeCloseTo(base(60) / 4, 12);
    // for Sindarov, who has nothing of his own here, it is theory
    expect(at(model, 'e2e4', SINDAROV)).toBeCloseTo(base(60), 12);
  });

  it('uses theory only in the first half-moves it was measured for', () => {
    // the same position reached by a repetition, at move 13: half-move 24 is past the limit
    const late = START.replace(' 0 1', ' 0 13');
    const model: PredictorModel = { ...FLAT, blend: { ...FLAT.blend, nu: 2, theoryPlies: 24 }, theory: `${tableKey(START)}=e2e460,d2d440` };
    expect(tableKey(late)).toBe(tableKey(START));
    for (const m of predict(model, { fen: late, moverId: GUKESH }).moves) expect(m.p).toBeCloseTo(1 / 20, 12);
    // one half-move earlier it still counts: Black to move at move 12 is half-move 23
    const black = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 12';
    const forBlack: PredictorModel = { ...model, theory: `${tableKey(black)}=e7e510` };
    expect(predict(forBlack, { fen: black, moverId: GUKESH }).moves[0]).toMatchObject({ uci: 'e7e5' });
  });

  it('counts what the player did in the earlier games of this match', () => {
    const model: PredictorModel = { ...FLAT, blend: { ...FLAT.blend, kappa: 2, same: 2 } };
    // game 1: Gukesh, with White, opened 1. c4. Game 2: Sindarov had White and played 1. d4.
    const earlier = [
      { whiteId: GUKESH, blackId: SINDAROV, moves: ['c2c4', 'e7e5', 'b1c3'] },
      { whiteId: SINDAROV, blackId: GUKESH, moves: ['d2d4', 'g8f6'] },
    ];
    const gukesh = predict(model, { fen: START, moverId: GUKESH, earlier });
    // his own c4 counts twice (same = 2); Sindarov's d4 in the same position is not his
    expect(gukesh.moves[0].uci).toBe('c2c4');
    expect(gukesh.moves[0].p).toBeCloseTo((2 + 2 / 20) / 4, 12);
    expect(gukesh.moves.find(m => m.uci === 'd2d4')!.p).toBeCloseTo((2 / 20) / 4, 12);
    expect(gukesh.seenBefore).toBe(true);
    // and for Sindarov it is his d4
    expect(predict(model, { fen: START, moverId: SINDAROV, earlier }).moves[0].uci).toBe('d2d4');
    // with nothing passed, or with same = 0, the match is not read
    expect(predict(model, { fen: START, moverId: GUKESH }).moves[0].p).toBeCloseTo(1 / 20, 12);
    expect(predict({ ...model, blend: { ...model.blend, same: 0 } }, { fen: START, moverId: GUKESH, earlier }).moves[0].p).toBeCloseTo(1 / 20, 12);
    // only the position on the board counts: after 1. c4 e5, his 2. Nc3
    const after = 'rnbqkbnr/pppp1ppp/8/4p3/2P5/8/PP1PPPPP/RNBQKBNR w KQkq - 0 2';
    expect(predict(model, { fen: after, moverId: GUKESH, earlier }).moves[0].uci).toBe('b1c3');
  });

  it('replays a game into the positions the tables are keyed by, and stops at a move it cannot play', () => {
    const steps = positionsOf(['e2e4', 'e7e5', 'g1f3', 'e1h1', 'b8c6']);
    expect(steps.map(x => x.uci)).toEqual(['e2e4', 'e7e5', 'g1f3']);
    expect(steps[0]).toEqual({ key: tableKey(START), uci: 'e2e4', white: true });
    expect(steps[1].white).toBe(false);
    // castling is written the way the rest of the site writes it, king to rook
    const castled = positionsOf(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1h1']);
    expect(castled).toHaveLength(7);
    expect(positionsOf(Array.from({ length: 60 }, (_, i) => (i % 4 === 0 ? 'g1f3' : i % 4 === 1 ? 'g8f6' : i % 4 === 2 ? 'f3g1' : 'f6g8')))).toHaveLength(40);
  });

  it('leaves every legal move a small share when ε is set', () => {
    const model = withTable('e2e4g1000', { kappa: 0.25, epsilon: 0.02 });
    const p = predict(model, { fen: START, moverId: GUKESH });
    expect(p.moves.reduce((sum, m) => sum + m.p, 0)).toBeCloseTo(1, 12);
    for (const m of p.moves) expect(m.p).toBeGreaterThanOrEqual(0.02 / 20 - 1e-12);
    expect(p.moves[0].p).toBeLessThan(1 - 0.02 * (19 / 20) + 1e-12);
  });

  it('ignores a table entry for a move that is not legal, and a player it has no column for', () => {
    const model = withTable('e2e5g9s9,e2e4g1', { kappa: 1 });
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
    const model = withTable('e2e4g1', { kappa: 1 });
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
    expect(MODEL.blend).toEqual({ kappa: 2, halfLifeYears: 0.5, epsilon: 0.005, nu: 0.5, theoryHalfLifeYears: 4, theoryPlies: 24, same: 2, asOf: '2026-11-01' });
  });

  it('has a table of the two players’ own moves that reads back whole, for legal moves only', () => {
    expect(MODEL.priorColumns).toEqual({ g: 'gukesh', s: 'sindarov' });
    const keys = MODEL.priors.split(';').map(part => part.slice(0, part.indexOf('=')));
    expect(keys.length).toBe(report.tables.ownPositions);
    expect(new Set(keys).size).toBe(keys.length);
    let moves = 0;
    for (const key of keys) {
      expect(key).toMatch(/^[0-9a-z]{1,8}$/);
      const played = earlierMoves(MODEL, key);
      expect(played.size).toBeGreaterThan(0);
      for (const [uci, counts] of played) {
        moves++;
        expect(uci).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
        expect(Object.keys(counts).length).toBeGreaterThan(0);
        for (const [who, x] of Object.entries(counts)) {
          expect(['gukesh', 'sindarov']).toContain(who);
          expect(x).toBeGreaterThan(0);
        }
      }
    }
    expect(moves).toBe(report.tables.ownMoves);
    expect(MODEL.priors).toMatch(/^[0-9a-z]+=[a-h1-8qrbngs.0-9,]+(;[0-9a-z]+=[a-h1-8qrbngs.0-9,]+)*$/);
    const first = earlierMoves(MODEL, tableKey(START));
    const legal = new Set(candidates({ fen: START }).map(c => c.uci));
    for (const uci of first.keys()) expect(legal.has(uci)).toBe(true);
    expect([...first.values()].some(c => (c.gukesh ?? 0) > 0)).toBe(true);
    expect([...first.values()].some(c => (c.sindarov ?? 0) > 0)).toBe(true);
  });

  it('has a theory table that reads back whole, and knows the main first moves', () => {
    const keys = MODEL.theory.split(';').map(part => part.slice(0, part.indexOf('=')));
    expect(keys.length).toBe(report.tables.theoryPositions);
    expect(new Set(keys).size).toBe(keys.length);
    let moves = 0;
    for (const key of keys) {
      const played = theoryMoves(MODEL, key);
      expect(played.size).toBeGreaterThan(0);
      for (const count of played.values()) expect(count).toBeGreaterThan(0);
      moves += played.size;
    }
    expect(moves).toBe(report.tables.theoryMoves);
    expect(MODEL.theory).toMatch(/^[0-9a-z]+=[a-h1-8qrbn.0-9,]+(;[0-9a-z]+=[a-h1-8qrbn.0-9,]+)*$/);
    // strong players open with e4, d4, Nf3 and c4, thousands of times
    const first = theoryMoves(MODEL, tableKey(START));
    const legal = new Set(candidates({ fen: START }).map(c => c.uci));
    for (const uci of first.keys()) expect(legal.has(uci)).toBe(true);
    const order = [...first].sort((a, b) => b[1] - a[1]).map(([uci]) => uci);
    expect(order.slice(0, 4).sort()).toEqual(['c2c4', 'd2d4', 'e2e4', 'g1f3']);
    expect([...first.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(1000);
    // it comes from the games the report names
    expect(report.selection.eliteGames).toBe(10761);
    expect(report.tables.theoryPositions).toBe(21100);
  });

  it('is small enough to load after the page: under 600 KB', () => {
    expect(JSON.stringify(shipped).length).toBeLessThan(600 * 1024);
  });

  it('carries its own measurements against the second version, on the same decisions', () => {
    expect(report.selection.selected).toBe(455);
    expect(report.shown).toMatchObject({ n: 4240, games: 83, blind: false });
    expect(report.shown.logLoss).toBe(report.holdout.v3.logLoss);
    expect(report.holdout.v2).toMatchObject({ n: 4240, logLoss: 2.2051, top1: 0.3472 });
    expect(report.holdout.v3.difference.logLoss.value).toBeCloseTo(report.holdout.v3.logLoss - report.holdout.v2.logLoss, 3);
    // lower log loss on January to August 2026, with the interval of the difference below zero
    expect(report.holdout.v3.difference.logLoss.interval[1]).toBeLessThan(0);
    // the benchmark is still the first version's 963 decisions, its published numbers reproduced
    expect(report.benchmark.v1).toMatchObject({ n: 963, top1: 0.2876, top3: 0.5369, logLoss: 2.5489 });
    expect(report.benchmark.v2).toMatchObject({ n: 963, logLoss: 2.3764 });
    expect(report.benchmark.v3.logLoss).toBeLessThan(report.benchmark.v2.logLoss);
    // the rule written down beforehand, applied to the numbers and to nothing else
    expect(report.adopted).toBe(report.holdout.v3.difference.logLoss.interval[1] < 0 && report.holdout.v3.ece <= report.holdout.v2.ece);
  });

  it('gives in the browser what was measured: the match games so far, replayed through predict()', () => {
    // the finished games of the match, as the training script read them
    const games = splitGames(matchPgn).map(text => parseGame(text, undefined, 0)!);
    expect(games).toHaveLength(report.match.games);
    let loss = 0;
    let first = 0;
    let n = 0;
    games.forEach((game, index) => {
      const earlier = games.slice(0, index).map(g => ({ whiteId: g.white.fideId, blackId: g.black.fideId, moves: g.plies.map(p => p.uci) }));
      let fen = game.initialFen;
      game.plies.forEach((ply, i) => {
        const mover = i % 2 === 0 ? game.white : game.black;
        const estimate = predict(MODEL, { fen, moverId: mover.fideId, lastMove: game.plies[i - 1]?.uci, ownLastMove: game.plies[i - 2]?.uci, secondsLeft: game.plies[i - 2]?.clk, earlier });
        const played = estimate.moves.find(m => m.uci === ply.uci)!;
        loss -= Math.log(played.p);
        if (estimate.moves[0].uci === ply.uci) first++;
        n++;
        fen = ply.fen;
      });
    });
    expect(n).toBe(report.match.v3.n);
    // the page's tables are aged as of 1 November, the measurement's as of the match's first day: close, not identical
    expect(loss / n).toBeCloseTo(report.match.v3.logLoss, 1);
    expect(Math.abs(loss / n - report.match.v3.logLoss)).toBeLessThan(0.03);
    expect(Math.abs(first / n - report.match.v3.top1)).toBeLessThan(0.02);
  });
});
