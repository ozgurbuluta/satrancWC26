import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moveByUci, type PlayedMove } from '../src/lib/position';
import { boot, game, HOUR, ITALIAN, push, R1, R2, resetWorld, round, world } from './helpers';

const T0 = Date.UTC(2026, 10, 25, 15, 0, 0);
// Position after 1. e4 e5: the game continues 2. Nf3.
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const guessOf = (uci: string, fen = AFTER_E4_E5) => moveByUci(fen, uci)!;
const live = (n: number, result = '*') => game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, n), result });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  localStorage.clear();
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
  mod.useStore.getState().setSetting('guessMode', true);
  return mod;
};

describe('guess the move', () => {
  it('clears pending guesses and engine peeks when switching zero-ply boards', async () => {
    const { useStore, referencesHeld, canGuess } = await start(0);
    push(R1, live(0) + game({ round: 1, id: 'g2', sans: [] }));
    const s = () => useStore.getState();
    const first = s().games.g1.initialFen;
    s().makeGuess(moveByUci(first, 'e2e4')!);
    const stale = s().guess;
    s().selectGame('g2');
    expect(s().guess).toBeNull();
    expect(referencesHeld(s())).toBe(true);
    expect(referencesHeld({ ...s(), guess: stale })).toBe(true);
    s().peekEngine();
    s().selectGame('g1');
    expect(s().peekedPly).toBeNull();
    expect(canGuess(s())).toBe(true);
  });

  it('clears pending guesses before a new round has received any moves', async () => {
    const { useStore } = await start(0);
    const s = () => useStore.getState();
    s().makeGuess(moveByUci(s().games.g1.initialFen, 'e2e4')!);
    s().selectRound(R2);
    expect(s().guess).toBeNull();
    expect(s().peekedPly).toBeNull();
  });

  it('a right guess is recorded as a hit when the move arrives', async () => {
    const { useStore } = await start();
    useStore.getState().makeGuess(guessOf('g1f3'));
    expect(useStore.getState().guess).toMatchObject({ forPly: 3, san: 'Nf3' });
    expect(useStore.getState().guessLog.g1).toBeUndefined(); // nothing is known yet

    push(R1, live(3));
    expect(useStore.getState().guess).toBeNull();
    expect(useStore.getState().guessLog.g1).toEqual([expect.objectContaining({ ply: 3, guess: 'Nf3', played: 'Nf3', hit: true })]);
  });

  it('a wrong guess is recorded as a miss, with what was played', async () => {
    const { useStore } = await start();
    useStore.getState().makeGuess(guessOf('d2d4'));
    push(R1, live(3));
    expect(useStore.getState().guessLog.g1).toEqual([expect.objectContaining({ ply: 3, guess: 'd4', played: 'Nf3', hit: false, fenBefore: AFTER_E4_E5 })]);
  });

  it('the guess can be changed until the move arrives', async () => {
    const { useStore } = await start();
    useStore.getState().makeGuess(guessOf('d2d4'));
    useStore.getState().makeGuess(guessOf('g1f3'));
    push(R1, live(3));
    expect(useStore.getState().guessLog.g1).toHaveLength(1);
    expect(useStore.getState().guessLog.g1[0].hit).toBe(true);
  });

  it('only a legal move in the position on the board can be a guess', async () => {
    const { useStore } = await start();
    const forged = { ...guessOf('g1f3'), uci: 'e2e5' } as PlayedMove;
    useStore.getState().makeGuess(forged);
    expect(useStore.getState().guess).toBeNull();
    // a move that is legal in some other position is refused too
    useStore.getState().makeGuess(moveByUci('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4')!);
    expect(useStore.getState().guess).toBeNull();
  });

  it('when several moves arrive at once, the guess is settled by the first of them only', async () => {
    const { useStore } = await start();
    useStore.getState().makeGuess(guessOf('g1f3'));
    push(R1, live(6));
    expect(useStore.getState().guessLog.g1).toEqual([expect.objectContaining({ ply: 3, hit: true })]);
  });

  it('while paused, a guess is not settled by moves the viewer has not been shown', async () => {
    const { useStore } = await start();
    useStore.getState().pause();
    push(R1, live(8, '1-0')); // the game goes on, and ends, out of sight
    useStore.getState().makeGuess(guessOf('d2d4'));
    expect(useStore.getState().guess).not.toBeNull();
    expect(useStore.getState().guessLog.g1).toBeUndefined();

    useStore.getState().revealNext();
    expect(useStore.getState().revealed).toBe(3);
    expect(useStore.getState().guessLog.g1).toEqual([expect.objectContaining({ ply: 3, played: 'Nf3', hit: false })]);
  });

  it('a guess is dropped, not scored, when the game ends without another move', async () => {
    const { useStore } = await start();
    useStore.getState().makeGuess(guessOf('g1f3'));
    push(R1, live(2, '1/2-1/2'));
    expect(useStore.getState().resultVisible).toBe(true);
    expect(useStore.getState().guess).toBeNull();
    expect(useStore.getState().guessLog.g1).toBeUndefined();
  });

  it('a guess is dropped when the viewer rewinds to replay the game', async () => {
    const { useStore } = await start();
    useStore.getState().makeGuess(guessOf('g1f3'));
    useStore.getState().restart();
    expect(useStore.getState().guess).toBeNull();
    expect(useStore.getState().guessLog.g1).toBeUndefined();
  });

  it('says when a guess is possible, and holds the references in its tab back only until it is made', async () => {
    const { useStore, canGuess, referencesHeld } = await start();
    const s = () => useStore.getState();
    expect(canGuess(s())).toBe(true);
    expect(referencesHeld(s())).toBe(true);

    s().makeGuess(guessOf('g1f3'));
    expect(canGuess(s())).toBe(true); // it can still be changed
    expect(referencesHeld(s())).toBe(false); // the references may be compared with it now

    s().clearGuess();
    s().setViewPly(1);
    expect(canGuess(s())).toBe(true); // the guess is about the game, wherever the board is
    s().setViewPly(null);

    s().peekEngine();
    expect(canGuess(s())).toBe(false); // gave this move up to see the references
    expect(referencesHeld(s())).toBe(false);
    push(R1, live(3));
    expect(canGuess(s())).toBe(true); // a new move, a new chance

    s().setView('puzzles');
    expect(canGuess(s())).toBe(false);
    s().setView('live');

    s().setSetting('guessMode', false);
    expect(canGuess(s())).toBe(false);
    expect(referencesHeld(s())).toBe(false);
    s().setSetting('guessMode', true);

    push(R1, live(3, '1-0'));
    expect(canGuess(s())).toBe(false); // the game is over
  });

  it('looking at the engine cancels an open guess for that move', async () => {
    const { useStore } = await start();
    useStore.getState().makeGuess(guessOf('g1f3'));
    useStore.getState().peekEngine();
    push(R1, live(3));
    expect(useStore.getState().guessLog.g1).toBeUndefined();
  });

  it('keeps the history of guesses across a reload', async () => {
    const first = await start();
    first.useStore.getState().makeGuess(guessOf('g1f3'));
    push(R1, live(3));

    const second = await boot();
    push(R1, live(3));
    expect(second.useStore.getState().guessLog.g1).toEqual([expect.objectContaining({ ply: 3, hit: true })]);
  });
});
