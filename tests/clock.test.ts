import { describe, expect, it } from 'vitest';
import { addedAfterMove, ambiguousAfterMove, formatDuration, moveTimes, parseTimeControl } from '../src/lib/clock';
import { parseGame, type GameData } from '../src/lib/pgn';

// The tag as the public feed of the match carries it (games 1 and 2, read on 25 November 2026).
const MATCH_TAG = "120'/40m + 30'/end, 30/move from move 41";
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A game with only what the clock arithmetic reads: the tag and a clock reading per half-move. */
const gameWith = (timeControl: string | undefined, clocks: (number | undefined)[]): GameData =>
  ({
    id: 'g',
    round: '1.1',
    white: { name: 'White' },
    black: { name: 'Black' },
    result: '*',
    resultSeenAt: 0,
    initialFen: START,
    timeControl,
    plies: clocks.map(clk => ({ clk })),
  }) as unknown as GameData;

/** Readings for one player: White's moves, with Black always answering at once on a clock that never moves. */
const whiteOnly = (tag: string | undefined, white: (number | undefined)[], blackClock = 9999) =>
  moveTimes(
    gameWith(
      tag,
      white.flatMap(w => [w, blackClock]),
    ),
    white.length * 2,
  ).filter((_, i) => i % 2 === 0);

describe('reading a time control', () => {
  it("reads the match's own tag: 120 minutes for 40 moves, 30 to the end, 30 seconds a move from move 41", () => {
    expect(parseTimeControl(MATCH_TAG)).toEqual([
      { moves: 40, seconds: 7200, increment: 0 },
      { moves: undefined, seconds: 1800, increment: 30 },
    ]);
  });

  it('gives a game with that tag two hours on the clock, not two minutes', () => {
    const pgn = `[Event "FIDE World Chess Championship Match"]\n[Round "2.1"]\n[White "Gukesh D"]\n[Black "Sindarov, Javokhir"]\n[Result "*"]\n[TimeControl "${MATCH_TAG}"]\n[Variant "Standard"]\n[GameURL "https://lichess.org/broadcast/t/r/L3j03TZq/p6HX9bPF"]\n\n1. d4 { [%clk 1:59:53] } 1... d5 { [%clk 1:59:34] } 2. Nf3 { [%clk 1:59:44] } *\n`;
    const game = parseGame(pgn, undefined, 0)!;
    expect(game.initialClock).toBe(7200);
    expect(game.timeControl).toBe(MATCH_TAG);
    expect(moveTimes(game, 3)).toEqual([7, 26, 9]);
  });

  it('reads other written-out controls of the same shape', () => {
    expect(parseTimeControl(`90'/40m + 30'/end, 30"/move from move 1`)).toEqual([
      { moves: 40, seconds: 5400, increment: 30 },
      { moves: undefined, seconds: 1800, increment: 30 },
    ]);
    expect(parseTimeControl("120'/40m + 60'/20m + 15'/end, 30/move from move 61")).toEqual([
      { moves: 40, seconds: 7200, increment: 0 },
      { moves: 20, seconds: 3600, increment: 0 },
      { moves: undefined, seconds: 900, increment: 30 },
    ]);
    expect(parseTimeControl(`90' + 30"`)).toEqual([{ moves: undefined, seconds: 5400, increment: 30 }]);
    expect(parseTimeControl("15'")).toEqual([{ moves: undefined, seconds: 900, increment: 0 }]);
    expect(parseTimeControl("25'/end, 10/move")).toEqual([{ moves: undefined, seconds: 1500, increment: 10 }]);
  });

  it('reads standard PGN controls', () => {
    expect(parseTimeControl('40/7200:20/3600:900+30')).toEqual([
      { moves: 40, seconds: 7200, increment: 0 },
      { moves: 20, seconds: 3600, increment: 0 },
      { moves: undefined, seconds: 900, increment: 30 },
    ]);
    expect(parseTimeControl('5400+30')).toEqual([{ moves: undefined, seconds: 5400, increment: 30 }]);
    expect(parseTimeControl('600')).toEqual([{ moves: undefined, seconds: 600, increment: 0 }]);
    expect(parseTimeControl('40/5400+30:1800+30')).toEqual([
      { moves: 40, seconds: 5400, increment: 30 },
      { moves: undefined, seconds: 1800, increment: 30 },
    ]);
  });

  it('does not guess at anything else', () => {
    for (const tag of [
      undefined,
      '',
      '?',
      '-',
      '120 minutes for 40 moves',
      'about two hours',
      "120'/40m + 30'/end, 30/move from move 35", // an increment that starts in the middle of a period
      "120'/40m + 30'/end, 30/move from move 41, plus a bonus",
      "120'/40m", // no period that runs to the end
      "30'/end + 120'/40m",
      "0'/40m + 30'/end",
      '40/7200:3600:900', // a middle period without a number of moves
      '*180',
      '2:00:00',
    ]) {
      expect(parseTimeControl(tag), String(tag)).toBeUndefined();
    }
    // a game whose tag cannot be read starts with no clock rather than a wrong one
    const pgn = `[Event "x"]\n[Round "1.1"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n[TimeControl "Classical"]\n[GameURL "https://lichess.org/broadcast/t/r/x/y"]\n\n1. e4 { [%clk 1:59:53] } *\n`;
    expect(parseGame(pgn, undefined, 0)!.initialClock).toBeUndefined();
  });
});

describe('what the time control adds to the clock', () => {
  const match = parseTimeControl(MATCH_TAG)!;
  it('nothing in the first forty moves, thirty minutes on the fortieth, thirty seconds a move after it', () => {
    expect(addedAfterMove(match, 1)).toBe(0);
    expect(addedAfterMove(match, 39)).toBe(0);
    expect(addedAfterMove(match, 40)).toBe(1800);
    expect(addedAfterMove(match, 41)).toBe(30);
    expect(addedAfterMove(match, 90)).toBe(30);
  });

  it('the reading after the last move before the increment starts can be read two ways', () => {
    expect(ambiguousAfterMove(match, 39)).toBe(false);
    expect(ambiguousAfterMove(match, 40)).toBe(true);
    expect(ambiguousAfterMove(match, 41)).toBe(false);
    // an increment from the first move: the first reading is the unclear one
    const fischer = parseTimeControl('5400+30')!;
    expect(ambiguousAfterMove(fischer, 1)).toBe(true);
    expect(ambiguousAfterMove(fischer, 2)).toBe(false);
    // no increment anywhere: nothing is unclear
    expect(ambiguousAfterMove(parseTimeControl('40/7200:3600')!, 40)).toBe(false);
  });
});

describe('time spent on each move', () => {
  it('is the drop of the clock in the first period', () => {
    expect(whiteOnly(MATCH_TAG, [7193, 7100, 6500, 6500])).toEqual([7, 93, 600, 0]);
  });

  it('counts the thirty minutes and the increments of the match control', () => {
    // moves 39 to 43: the fortieth move earns thirty minutes, later ones thirty seconds each
    const before39 = Array.from({ length: 38 }, (_, i) => 7200 - (i + 1) * 100); // 100 seconds a move
    const times = whiteOnly(MATCH_TAG, [...before39, 3300, 5000, 4980, 4710, 4740]);
    expect(times.slice(0, 38).every(s => s === 100)).toBe(true);
    expect(times[38]).toBe(100); // move 39
    expect(times[39]).toBeUndefined(); // move 40: the reading may or may not hold the first increment
    expect(times[40]).toBe(50); // move 41: 5000 - 4980 + 30
    expect(times[41]).toBe(300); // move 42: 4980 - 4710 + 30
    expect(times[42]).toBe(0); // move 43: played at once, the clock rose by exactly the increment
  });

  it('leaves a move unknown when its reading is missing, and the next one too', () => {
    expect(whiteOnly(MATCH_TAG, [7100, undefined, 6800, 6700])).toEqual([100, undefined, undefined, 100]);
  });

  it('never turns a clock that went up into a move of no time', () => {
    // a correction by the arbiter, or a reading that was fixed later: 300 seconds appear from nowhere
    const times = whiteOnly(MATCH_TAG, [7100, 7400, 7300]);
    expect(times).toEqual([100, undefined, 100]);
    expect(times).not.toContain(0);
  });

  it('knows nothing when the time control cannot be read', () => {
    expect(whiteOnly('Classical', [7100, 7000, 6900])).toEqual([undefined, undefined, undefined]);
    expect(whiteOnly(undefined, [7100, 7000])).toEqual([undefined, undefined]);
  });

  it('handles standard controls: a second period without an increment, then one with', () => {
    const tag = '40/7200:20/3600:900+30';
    const firstForty = Array.from({ length: 39 }, (_, i) => 7200 - (i + 1) * 60);
    const afterForty = 4860 - 60 + 3600; // move 40 took a minute and earned an hour
    const times = whiteOnly(tag, [...firstForty, afterForty, afterForty - 600]);
    expect(times[38]).toBe(60);
    expect(times[39]).toBe(60); // no increment on either side of move 40, so it is clear
    expect(times[40]).toBe(600);
    // with an increment from the start, only the first move is unclear
    expect(whiteOnly('5400+30', [5410, 5380, 5410])).toEqual([undefined, 60, 0]);
    expect(whiteOnly('600', [590, 500])).toEqual([10, 90]);
  });

  it('keeps the two players apart, also when Black moves first', () => {
    const game = gameWith(MATCH_TAG, [7150, 7000, 7100, 6900]);
    expect(moveTimes(game, 4)).toEqual([50, 200, 50, 100]);
    // A game that begins with Black to move was set up from a position: the clocks before it are not known.
    const blackFirst = { ...game, initialFen: START.replace(' w ', ' b ') } as GameData;
    expect(moveTimes(blackFirst, 4)).toEqual([undefined, undefined, 50, 100]);
    expect(moveTimes(game, 2)).toEqual([50, 200]); // only the moves that are shown
  });
});

describe('a game set up from a later position', () => {
  // Black to play move 39; White has made 39 moves, Black 38.
  const MIDGAME = '6k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 39';

  it('has no clock on its first position: the full allotment is not assumed', () => {
    const pgn = `[Event "x"]\n[Round "1.1"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n[SetUp "1"]\n[FEN "${MIDGAME}"]\n[TimeControl "${MATCH_TAG}"]\n[GameURL "https://lichess.org/broadcast/t/r/x/y"]\n\n39... Kf8 { [%clk 0:20:00] } 40. Kf1 { [%clk 0:15:00] } *\n`;
    const game = parseGame(pgn, undefined, 0)!;
    expect(game.initialFen.startsWith('6k1/5ppp/8/8/8/8/5PPP/6K1 b')).toBe(true);
    expect(game.initialClock).toBeUndefined();
    // each player's first recorded move has no earlier reading to compare with
    expect(moveTimes(game, 2)).toEqual([undefined, undefined]);
  });

  it('never invents a first duration, and numbers the moves from the position', () => {
    const game = { ...gameWith(MATCH_TAG, [1200, 900, 1100, 2400, 2890, 2380]), initialFen: MIDGAME } as GameData;
    // plies: 39...(B) 40.(W) 40...(B) 41.(W) 41...(B) 42.(W)
    expect(moveTimes(game, 6)).toEqual([
      undefined, // Black's first move here: no earlier reading
      undefined, // White's first move here: no earlier reading
      undefined, // Black's move 40: the reading where the increment starts
      undefined, // White's move 41: the clock rose from 900 to 2400, more than thirty seconds explain
      undefined, // Black's move 41: the same, from 1100 to 2890
      50, // White's move 42: 2400 - 2380 + 30
    ]);
  });

  it('applies the period and the increment at the right move numbers', () => {
    // White to play move 41: both players have made 40 moves
    const game = { ...gameWith(MATCH_TAG, [3000, 2800, 2980, 2700]), initialFen: '6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 41' } as GameData;
    // 41.(W) 41...(B) 42.(W) 42...(B): first readings are unknown, the second ones use the 30-second increment
    expect(moveTimes(game, 4)).toEqual([undefined, undefined, 50, 130]);
    // a position that is not the initial one is a set-up even when its FEN says move 1
    const moveOne = { ...game, initialFen: '6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1' } as GameData;
    expect(moveTimes(moveOne, 2)).toEqual([undefined, undefined]);
    // read as if it began at move one, the same clocks would have given 4200 and 4400 seconds for the first two moves
    const wrong = { ...game, initialFen: START } as GameData;
    expect(moveTimes(wrong, 4)[0]).toBe(4200);
  });
});

describe('saying a duration', () => {
  const tr = { h: 'sa', m: 'dk', s: 'sn' };
  it('uses the largest units that matter', () => {
    expect(formatDuration(51, tr)).toBe('51 sn');
    expect(formatDuration(60, tr)).toBe('1 dk');
    expect(formatDuration(150, tr)).toBe('2 dk 30 sn');
    expect(formatDuration(754, tr)).toBe('12 dk');
    expect(formatDuration(3900, tr)).toBe('1 sa 5 dk');
    expect(formatDuration(7200, tr)).toBe('2 sa');
    expect(formatDuration(-5, tr)).toBe('0 sn');
  });
});
