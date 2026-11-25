// Time controls, and the time spent on each move worked out from the clock
// readings in the feed.
//
// The feed gives each player's clock after their move. The time a move took
// is the difference to that player's previous reading, plus whatever the
// time control added in between: an increment, or the time for the next
// period. Where a reading is missing, where the time control cannot be read,
// or where the numbers cannot be explained by it, the time is unknown. It is
// never estimated and never shown as zero.
import type { GameData } from './pgn';

export interface Period {
  /** Moves in this period; undefined for the last one, which runs to the end of the game. */
  moves?: number;
  /** Seconds a player gets for this period. */
  seconds: number;
  /** Seconds added for each move of this period. */
  increment: number;
}

const whole = (text: string) => Number(text);

/** Standard PGN: "40/7200:20/3600:900+30", "5400+30", "600". */
const parseStandard = (tc: string): Period[] | undefined => {
  const periods: Period[] = [];
  const parts = tc.split(':');
  for (let i = 0; i < parts.length; i++) {
    const m = /^(?:(\d{1,3})\/)?(\d{1,6})(?:\+(\d{1,4}))?$/.exec(parts[i].trim());
    if (!m) return undefined;
    const last = i === parts.length - 1;
    // every period but the last needs a number of moves, and the last must not have one that ends the game early
    if (!last && !m[1]) return undefined;
    periods.push({ moves: last ? undefined : whole(m[1]), seconds: whole(m[2]), increment: m[3] ? whole(m[3]) : 0 });
  }
  return periods;
};

/**
 * The form organisers write out, as Lichess broadcasts carry it:
 * "120'/40m + 30'/end, 30/move from move 41" (minutes marked with ', a
 * number of moves with m, "end" for the rest of the game, then seconds per
 * move and the move from which they apply). Only this shape is read. Any
 * other wording is not guessed at.
 */
const parseWritten = (tc: string): Period[] | undefined => {
  const [main, extra, ...more] = tc.split(',').map(s => s.trim());
  if (more.length || !main) return undefined;
  const periods: Period[] = [];
  let allMoves = 0; // an increment written as a period of its own: 90' + 30"
  const parts = main.split('+').map(s => s.trim());
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    const seconds = /^(\d{1,4})\s*(?:"|''|s)$/.exec(parts[i]);
    if (seconds && last && periods.length > 0 && !extra) {
      allMoves = whole(seconds[1]);
      continue;
    }
    const m = /^(\d{1,4})\s*'\s*(?:\/\s*(?:(\d{1,3})\s*m|end))?$/.exec(parts[i]);
    if (!m) return undefined;
    const moves = m[2] ? whole(m[2]) : undefined;
    periods.push({ moves, seconds: whole(m[1]) * 60, increment: 0 });
  }
  if (periods.length === 0) return undefined;
  // only the last period may run to the end of the game, and it has to
  for (let i = 0; i < periods.length; i++) {
    if ((periods[i].moves === undefined) !== (i === periods.length - 1)) return undefined;
  }
  if (allMoves) for (const p of periods) p.increment = allMoves;
  if (extra) {
    const inc = /^(\d{1,4})\s*(?:"|''|s)?\s*\/\s*move(?:\s+from\s+move\s+(\d{1,3}))?$/.exec(extra);
    if (!inc) return undefined;
    const from = inc[2] ? whole(inc[2]) : 1;
    // the increment has to start where a period starts; anything else is a rule this reader does not know
    let start = 1;
    let matched = false;
    for (const p of periods) {
      if (start >= from) {
        if (start === from) matched = true;
        if (!matched) return undefined;
        p.increment = whole(inc[1]);
      }
      start += p.moves ?? 0;
    }
    if (!matched) return undefined;
  }
  return periods;
};

/**
 * The form a broadcast's description uses, in English words:
 * "120 min / 40 moves + 30 min / rest + 30 sec / move starting 41",
 * "90 min + 30 sec / move". Anything not fully understood: undefined.
 */
export const parseInfoTimeControl = (text: string | undefined): Period[] | undefined => {
  const parts = text?.trim().toLowerCase().split('+').map(part => part.trim().replace(/\s+/g, ' '));
  if (!parts || !parts[0]) return undefined;
  const periods: Period[] = [];
  let added: { seconds: number; from: number } | undefined;
  for (const part of parts) {
    const withMoves = /^(\d{1,3}) min(?:utes?)? ?\/ ?(\d{1,3}) moves?$/.exec(part);
    const open = /^(\d{1,3}) min(?:utes?)?(?: ?\/ ?(?:rest|end|game))?$/.exec(part);
    const perMove = /^(\d{1,3}) sec(?:onds?)? ?\/ ?move(?: (?:starting|from)(?: move)? (\d{1,3}))?$/.exec(part);
    if (withMoves) periods.push({ moves: whole(withMoves[2]), seconds: whole(withMoves[1]) * 60, increment: 0 });
    else if (open) periods.push({ seconds: whole(open[1]) * 60, increment: 0 });
    else if (perMove && !added) added = { seconds: whole(perMove[1]), from: perMove[2] ? whole(perMove[2]) : 1 };
    else return undefined;
  }
  // every period but the last has a number of moves, and the last has none
  if (!periods.length || periods.some((p, i) => (p.moves === undefined) !== (i === periods.length - 1))) return undefined;
  if (added) {
    // the increment has to begin with a period, as in the written form
    let start = 1;
    let matched = false;
    for (const p of periods) {
      if (start === added.from) matched = true;
      if (matched) p.increment = added.seconds;
      start += p.moves ?? 0;
    }
    if (!matched) return undefined;
  }
  return periods.every(p => p.seconds > 0 && (p.moves === undefined || p.moves > 0)) ? periods : undefined;
};

/** The words a time control is described with, in the viewer's language. */
export interface TimeControlWords {
  tcMoves: string;
  tcRest: string;
  tcAll: string;
  tcIncrement: string;
  tcIncrementFrom: string;
  minutesWord: string;
  secondsWord: string;
}

/** A time control as a sentence: "40 hamle için 120 dakika, kalan hamleler için 30 dakika, 41. hamleden itibaren her hamlede 30 saniye eklenir". */
export const describeTimeControl = (periods: Period[], t: TimeControlWords): string => {
  const span = (seconds: number) => (seconds % 60 === 0 ? `${seconds / 60} ${t.minutesWord}` : `${seconds} ${t.secondsWord}`);
  const parts = periods.map((p, i) =>
    (p.moves !== undefined ? t.tcMoves.replace('{moves}', String(p.moves)) : i === 0 ? t.tcAll : t.tcRest).replace('{time}', span(p.seconds)),
  );
  // the increment is named where it begins or changes
  let start = 1;
  periods.forEach((p, i) => {
    if (p.increment > 0 && p.increment !== (i > 0 ? periods[i - 1].increment : 0)) {
      parts.push((start === 1 ? t.tcIncrement : t.tcIncrementFrom.replace('{move}', String(start))).replace('{time}', span(p.increment)));
    }
    start += p.moves ?? 0;
  });
  return parts.join(', ');
};

/** Reads a TimeControl tag in either form. Unknown, missing or unclear: undefined. */
export const parseTimeControl = (tc: string | undefined): Period[] | undefined => {
  const text = tc?.trim();
  if (!text || text === '?' || text === '-') return undefined;
  const periods = /'/.test(text) ? parseWritten(text) : parseStandard(text);
  return periods && periods.every(p => p.seconds > 0 && (p.moves === undefined || p.moves > 0)) ? periods : undefined;
};

/** The period a player's `moveNo`-th move belongs to, and whether that move completes it. */
const periodOf = (periods: Period[], moveNo: number): { index: number; completes: boolean } => {
  let end = 0;
  for (let i = 0; i < periods.length; i++) {
    if (periods[i].moves === undefined) return { index: i, completes: false };
    end += periods[i].moves!;
    if (moveNo <= end) return { index: i, completes: moveNo === end };
  }
  return { index: periods.length - 1, completes: false };
};

/** Seconds the time control adds to a player's clock when they complete their `moveNo`-th move. */
export const addedAfterMove = (periods: Period[], moveNo: number): number => {
  const { index, completes } = periodOf(periods, moveNo);
  return periods[index].increment + (completes && periods[index + 1] ? periods[index + 1].seconds : 0);
};

/**
 * Whether the clock reading after a player's `moveNo`-th move can be read in
 * two ways. Clocks add an increment either when a move is completed or
 * before the next one starts. The two agree except where the increment
 * changes: at the first move when there is one from the start, and at the
 * last move before a period with a different increment. The time of those
 * moves is left unknown rather than given half a minute out.
 */
export const ambiguousAfterMove = (periods: Period[], moveNo: number): boolean => {
  const here = periods[periodOf(periods, moveNo).index].increment;
  const next = periods[periodOf(periods, moveNo + 1).index].increment;
  return here !== next || (moveNo === 1 && here > 0);
};

const INITIAL_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

/**
 * Whether a game starts from the initial position, at its first move, with
 * White to play. A game set up from any other position does not, whatever
 * move number its FEN gives: what was on the clocks there is not known.
 */
export const startsAtFirstMove = (fen: string): boolean => {
  const fields = fen.trim().split(/\s+/);
  return fields[0] === INITIAL_PLACEMENT && fields[1] !== 'b' && (fields[5] === undefined || fields[5] === '1');
};

/**
 * Seconds spent on each of the first `count` half-moves. `undefined` where it
 * is not known: the time control cannot be read, the reading for the move or
 * the one before it is missing, the reading can be understood in two ways,
 * or the clock went up by more than the time control explains.
 *
 * A game that is set up from a later position (a FEN in the feed) has no
 * known clocks before its first recorded moves, so each player's first move
 * there is unknown, and moves are numbered from the position's own move
 * number so that periods and increments fall where they belong.
 */
export const moveTimes = (game: GameData, count: number): (number | undefined)[] => {
  const n = Math.min(count, game.plies.length);
  const periods = parseTimeControl(game.timeControl);
  if (!periods) return Array.from({ length: n }, () => undefined);
  const whiteStarts = game.initialFen.split(' ')[1] !== 'b';
  const fromStart = startsAtFirstMove(game.initialFen);
  const fullMove = Math.max(1, Number(game.initialFen.trim().split(/\s+/)[5]) || 1);
  const out: (number | undefined)[] = [];
  // index 0 is White, 1 is Black
  const last: (number | undefined)[] = fromStart ? [periods[0].seconds, periods[0].seconds] : [undefined, undefined];
  // moves each player has already made in the starting position
  const made = [whiteStarts ? fullMove - 1 : fullMove, fullMove - 1];
  for (let i = 0; i < n; i++) {
    const side = (i % 2 === 0) === whiteStarts ? 0 : 1;
    const clk = game.plies[i].clk;
    made[side]++;
    if (clk === undefined || last[side] === undefined || ambiguousAfterMove(periods, made[side])) out.push(undefined);
    else {
      const spent = last[side]! - clk + addedAfterMove(periods, made[side]);
      // Less than nothing: time was added or the clock was corrected in a way the tag does not describe.
      out.push(spent >= 0 ? spent : undefined);
    }
    last[side] = clk;
  }
  return out;
};

/** "51 sn", "1 dk", "2 dk 30 sn", "1 sa 5 dk": a duration as a person would say it. */
export const formatDuration = (seconds: number, units: { h: string; m: string; s: string }): string => {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} ${units.s}`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) return m > 0 ? `${h} ${units.h} ${m} ${units.m}` : `${h} ${units.h}`;
  return rest >= 5 && m < 10 ? `${m} ${units.m} ${rest} ${units.s}` : `${m} ${units.m}`;
};
