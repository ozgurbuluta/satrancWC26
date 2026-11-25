// What the move predictor looks at in a position: one row of numbers per
// legal move. The same code runs when the model is fitted (in Node) and when
// it is used (in the browser), so the two cannot drift apart.
//
// Nothing here calls a chess engine. The features are things that can be
// read off the board in a few milliseconds: what kind of move it is, what it
// wins or leaves hanging by a simple count of exchanges, and whether the
// player has played it before in this exact position.
import { bishopAttacks, kingAttacks, knightAttacks, pawnAttacks, rookAttacks } from 'chessops/attacks';
import type { Board } from 'chessops/board';
import { Chess, normalizeMove } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { SquareSet } from 'chessops/squareSet';
import type { Color, NormalMove, Role, Square } from 'chessops/types';
import { makeUci, opposite, parseUci, squareFile, squareRank } from 'chessops/util';

/** Material in pawns, for counting exchanges. The king is worth more than everything else together. */
const VALUE: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };
const BY_VALUE: Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

/** The features, in the order of every weight vector. Changing this list means fitting the model again. */
export const FEATURES = [
  'knight', // the piece that moves (a pawn is the baseline)
  'bishop',
  'rook',
  'queen',
  'king',
  'capture', // takes something
  'captureValue', // what it takes, in pawns / 9
  'exchange', // material won or lost on that square by the exchange that follows, in pawns / 9, between -1 and 1
  'losesMaterial', // the exchange on that square loses at least a pawn
  'recapture', // takes back on the square the opponent just moved to
  'trade', // takes a piece (not a pawn) in an even exchange
  'check',
  'mate',
  'castle',
  'promotion',
  'leftHanging', // the most the opponent can win next move, compared with the safest legal move, in pawns / 9
  'escape', // the piece was under a losing attack and moves to safety
  'threat', // material newly threatened, in pawns / 9
  'forward', // ranks advanced towards the opponent / 7 (negative: retreat)
  'centre', // how much nearer the centre the piece ends up, between -1 and 1
  'develop', // a knight or bishop leaves the back rank in the first twelve moves
  'pawnDouble', // a pawn's two-square first move
  'pawnAdvanced', // a pawn reaches the sixth or seventh rank
  'kingWalk', // a king move with queens still on the board (castling is not one)
  'kingActive', // a king move with the queens gone, towards the centre
  'samePiece', // the piece this player moved last time moves again
  'undo', // a piece goes straight back to where it came from
  'repPlayer', // log(1 + times this player played this move in this exact position before)
  'repAny', // log(1 + times anyone in the data played it in this position before)
] as const;
export type FeatureName = (typeof FEATURES)[number];
export const FEATURE_COUNT = FEATURES.length;
const IX = Object.fromEntries(FEATURES.map((name, i) => [name, i])) as Record<FeatureName, number>;

export interface Candidate {
  uci: string;
  san: string;
  /** One number per entry of FEATURES. */
  f: number[];
}

export interface PositionContext {
  fen: string;
  /** The move just played by the opponent, in UCI, when there is one. */
  lastMove?: string;
  /** This player's own previous move, in UCI, when there is one. */
  ownLastMove?: string;
  /** How often each move (UCI) was played before in this exact position, by this player and by anyone. */
  repPlayer?: Record<string, number>;
  repAny?: Record<string, number>;
}

/** Pieces of one colour that attack a square, given which squares are occupied. */
const attackersOf = (board: Board, square: Square, color: Color, occupied: SquareSet): SquareSet =>
  board[color]
    .intersect(occupied)
    .intersect(
      rookAttacks(square, occupied)
        .intersect(board.rooksAndQueens())
        .union(bishopAttacks(square, occupied).intersect(board.bishopsAndQueens()))
        .union(knightAttacks(square).intersect(board.knight))
        .union(kingAttacks(square).intersect(board.king))
        .union(pawnAttacks(opposite(color), square).intersect(board.pawn)),
    );

const leastValuable = (board: Board, set: SquareSet): { square: Square; role: Role } | undefined => {
  for (const role of BY_VALUE) {
    const square = set.intersect(board[role]).first();
    if (square !== undefined) return { square, role };
  }
  return undefined;
};

/**
 * Static exchange: what the side that starts wins or loses on `to`, in pawns,
 * if both sides keep taking there with their least valuable piece and either
 * may stop when it would lose by going on. `victim` is what stands on `to`
 * (0 for an empty square), `mover` the value of the piece that goes there
 * first from `from`.
 */
export const exchange = (board: Board, from: Square, to: Square, moverColor: Color, mover: number, victim: number): number => {
  const gains = [victim];
  let occupied = board.occupied.without(from).with(to);
  let onSquare = mover;
  let side = opposite(moverColor);
  for (let depth = 1; depth < 32; depth++) {
    const next = leastValuable(board, attackersOf(board, to, side, occupied).without(to));
    if (!next) break;
    gains.push(onSquare - gains[depth - 1]);
    // a king may not take a defended piece
    if (next.role === 'king' && attackersOf(board, to, opposite(side), occupied.without(next.square)).without(to).nonEmpty()) {
      gains.pop();
      break;
    }
    occupied = occupied.without(next.square);
    onSquare = VALUE[next.role];
    side = opposite(side);
  }
  for (let i = gains.length - 1; i > 0; i--) gains[i - 1] = Math.min(gains[i - 1], -gains[i]);
  return gains[0];
};

/** The most `color` can win by one capture and the exchange that follows, in pawns (0 when there is nothing to win). */
export const bestCapture = (board: Board, color: Color): number => {
  let best = 0;
  for (const target of board[opposite(color)]) {
    const role = board.getRole(target);
    if (!role || role === 'king') continue;
    const first = leastValuable(board, attackersOf(board, target, color, board.occupied));
    if (!first) continue;
    best = Math.max(best, exchange(board, first.square, target, color, VALUE[first.role], VALUE[role]));
  }
  return best;
};

const centrality = (square: Square): number => 3.5 - Math.max(Math.abs(squareFile(square) - 3.5), Math.abs(squareRank(square) - 3.5));
const cap = (x: number): number => Math.max(-1, Math.min(1, x));

/**
 * A short key for a position without its move counters: two positions with
 * the same pieces, side to move, castling rights and en passant square have
 * the same key, for the purpose of "played here before". The key is a hash,
 * to keep the table of earlier moves small.
 */
export const positionKey = (fen: string): string => {
  const text = fen.trim().split(/\s+/).slice(0, 4).join(' ');
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

/**
 * Every legal move of the position with its features. An unreadable or
 * finished position (mate, stalemate) has no candidates.
 */
export const candidates = (ctx: PositionContext): Candidate[] => {
  const setup = parseFen(ctx.fen);
  if (setup.isErr) return [];
  const made = Chess.fromSetup(setup.unwrap());
  if (made.isErr) return [];
  const pos = made.unwrap();
  const us = pos.turn;
  const them = opposite(us);
  const board = pos.board;
  const queensOn = board.queen.nonEmpty();
  const lastTo = ctx.lastMove ? (parseUci(ctx.lastMove) as NormalMove | undefined)?.to : undefined;
  const ownLast = ctx.ownLastMove ? (parseUci(ctx.ownLastMove) as NormalMove | undefined) : undefined;
  const threatNow = bestCapture(board, us);

  const rows: { cand: Candidate; hanging: number }[] = [];
  for (const [from, dests] of pos.allDests()) {
    const piece = board.get(from);
    if (!piece) continue;
    // What the opponent could win by taking this piece where it stands.
    const attackedBy = leastValuable(board, attackersOf(board, from, them, board.occupied));
    const underAttack = attackedBy ? exchange(board, attackedBy.square, from, them, VALUE[attackedBy.role], VALUE[piece.role]) : 0;
    for (const to of dests) {
      const promotes = piece.role === 'pawn' && (squareRank(to) === 7 || squareRank(to) === 0);
      for (const promotion of promotes ? (['queen', 'rook', 'bishop', 'knight'] as const) : [undefined]) {
        const move = normalizeMove(pos, { from, to, promotion }) as NormalMove;
        if (!pos.isLegal(move)) continue;
        const target = board.get(to);
        const castle = piece.role === 'king' && target?.role === 'rook' && target.color === us;
        const enPassant = piece.role === 'pawn' && pos.epSquare === to && squareFile(from) !== squareFile(to);
        const victim = castle ? 0 : enPassant ? 1 : target ? VALUE[target.role] : 0;
        const after = pos.clone();
        after.play(move);
        const f = new Array<number>(FEATURE_COUNT).fill(0);

        if (piece.role !== 'pawn') f[IX[piece.role]] = 1;
        const gain = castle ? 0 : exchange(board, from, to, us, VALUE[promotion ?? piece.role], victim);
        if (victim > 0) {
          f[IX.capture] = 1;
          f[IX.captureValue] = victim / 9;
          if (lastTo === to) f[IX.recapture] = 1;
          if (target && target.role !== 'pawn' && Math.abs(gain) < 1) f[IX.trade] = 1;
        }
        f[IX.exchange] = cap(gain / 9);
        if (gain <= -1) f[IX.losesMaterial] = 1;
        if (after.isCheck()) f[IX.check] = 1;
        if (after.isCheckmate()) f[IX.mate] = 1;
        if (castle) f[IX.castle] = 1;
        if (promotion) f[IX.promotion] = promotion === 'queen' ? 1 : 0.25;
        if (underAttack >= 1 && gain >= 0 && !castle) f[IX.escape] = 1;
        // After the move, with the opponent to play: what can they win, and what do we now threaten?
        const hanging = bestCapture(after.board, them);
        f[IX.threat] = cap(Math.max(0, bestCapture(after.board, us) - threatNow) / 9);

        if (!castle) {
          const forward = (squareRank(to) - squareRank(from)) * (us === 'white' ? 1 : -1);
          f[IX.forward] = forward / 7;
          f[IX.centre] = (centrality(to) - centrality(from)) / 3;
          const homeRank = us === 'white' ? 0 : 7;
          if ((piece.role === 'knight' || piece.role === 'bishop') && squareRank(from) === homeRank && pos.fullmoves <= 12) f[IX.develop] = 1;
          if (piece.role === 'pawn') {
            if (Math.abs(squareRank(to) - squareRank(from)) === 2) f[IX.pawnDouble] = 1;
            const rankFromOwnSide = us === 'white' ? squareRank(to) : 7 - squareRank(to);
            if (rankFromOwnSide >= 5 && !promotion) f[IX.pawnAdvanced] = 1;
          }
          if (piece.role === 'king') {
            if (queensOn) f[IX.kingWalk] = 1;
            else f[IX.kingActive] = (centrality(to) - centrality(from)) / 3;
          }
          if (ownLast && ownLast.to === from) {
            f[IX.samePiece] = 1;
            if (ownLast.from === to) f[IX.undo] = 1;
          }
        }
        const uci = makeUci(move);
        f[IX.repPlayer] = Math.log1p(ctx.repPlayer?.[uci] ?? 0);
        f[IX.repAny] = Math.log1p(ctx.repAny?.[uci] ?? 0);
        rows.push({ cand: { uci, san: makeSan(pos, move), f }, hanging });
      }
    }
  }
  // "Left hanging" is measured against the safest move there is: what cannot be avoided is not this move's doing.
  const safest = rows.reduce((min, r) => Math.min(min, r.hanging), Infinity);
  for (const r of rows) r.cand.f[IX.leftHanging] = cap((r.hanging - safest) / 9);
  return rows.map(r => r.cand);
};
