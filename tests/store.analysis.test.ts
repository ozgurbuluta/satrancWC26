import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, game, HOUR, ITALIAN, push, QGD, R1, R2, R3, resetWorld, round, world } from './helpers';

const T0 = Date.UTC(2026, 10, 25, 15, 0, 0);
const MINUTE = 60_000;
// The Italian line: 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6
const live = (n: number, result = '*') => game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, n), result });
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  localStorage.clear();
  window.history.replaceState(null, '', '/'); // a test that visits the puzzle corner leaves its fragment behind
  resetWorld();
  world.rounds = [round(R1, 1, T0 - HOUR, { ongoing: true })];
  world.defaultRoundId = R1;
});

afterEach(() => {
  vi.useRealTimers();
});

const start = async (plies = 2) => {
  const mod = await boot();
  push(R1, live(plies));
  return mod;
};

describe('a line of the viewer’s own on the board', () => {
  it('starts from the newest position with its own root', async () => {
    const { useStore, analysisPosition } = await start();
    const s = () => useStore.getState();
    expect(s().analysisMove('d2d4')).toBe(true);
    expect(s().analysis).toMatchObject({ gameId: 'g1', rootPly: 2, rootFen: AFTER_E4_E5, rootLastMove: ['e7', 'e5'], revealedAtStart: 2, cursor: 1 });
    expect(s().analysis!.moves.map(m => m.san)).toEqual(['d4']);
    expect(analysisPosition(s().analysis!)).toMatchObject({ lastMove: ['d2', 'd4'], check: false });
    expect(analysisPosition(s().analysis!).fen.startsWith('rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR b')).toBe(true);
    // the game itself is untouched
    expect(s().revealed).toBe(2);
    expect(s().viewPly).toBeNull();
  });

  it('starts from an earlier position when the board shows one', async () => {
    const { useStore } = await start(6);
    const s = () => useStore.getState();
    s().setViewPly(0);
    expect(s().analysisMove('d2d4')).toBe(true);
    expect(s().analysis).toMatchObject({ rootPly: 0, rootFen: START, rootLastMove: undefined });
    expect(s().analysisMove('d7d5')).toBe(true);
    expect(s().analysis!.moves.map(m => m.san)).toEqual(['d4', 'd5']);
  });

  it('takes only legal moves of the position on the board', async () => {
    const { useStore } = await start();
    const s = () => useStore.getState();
    expect(s().analysisMove('e2e4')).toBe(false); // that pawn has moved already
    expect(s().analysisMove('e7e6')).toBe(false); // not that side's turn
    expect(s().analysisMove('zz')).toBe(false);
    expect(s().analysis).toBeNull();
    s().analysisMove('d2d4');
    expect(s().analysisMove('d2d3')).toBe(false); // legal before the own move, not after it
    expect(s().analysis!.moves).toHaveLength(1);
  });

  it('keeps its root and its moves whatever the feed does afterwards', async () => {
    const { useStore, analysisPosition } = await start();
    const s = () => useStore.getState();
    s().analysisMove('d2d4');
    s().analysisMove('e5d4');
    const before = analysisPosition(s().analysis!);

    // the game goes on underneath
    push(R1, live(6));
    expect(s().revealed).toBe(6);
    expect(analysisPosition(s().analysis!)).toEqual(before);
    expect(s().analysis).toMatchObject({ rootPly: 2, rootFen: AFTER_E4_E5, revealedAtStart: 2 });

    // a correction in the feed: the second move is replaced and the game is shorter
    push(R1, game({ round: 1, id: 'g1', sans: ['e4', 'c5'] }));
    expect(s().revealed).toBe(2);
    expect(s().analysis).toMatchObject({ rootFen: AFTER_E4_E5 });
    expect(analysisPosition(s().analysis!)).toEqual(before);

    // the game ends
    push(R1, game({ round: 1, id: 'g1', sans: ['e4', 'c5'], result: '1-0' }));
    expect(analysisPosition(s().analysis!)).toEqual(before);
  });

  it('keeps its root when the delay is raised so far that the root is no longer among the shown moves', async () => {
    const { useStore, analysisPosition } = await start(4);
    const s = () => useStore.getState();
    vi.setSystemTime(T0 + 30_000);
    push(R1, live(6)); // two more moves, seen just now
    s().analysisMove('d2d3');
    const before = analysisPosition(s().analysis!);
    s().setSetting('delaySec', 45);
    expect(s().revealed).toBeLessThan(6);
    expect(analysisPosition(s().analysis!)).toEqual(before);
    // closing it lands on the newest position that is shown, never beyond it
    s().closeAnalysis();
    expect(s().analysis).toBeNull();
    expect(s().viewPly).toBeNull();
  });

  it('the arrows walk the line; back from its start leaves it and steps the game back', async () => {
    const { useStore } = await start(4);
    const s = () => useStore.getState();
    s().analysisMove('d2d4');
    s().analysisMove('e5d4');
    expect(s().analysis!.cursor).toBe(2);
    s().step(-1);
    expect(s().analysis!.cursor).toBe(1);
    s().step(-1);
    expect(s().analysis).toMatchObject({ cursor: 0 }); // the starting position, the line still there
    s().step(1);
    s().step(1);
    expect(s().analysis!.cursor).toBe(2);
    const atEnd = s();
    s().step(1);
    expect(s()).toBe(atEnd); // forward at the end of the line: nothing happens
    s().step(-1);
    s().step(-1);
    s().step(-1);
    expect(s().analysis).toBeNull();
    expect(s().viewPly).toBe(3); // one move before the position the line started from
  });

  it('a move from the middle of the line replaces what came after it', async () => {
    const { useStore } = await start();
    const s = () => useStore.getState();
    s().analysisMove('d2d4');
    s().analysisMove('e5d4');
    s().analysisMove('d1d4');
    s().analysisGoto(1);
    s().analysisMove('d7d6');
    expect(s().analysis!.moves.map(m => m.san)).toEqual(['d4', 'd6']);
    expect(s().analysis!.cursor).toBe(2);
    s().analysisGoto(99);
    expect(s().analysis!.cursor).toBe(2);
    s().analysisGoto(-3);
    expect(s().analysis!.cursor).toBe(0);
  });

  it('returning to the live position drops the line', async () => {
    const { useStore } = await start(4);
    const s = () => useStore.getState();
    s().setViewPly(1);
    s().analysisMove('d7d5');
    push(R1, live(6));
    s().setViewPly(null); // the return button, the last-move control, End and the up arrow all do this
    expect(s().analysis).toBeNull();
    expect(s().viewPly).toBeNull();
    expect(s().revealed).toBe(6);
  });

  it('closing the line goes back to where it started; picking a game move leaves it too', async () => {
    const { useStore } = await start(6);
    const s = () => useStore.getState();
    s().setViewPly(2);
    s().analysisMove('d2d4');
    s().closeAnalysis();
    expect(s().analysis).toBeNull();
    expect(s().viewPly).toBe(2);

    s().analysisMove('d2d4');
    s().setViewPly(5);
    expect(s().analysis).toBeNull();
    expect(s().viewPly).toBe(5);

    s().analysisMove('d2d3');
    s().setViewPly(0);
    expect(s().analysis).toBeNull();
    expect(s().viewPly).toBe(0);
  });

  it('cannot be started on another game’s position or from the puzzle corner', async () => {
    const { useStore } = await start();
    const s = () => useStore.getState();
    s().setPreview({ fen: START, label: 'another game' });
    expect(s().analysisMove('e2e4')).toBe(false);
    s().setPreview(null);
    s().setView('puzzles');
    expect(s().analysisMove('d2d4')).toBe(false);
    expect(s().analysis).toBeNull();
  });

  it('ends when another game’s position takes the board, and survives a visit to the puzzle corner', async () => {
    const { useStore } = await start();
    const s = () => useStore.getState();
    s().analysisMove('d2d4');
    s().setView('puzzles');
    s().setView('live');
    expect(s().analysis).not.toBeNull();
    s().setPreview({ fen: START, label: 'another game' });
    expect(s().analysis).toBeNull();
  });

  it('ends when another game or another board is opened', async () => {
    world.rounds = [round(R1, 1, T0 - HOUR, { ongoing: true }), round(R2, 2, T0 + 23 * HOUR)];
    const first = await start();
    first.useStore.getState().analysisMove('d2d4');
    first.useStore.getState().selectRound(R2);
    expect(first.useStore.getState().analysis).toBeNull();

    const second = await boot();
    push(R1, live(2) + game({ round: 1, id: 'g2', whiteIsSindarov: false, sans: QGD.slice(0, 2) }));
    const s = () => second.useStore.getState();
    const other = s().gameId === 'g1' ? 'g2' : 'g1';
    s().analysisMove(s().gameId === 'g1' ? 'd2d4' : 'c2c4');
    expect(s().analysis).not.toBeNull();
    s().selectGame(other);
    expect(s().analysis).toBeNull();
  });

  it('pausing keeps it; showing the next move, replaying and going live end it; auto-play stops when it starts', async () => {
    const { useStore } = await start(2);
    const s = () => useStore.getState();
    s().pause();
    push(R1, live(6));
    s().setAutoplay(2000);
    s().analysisMove('d2d4');
    expect(s().autoplayMs).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s().revealed).toBe(2); // nothing was revealed under the line
    expect(s().analysis).not.toBeNull();

    s().revealNext();
    expect(s().analysis).toBeNull();
    expect(s().revealed).toBe(3);

    s().analysisMove('d7d6');
    s().restart();
    expect(s().analysis).toBeNull();

    s().analysisMove('d2d4');
    s().pause(); // already paused: still a pause, the line stays
    expect(s().analysis).not.toBeNull();
    s().resume();
    expect(s().analysis).toBeNull();
    expect(s().paused).toBe(false);
  });

  it('is not a prediction, and a prediction is not a move on the board', async () => {
    const { useStore, canGuess, selectGuessFen } = await start();
    const s = () => useStore.getState();
    s().setSetting('guessMode', true);

    // a move on the board in guess mode: analysis only
    s().analysisMove('d2d4');
    expect(s().guess).toBeNull();
    expect(canGuess(s())).toBe(true);
    // the prediction is about the game's own position, not the one on the board
    expect(selectGuessFen(s())).toBe(AFTER_E4_E5);

    // a prediction made while the line is on the board: the board does not move
    const line = s().analysis;
    s().makeGuess({ uci: 'g1f3' });
    expect(s().guess).toMatchObject({ forPly: 3, san: 'Nf3' });
    expect(s().analysis).toBe(line);
    // a move that is legal on the board but not in the game is not a prediction
    s().makeGuess({ uci: 'e5d4' });
    expect(s().guess).toMatchObject({ san: 'Nf3' });

    // the game's next move settles it, with the line still on the board
    push(R1, live(3));
    expect(s().guessLog.g1).toEqual([expect.objectContaining({ ply: 3, guess: 'Nf3', played: 'Nf3', hit: true })]);
    expect(s().analysis).toBe(line);
    expect(s().guessLog.g1).toHaveLength(1);
  });

  it('guess mode holds nothing back outside its tab, whatever the board shows', async () => {
    const { useStore, referencesHeld, canGuess } = await start(4);
    const s = () => useStore.getState();
    s().setSetting('guessMode', true);
    expect(referencesHeld(s())).toBe(true);
    for (const go of [() => s().setViewPly(1), () => s().analysisMove('d7d5'), () => s().setViewPly(null)]) {
      go();
      expect(canGuess(s())).toBe(true);
      expect(referencesHeld(s())).toBe(true); // only the references inside the prediction tab wait
    }
  });

  it('cannot be shared: a link holds a game move, not a line', async () => {
    const { useStore, canSharePosition } = await start();
    const s = () => useStore.getState();
    expect(canSharePosition(s())).toBe(true);
    s().analysisMove('d2d4');
    expect(canSharePosition(s())).toBe(false);
    s().step(-1); // back on its starting position, but still the line
    expect(canSharePosition(s())).toBe(false);
    s().setViewPly(null);
    expect(canSharePosition(s())).toBe(true);
  });
});

describe('stepping at the ends of the game', () => {
  it('back at the first position changes nothing, however often', async () => {
    const { useStore } = await start(4);
    const s = () => useStore.getState();
    s().setViewPly(0);
    const there = s();
    let changes = 0;
    const stop = useStore.subscribe(() => changes++);
    for (let i = 0; i < 12; i++) s().step(-1);
    s().setViewPly(0);
    stop();
    expect(changes).toBe(0);
    expect(s()).toBe(there);
    expect(s().viewPly).toBe(0);
  });

  it('forward at the newest position changes nothing', async () => {
    const { useStore } = await start(4);
    const s = () => useStore.getState();
    const there = s();
    let changes = 0;
    const stop = useStore.subscribe(() => changes++);
    for (let i = 0; i < 5; i++) s().step(1);
    s().setViewPly(null);
    stop();
    expect(changes).toBe(0);
    expect(s()).toBe(there);
  });

  it('back before any move has been played changes nothing', async () => {
    const { useStore } = await start(0);
    const s = () => useStore.getState();
    const there = s();
    s().step(-1);
    s().step(-1);
    expect(s()).toBe(there);
  });

  it('fast steps back and forward end where they should', async () => {
    const { useStore, selectShownPly } = await start(10);
    const s = () => useStore.getState();
    for (let i = 0; i < 25; i++) s().step(-1);
    expect(selectShownPly(s())).toBe(0);
    for (let i = 0; i < 7; i++) s().step(1);
    expect(selectShownPly(s())).toBe(7);
    for (let i = 0; i < 3; i++) s().step(-1);
    for (let i = 0; i < 40; i++) s().step(1);
    expect(s().viewPly).toBeNull();
    expect(selectShownPly(s())).toBe(10);
  });
});

describe('the page never moves to another game while the viewer explores', () => {
  const finished = () => game({ round: 1, id: 'g1', sans: ITALIAN, result: '1/2-1/2' });

  it('waits with the next game while a line is on the board, then counts down from the start', async () => {
    world.rounds = [round(R1, 1, T0 - 23 * HOUR, { finished: true }), round(R2, 2, T0 + HOUR), round(R3, 3, T0 + 25 * HOUR)];
    world.defaultRoundId = R1;
    const { useStore, AUTO_SWITCH_SEC } = await boot();
    push(R1, finished());
    await vi.advanceTimersByTimeAsync(0);
    const s = () => useStore.getState();
    expect(s().analysisMove('e1g1')).toBe(true); // White castles in the final position: a line from the newest move
    expect(s().viewPly).toBeNull();

    world.rounds = [round(R1, 1, T0 - 23 * HOUR, { finished: true }), round(R2, 2, T0 + HOUR, { ongoing: true }), round(R3, 3, T0 + 25 * HOUR)];
    await vi.advanceTimersByTimeAsync(3 * MINUTE);
    expect(s().nextUp?.roundId).toBe(R2); // it is announced
    expect(s().roundId).toBe(R1); // and the page stays
    expect(s().analysis).not.toBeNull();

    s().setViewPly(null);
    await vi.advanceTimersByTimeAsync((AUTO_SWITCH_SEC - 4) * 1000);
    expect(s().roundId).toBe(R1);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(s().roundId).toBe(R2);
  });

  it('on a day with several boards, does not follow to the next board while a line is on the board', async () => {
    world.rounds = [round(R1, 15, T0 - HOUR, { ongoing: true })];
    const tb = (a: { n: number; result?: string }, b: { n: number }) =>
      game({ round: 15, id: 'tb1', sans: ITALIAN.slice(0, a.n), result: a.result }) + game({ round: 15, id: 'tb2', whiteIsSindarov: false, sans: QGD.slice(0, b.n) });
    const { useStore } = await boot();
    const s = () => useStore.getState();
    push(R1, tb({ n: 10, result: '1-0' }, { n: 0 }));
    expect(s().gameId).toBe('tb1');
    expect(s().analysisMove('e1g1')).toBe(true);
    push(R1, tb({ n: 10, result: '1-0' }, { n: 2 }));
    expect(s().gameId).toBe('tb1');
    expect(s().analysis).not.toBeNull();
    // back on the game: the next update moves on
    s().setViewPly(null);
    push(R1, tb({ n: 10, result: '1-0' }, { n: 3 }));
    expect(s().gameId).toBe('tb2');
  });
});
