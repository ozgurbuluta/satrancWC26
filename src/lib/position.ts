// Legal-move helpers shared by puzzles and move prediction. All moves that
// reach the board from a visitor go through here, so only legal ones exist.
import { Chess, normalizeMove } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import type { Move, NormalMove, Role } from 'chessops/types';
import { makeSquare, makeUci, parseSquare, parseUci } from 'chessops/util';

export type Promotion = 'queen' | 'rook' | 'bishop' | 'knight';

export interface PlayedMove {
  /** Canonical UCI (castling as king-to-rook, the form the feed and Lichess use). */
  uci: string;
  san: string;
  /** Squares to highlight (castling shown as the king's real destination). */
  from: string;
  to: string;
  /** Position after the move. */
  fen: string;
  check: boolean;
  mate: boolean;
  capture: boolean;
}

export const positionOf = (fen: string): Chess | undefined => {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.unwrap());
  return pos.isErr ? undefined : pos.unwrap();
};

/** Legal destinations per square, in the form the board component wants. */
export const legalDests = (fen: string): Map<string, string[]> => {
  const pos = positionOf(fen);
  return pos ? (chessgroundDests(pos) as Map<string, string[]>) : new Map();
};

export const sideToMove = (fen: string): 'white' | 'black' => (fen.split(' ')[1] === 'b' ? 'black' : 'white');

const squaresOf = (fen: string): string =>
  fen
    .split(' ')[0]
    .replace(/\d/g, d => '.'.repeat(Number(d)))
    .replace(/\//g, '');

/**
 * On how many squares two positions differ. One move changes two squares,
 * three when taking en passant, four when castling; the board uses this to
 * tell a move from a jump. A position that cannot be read counts as far away.
 */
export const squaresChanged = (a: string, b: string): number => {
  const x = squaresOf(a);
  const y = squaresOf(b);
  if (x.length !== 64 || y.length !== 64) return 64;
  let n = 0;
  for (let i = 0; i < 64; i++) if (x[i] !== y[i]) n++;
  return n;
};

/** True when moving from `from` to `to` is a pawn reaching the last rank, so a piece must be chosen. */
export const isPromotion = (fen: string, from: string, to: string): boolean => {
  const pos = positionOf(fen);
  const a = parseSquare(from);
  if (!pos || a === undefined) return false;
  const piece = pos.board.get(a);
  return piece?.role === 'pawn' && (to[1] === '8' || to[1] === '1');
};

const describe = (pos: Chess, move: Move): PlayedMove | undefined => {
  const normal = normalizeMove(pos, move) as NormalMove;
  if (!('from' in normal) || !pos.isLegal(normal)) return undefined;
  const from = makeSquare(normal.from);
  let to = makeSquare(normal.to);
  const mover = pos.board.get(normal.from);
  const target = pos.board.get(normal.to);
  const castles = mover?.role === 'king' && target?.role === 'rook' && target.color === mover.color;
  if (castles) to = (normal.to > normal.from ? 'g' : 'c') + from[1];
  const capture = !castles && (!!target || (mover?.role === 'pawn' && pos.epSquare === normal.to));
  const san = makeSan(pos, normal);
  const after = pos.clone();
  after.play(normal);
  return { uci: makeUci(normal), san, from, to, fen: makeFen(after.toSetup()), check: after.isCheck(), mate: after.isCheckmate(), capture };
};

/** A move given as two squares (from a click or a drag). Illegal: undefined. */
export const moveBySquares = (fen: string, from: string, to: string, promotion?: Promotion): PlayedMove | undefined => {
  const pos = positionOf(fen);
  const a = parseSquare(from);
  const b = parseSquare(to);
  if (!pos || a === undefined || b === undefined) return undefined;
  return describe(pos, { from: a, to: b, promotion: promotion as Role | undefined });
};

/** A move given in UCI ("e2e4", "e7e8q", castling in either form). Illegal: undefined. */
export const moveByUci = (fen: string, uci: string): PlayedMove | undefined => {
  const pos = positionOf(fen);
  const move = parseUci(uci);
  return pos && move ? describe(pos, move) : undefined;
};

// Turkish piece letters, as typed by a visitor: Şah, Vezir, Kale, Fil, At.
const FROM_TURKISH: Record<string, string> = { Ş: 'K', V: 'Q', K: 'R', F: 'B', A: 'N' };

/**
 * A move typed as text: "Af3", "Nf3", "e4", "exd5", "O-O", "0-0-0", "e8=V".
 * Turkish and English piece letters are both understood. Illegal or unclear: undefined.
 */
export const moveByText = (fen: string, text: string, notation: 'tr' | 'en'): PlayedMove | undefined => {
  const pos = positionOf(fen);
  if (!pos) return undefined;
  const cleaned = text
    .trim()
    .replace(/[!?]+$/g, '')
    .replace(/^0-0-0/, 'O-O-O')
    .replace(/^0-0/, 'O-O')
    .replace(/\s+/g, '');
  if (!cleaned || cleaned.length > 8) return undefined;
  const tries = new Set<string>();
  const turkish = cleaned.replace(/[ŞVKFA]/g, c => FROM_TURKISH[c]);
  // In Turkish notation "K" is the rook; try the reader's notation first.
  if (notation === 'tr') tries.add(turkish).add(cleaned);
  else tries.add(cleaned).add(turkish);
  for (const san of tries) {
    const move = parseSan(pos, san) ?? parseSan(pos, san.replace(/[+#]$/, ''));
    if (move) return describe(pos, move);
  }
  return undefined;
};

/** Every legal move of a position in notation, for the typed-move suggestions. */
export const legalSans = (fen: string): string[] => {
  const pos = positionOf(fen);
  if (!pos) return [];
  const out: string[] = [];
  for (const [from, squares] of pos.allDests()) {
    for (const to of squares) {
      const piece = pos.board.get(from);
      const promotes = piece?.role === 'pawn' && (to >= 56 || to <= 7);
      for (const promotion of promotes ? (['queen', 'rook', 'bishop', 'knight'] as const) : [undefined]) {
        const move = { from, to, promotion };
        if (pos.isLegal(move)) out.push(makeSan(pos, move));
      }
    }
  }
  return [...new Set(out)].sort();
};

export type PieceRole = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export interface LegalMove {
  uci: string;
  san: string;
  /** The piece that moves (castling counts as a king move). */
  role: PieceRole;
}

/** Every legal move of a position with the piece that makes it, for choosing a move from a list instead of on a board. */
export const legalMoves = (fen: string): LegalMove[] => {
  const pos = positionOf(fen);
  if (!pos) return [];
  const bySan = new Map<string, LegalMove>();
  for (const [from, squares] of pos.allDests()) {
    const piece = pos.board.get(from);
    if (!piece) continue;
    for (const to of squares) {
      const promotes = piece.role === 'pawn' && (to >= 56 || to <= 7);
      for (const promotion of promotes ? (['queen', 'rook', 'bishop', 'knight'] as const) : [undefined]) {
        const move = { from, to, promotion };
        if (!pos.isLegal(move)) continue;
        const san = makeSan(pos, move);
        if (!bySan.has(san)) bySan.set(san, { uci: makeUci(move), san, role: piece.role });
      }
    }
  }
  return [...bySan.values()].sort((a, b) => a.san.localeCompare(b.san, 'en'));
};
