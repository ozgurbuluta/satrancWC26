import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { parseUci } from 'chessops/util';
import { KNOWN_PLAYERS } from '../config';
import type { PlayerInfo } from './pgn';

export type Notation = 'tr' | 'en';

export const formatClock = (seconds: number | undefined): string => {
  if (seconds === undefined || Number.isNaN(seconds)) return '–:––';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

export const formatCountdown = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d}g ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
};

/** "+0.35", "−1.2", "#4", "#−4" from White's point of view. */
export const formatEval = (pv: { cp?: number; mate?: number } | undefined): string => {
  if (!pv) return '';
  if (pv.mate !== undefined) return pv.mate > 0 ? `#${pv.mate}` : `#−${Math.abs(pv.mate)}`;
  const v = (pv.cp ?? 0) / 100;
  const abs = Math.abs(v);
  const txt = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  if (txt === '0.0') return '0.0';
  return (v > 0 ? '+' : '−') + txt;
};

// Turkish piece letters: Şah, Vezir, Kale, Fil, At.
const TR_PIECES: Record<string, string> = { K: 'Ş', Q: 'V', R: 'K', B: 'F', N: 'A' };

export const localizeSan = (san: string, notation: Notation): string =>
  notation === 'tr' ? san.replace(/[KQRBN]/g, c => TR_PIECES[c]) : san;

const FED_TO_ISO: Record<string, string> = {
  IND: 'IN', UZB: 'UZ', TUR: 'TR', USA: 'US', CHN: 'CN', NOR: 'NO', FRA: 'FR', GER: 'DE', NED: 'NL',
  AZE: 'AZ', ARM: 'AM', ESP: 'ES', ENG: 'GB', POL: 'PL', UKR: 'UA', IRI: 'IR', KAZ: 'KZ', HUN: 'HU',
  ROU: 'RO', ISR: 'IL', CRO: 'HR', SUI: 'CH', AUT: 'AT', ITA: 'IT', SRB: 'RS', GEO: 'GE', VIE: 'VN',
  CZE: 'CZ', SWE: 'SE', DEN: 'DK', BUL: 'BG', GRE: 'GR', EGY: 'EG', UAE: 'AE', SLO: 'SI', RUS: 'RU',
};

export const fedFlag = (fed: string | undefined): string => {
  const iso = fed ? FED_TO_ISO[fed.toUpperCase()] : undefined;
  if (!iso) return '';
  return String.fromCodePoint(...[...iso].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
};

export const displayName = (p: PlayerInfo): string => {
  const known = p.fideId ? KNOWN_PLAYERS[p.fideId] : undefined;
  if (known) return known.name;
  const [last, first] = p.name.split(',').map(s => s.trim());
  return first ? `${first} ${last}` : p.name;
};

export const shortName = (p: PlayerInfo): string => {
  const known = p.fideId ? KNOWN_PLAYERS[p.fideId] : undefined;
  if (known) return known.short;
  return p.name.split(',')[0].trim();
};

export interface SanMove {
  /** e.g. "12." or "12…" when a label is needed before the move, else ''. */
  label: string;
  san: string;
}

/** Converts an engine line (UCI) into numbered SAN moves starting from `fen`. */
export const pvToSan = (fen: string, uci: string[], max = 10): SanMove[] => {
  const setup = parseFen(fen);
  if (setup.isErr) return [];
  const posRes = Chess.fromSetup(setup.unwrap());
  if (posRes.isErr) return [];
  const pos = posRes.unwrap();
  const out: SanMove[] = [];
  for (const u of uci.slice(0, max)) {
    const move = parseUci(u);
    if (!move || !pos.isLegal(move)) break;
    const white = pos.turn === 'white';
    const num = pos.fullmoves;
    const san = makeSanAndPlay(pos, move);
    out.push({ label: white ? `${num}.` : out.length === 0 ? `${num}…` : '', san });
  }
  return out;
};

/** First move of a line as board squares, for the best-move arrow. */
export const firstMoveSquares = (fen: string, uci: string | undefined): [string, string] | undefined => {
  if (!uci || uci.length < 4) return undefined;
  const from = uci.slice(0, 2);
  let to = uci.slice(2, 4);
  // Cloud lines write castling as king-takes-rook (e1h1); draw it as e1g1.
  const board = fen.split(' ')[0];
  const rows = board.split('/');
  const pieceAt = (sq: string): string | undefined => {
    const file = sq.charCodeAt(0) - 97;
    const row = rows[8 - Number(sq[1])];
    if (!row) return undefined;
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        if (f === file) return ch;
        f++;
      }
    }
    return undefined;
  };
  const mover = pieceAt(from);
  const target = pieceAt(to);
  if (mover && target && mover.toLowerCase() === 'k' && target.toLowerCase() === 'r') {
    const sameSide = (mover === 'K') === (target === 'R');
    if (sameSide) to = (to[0] > from[0] ? 'g' : 'c') + from[1];
  }
  return [from, to];
};

const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const ORDER = ['q', 'r', 'b', 'n', 'p'];

export interface MaterialInfo {
  /** Black pieces White has captured, as lowercase role letters. */
  capturedByWhite: string[];
  capturedByBlack: string[];
  /** Material balance in pawns, positive when White is ahead. */
  diff: number;
}

export const materialFromFen = (fen: string): MaterialInfo => {
  const board = fen.split(' ')[0];
  const count: Record<string, number> = {};
  for (const ch of board) if (/[a-zA-Z]/.test(ch)) count[ch] = (count[ch] || 0) + 1;
  const capturedByWhite: string[] = [];
  const capturedByBlack: string[] = [];
  let diff = 0;
  for (const r of ORDER) {
    const white = count[r.toUpperCase()] || 0;
    const black = count[r] || 0;
    diff += (white - black) * VALUE[r];
    for (let i = 0; i < Math.max(0, START_COUNT[r] - black); i++) capturedByWhite.push(r);
    for (let i = 0; i < Math.max(0, START_COUNT[r] - white); i++) capturedByBlack.push(r);
  }
  return { capturedByWhite, capturedByBlack, diff };
};

export const resultPoints = (result: string): [number, number] | undefined => {
  if (result === '1-0') return [1, 0];
  if (result === '0-1') return [0, 1];
  if (result === '1/2-1/2' || result === '½-½') return [0.5, 0.5];
  return undefined;
};

export const formatPoints = (n: number): string => {
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  if (!half) return String(whole);
  return whole === 0 ? '½' : `${whole}½`;
};
