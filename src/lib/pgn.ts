import { castlingSide } from 'chessops/chess';
import { parseTimeControl } from './clock';
import { makeFen } from 'chessops/fen';
import { parseComment, parsePgn, startingPosition } from 'chessops/pgn';
import { makeSanAndPlay, parseSan } from 'chessops/san';
import { makeSquare, makeUci } from 'chessops/util';

export interface Ply {
  /** 1-based half-move number. */
  ply: number;
  san: string;
  uci: string;
  /** Squares to highlight (castling is shown as the king's real destination). */
  from: string;
  to: string;
  /** Position after the move. */
  fen: string;
  check: boolean;
  capture: boolean;
  /** Mover's remaining time in seconds after the move, when the feed has it. */
  clk?: number;
  /** Evaluation from the feed (White's point of view), present once Lichess has analysed the game. */
  ev?: { cp?: number; mate?: number; depth: number };
  /**
   * When this browser first saw the move (ms since epoch). 0 means "already
   * played when the page loaded". Used for the stream-sync delay and clocks.
   */
  seenAt: number;
}

export interface PlayerInfo {
  name: string;
  title?: string;
  rating?: number;
  fideId?: string;
}

export interface GameData {
  id: string;
  /** PGN Round tag, e.g. "3.1". */
  round: string;
  white: PlayerInfo;
  black: PlayerInfo;
  /** '*', '1-0', '0-1' or '1/2-1/2'. */
  result: string;
  /** When this browser first saw a decisive result (0 = already over on load). */
  resultSeenAt: number;
  eco?: string;
  opening?: string;
  initialFen: string;
  /** Starting time per player in seconds, from the TimeControl tag. */
  initialClock?: number;
  /** The TimeControl tag as it came, e.g. "40/7200:20/3600:900+30". */
  timeControl?: string;
  plies: Ply[];
}

const clean = (v: string | undefined): string | undefined => (v && v !== '?' ? v : undefined);

/** Time each player starts with. Unknown when the tag cannot be read: no number is guessed from it. */
const initialClockFrom = (tc: string | undefined): number | undefined => parseTimeControl(tc)?.[0].seconds;

/** Splits a multi-game PGN blob into single-game chunks. */
export const splitGames = (pgn: string): string[] =>
  pgn
    .split(/\n\n(?=\[Event )/)
    .map(s => s.trim())
    .filter(s => s.startsWith('['));

/**
 * Parses one broadcast game. `prev` is the previously known version of the same
 * game so that first-seen timestamps survive re-parsing. `stamp` is the
 * timestamp given to moves that are new in this update.
 */
export const parseGame = (pgn: string, prev: GameData | undefined, stamp: number): GameData | undefined => {
  const parsed = parsePgn(pgn)[0];
  if (!parsed) return undefined;
  const h = parsed.headers;
  const posResult = startingPosition(h);
  if (posResult.isErr) return undefined;
  const pos = posResult.unwrap();
  const initialFen = makeFen(pos.toSetup());

  const plies: Ply[] = [];
  let i = 0;
  for (const node of parsed.moves.mainline()) {
    const move = parseSan(pos, node.san);
    if (!move) break;
    let from = '';
    let to = '';
    let capture = false;
    if ('from' in move) {
      from = makeSquare(move.from);
      to = makeSquare(move.to);
      const side = castlingSide(pos, move);
      if (side) to = (side === 'h' ? 'g' : 'c') + from[1];
      else capture = pos.board.occupied.has(move.to) || (pos.epSquare === move.to && pos.board.pawn.has(move.from));
    }
    const uci = makeUci(move);
    const san = makeSanAndPlay(pos, move);
    let clk: number | undefined;
    let ev: Ply['ev'];
    for (const c of node.comments ?? []) {
      const parsedComment = parseComment(c);
      if (parsedComment.clock !== undefined) clk = parsedComment.clock;
      const e = parsedComment.evaluation;
      if (e) ev = 'mate' in e ? { mate: e.mate, depth: e.depth ?? 18 } : { cp: Math.round(e.pawns * 100), depth: e.depth ?? 18 };
    }
    const old = prev?.plies[i];
    plies.push({
      ply: i + 1,
      san,
      uci,
      from,
      to,
      fen: makeFen(pos.toSetup()),
      check: pos.isCheck(),
      capture,
      clk: clk ?? (old && old.uci === uci ? old.clk : undefined),
      ev,
      seenAt: old && old.uci === uci ? old.seenAt : stamp,
    });
    i++;
  }

  const result = h.get('Result') || '*';
  const gameUrl = h.get('GameURL') || '';
  const id = gameUrl.split('/').pop() || `${h.get('White')}-${h.get('Black')}-${h.get('Round')}`;
  const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

  return {
    id,
    round: h.get('Round') || '',
    white: {
      name: h.get('White') || 'White',
      title: clean(h.get('WhiteTitle')),
      rating: num(h.get('WhiteElo')),
      fideId: clean(h.get('WhiteFideId')),
    },
    black: {
      name: h.get('Black') || 'Black',
      title: clean(h.get('BlackTitle')),
      rating: num(h.get('BlackElo')),
      fideId: clean(h.get('BlackFideId')),
    },
    result,
    resultSeenAt: result === '*' ? 0 : prev && prev.result === result ? prev.resultSeenAt : prev ? stamp : 0,
    eco: clean(h.get('ECO')),
    opening: clean(h.get('Opening')),
    initialFen,
    initialClock: initialClockFrom(h.get('TimeControl')),
    timeControl: clean(h.get('TimeControl')),
    plies,
  };
};
