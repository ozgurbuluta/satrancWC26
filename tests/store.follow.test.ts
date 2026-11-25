import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, game, HOUR, ITALIAN, push, QGD, R1, R2, R3, resetWorld, round, world } from './helpers';

const T0 = Date.UTC(2026, 10, 25, 13, 0, 0);
const MINUTE = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  localStorage.clear();
  resetWorld();
});

afterEach(() => {
  vi.useRealTimers();
});

const finishedGame1 = () => game({ round: 1, id: 'g1', sans: ITALIAN, result: '1/2-1/2' });

/** Game 1 is over and on screen; Game 2 is tomorrow's game, not yet started. */
const afterGame1 = async () => {
  world.rounds = [round(R1, 1, T0 - 23 * HOUR, { finished: true }), round(R2, 2, T0 + HOUR), round(R3, 3, T0 + 25 * HOUR)];
  world.defaultRoundId = R1;
  const mod = await boot();
  push(R1, finishedGame1());
  await vi.advanceTimersByTimeAsync(0);
  return mod;
};

const game2GoesLive = () => {
  world.rounds = [round(R1, 1, T0 - 23 * HOUR, { finished: true }), round(R2, 2, T0 + HOUR, { ongoing: true }), round(R3, 3, T0 + 25 * HOUR)];
};

describe('following the match to the next game', () => {
  it('opens the game that is live when the page loads', async () => {
    world.rounds = [round(R1, 1, T0 - 23 * HOUR, { finished: true }), round(R2, 2, T0 - HOUR, { ongoing: true })];
    world.defaultRoundId = R1;
    const { useStore } = await boot();
    expect(useStore.getState().roundId).toBe(R2);
    expect(useStore.getState().followLatest).toBe(true);
  });

  it('announces the next game when it goes live, then opens it after the countdown', async () => {
    const { useStore, AUTO_SWITCH_SEC } = await afterGame1();
    expect(useStore.getState().roundId).toBe(R1);
    expect(useStore.getState().nextUp).toBeNull();

    game2GoesLive();
    await vi.advanceTimersByTimeAsync(62_000); // next tournament refresh
    expect(useStore.getState().nextUp?.roundId).toBe(R2);
    expect(useStore.getState().roundId).toBe(R1);

    await vi.advanceTimersByTimeAsync((AUTO_SWITCH_SEC + 3) * 1000);
    expect(useStore.getState().roundId).toBe(R2);
    expect(useStore.getState().nextUp).toBeNull();
    expect(world.closed).toContain(R1);
  });

  it('announces a game that starts within half an hour, without waiting for the feed to flag it', async () => {
    const { useStore } = await afterGame1();
    await vi.advanceTimersByTimeAsync(25 * MINUTE); // 35 minutes to go
    expect(useStore.getState().nextUp).toBeNull();
    await vi.advanceTimersByTimeAsync(6 * MINUTE); // 29 minutes to go
    expect(useStore.getState().nextUp?.roundId ?? useStore.getState().roundId).toBe(R2);
  });

  it('says nothing and stays put while the viewer is paused', async () => {
    world.rounds = [round(R1, 1, T0 - 5 * HOUR, { ongoing: true }), round(R2, 2, T0 + 19 * HOUR)];
    world.defaultRoundId = R1;
    const { useStore } = await boot();
    push(R1, game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 6) }));
    useStore.getState().pause();

    // the game ends and, much later, the next one starts; the viewer is still catching up
    push(R1, finishedGame1());
    world.rounds = [round(R1, 1, T0 - 5 * HOUR, { finished: true }), round(R2, 2, T0 + 19 * HOUR, { ongoing: true })];
    await vi.advanceTimersByTimeAsync(5 * MINUTE);

    const s = useStore.getState();
    expect(s.nextUp).toBeNull();
    expect(s.roundId).toBe(R1);
    expect(s.paused).toBe(true);
    expect(s.revealed).toBe(6);
    expect(s.resultVisible).toBe(false);
  });

  it('clears an announcement that was already showing when the viewer pauses', async () => {
    const { useStore } = await afterGame1();
    game2GoesLive();
    await vi.advanceTimersByTimeAsync(62_000);
    expect(useStore.getState().nextUp).not.toBeNull();
    useStore.getState().restart(); // replay Game 1 from the start, spoiler-free
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    expect(useStore.getState().nextUp).toBeNull();
    expect(useStore.getState().roundId).toBe(R1);
  });

  it('"stay here" keeps the viewer on the game and the announcement does not come back', async () => {
    const { useStore } = await afterGame1();
    game2GoesLive();
    await vi.advanceTimersByTimeAsync(62_000);
    useStore.getState().stayHere();
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(useStore.getState().roundId).toBe(R1);
    expect(useStore.getState().nextUp).toBeNull();
    expect(useStore.getState().followLatest).toBe(false);
  });

  it('waits while the viewer browses earlier moves, then counts down again from the start', async () => {
    const { useStore, AUTO_SWITCH_SEC } = await afterGame1();
    useStore.getState().setViewPly(3);
    game2GoesLive();
    await vi.advanceTimersByTimeAsync(3 * MINUTE);
    expect(useStore.getState().nextUp?.roundId).toBe(R2);
    expect(useStore.getState().roundId).toBe(R1);

    useStore.getState().setViewPly(null);
    await vi.advanceTimersByTimeAsync((AUTO_SWITCH_SEC - 4) * 1000);
    expect(useStore.getState().roundId).toBe(R1);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(useStore.getState().roundId).toBe(R2);
  });

  it('never leaves a game that is still being played', async () => {
    world.rounds = [round(R1, 1, T0 - HOUR, { ongoing: true }), round(R2, 2, T0 + 23 * HOUR)];
    world.defaultRoundId = R1;
    const { useStore } = await boot();
    push(R1, game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 6) }));
    // a feed glitch flags the next round early
    world.rounds = [round(R1, 1, T0 - HOUR), round(R2, 2, T0 + 23 * HOUR, { ongoing: true })];
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(useStore.getState().roundId).toBe(R1);
  });

  it('choosing an older game by hand turns following off; choosing the live one turns it back on', async () => {
    world.rounds = [round(R1, 1, T0 - 23 * HOUR, { finished: true }), round(R2, 2, T0 - HOUR, { ongoing: true })];
    const { useStore } = await boot();
    useStore.getState().selectRound(R1);
    expect(useStore.getState().followLatest).toBe(false);
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(useStore.getState().roundId).toBe(R1);
    useStore.getState().selectRound(R2);
    expect(useStore.getState().followLatest).toBe(true);
  });
});

describe('tie-break days: several games in one round', () => {
  const tb = (g1: { n: number; result?: string }, g2: { n: number; result?: string }) =>
    game({ round: 15, id: 'tb1', sans: ITALIAN.slice(0, g1.n), result: g1.result }) +
    game({ round: 15, id: 'tb2', whiteIsSindarov: false, sans: QGD.slice(0, g2.n), result: g2.result });

  beforeEach(() => {
    world.rounds = [round(R1, 15, T0 - HOUR, { ongoing: true })];
    world.defaultRoundId = R1;
  });

  it('opens the game in progress, not the first one', async () => {
    const { useStore } = await boot();
    push(R1, tb({ n: 10, result: '1/2-1/2' }, { n: 4 }));
    expect(useStore.getState().gameId).toBe('tb2');
  });

  it('opens the first game when none has started, and the last played one when all are over', async () => {
    const a = await boot();
    push(R1, tb({ n: 0 }, { n: 0 }));
    expect(a.useStore.getState().gameId).toBe('tb1');

    const b = await boot();
    push(R1, tb({ n: 10, result: '1-0' }, { n: 8, result: '0-1' }));
    expect(b.useStore.getState().gameId).toBe('tb2');
  });

  it('moves on when a game is over and the next one has started', async () => {
    const { useStore } = await boot();
    push(R1, tb({ n: 6 }, { n: 0 }));
    expect(useStore.getState().gameId).toBe('tb1');

    push(R1, tb({ n: 10, result: '1/2-1/2' }, { n: 0 }));
    expect(useStore.getState().gameId).toBe('tb1'); // result stays on screen until the next game starts
    expect(useStore.getState().resultVisible).toBe(true);

    push(R1, tb({ n: 10, result: '1/2-1/2' }, { n: 1 }));
    expect(useStore.getState().gameId).toBe('tb2');
    expect(useStore.getState().revealed).toBe(1);
    expect(useStore.getState().resultVisible).toBe(false);
  });

  it('does not move on while the viewer is paused, so nothing is given away', async () => {
    const { useStore } = await boot();
    push(R1, tb({ n: 6 }, { n: 0 }));
    useStore.getState().pause();
    push(R1, tb({ n: 10, result: '1-0' }, { n: 3 }));
    expect(useStore.getState().gameId).toBe('tb1');
    expect(useStore.getState().revealed).toBe(6);
    expect(useStore.getState().resultVisible).toBe(false);
  });

  it('does not move on while the viewer is browsing earlier moves', async () => {
    const { useStore } = await boot();
    push(R1, tb({ n: 10, result: '1-0' }, { n: 0 }));
    useStore.getState().setViewPly(4);
    push(R1, tb({ n: 10, result: '1-0' }, { n: 2 }));
    expect(useStore.getState().gameId).toBe('tb1');
  });

  it('does not move on after the viewer picked a board by hand', async () => {
    const { useStore } = await boot();
    push(R1, tb({ n: 10, result: '1-0' }, { n: 2 }));
    expect(useStore.getState().gameId).toBe('tb2');
    useStore.getState().selectGame('tb1');
    push(R1, tb({ n: 10, result: '1-0' }, { n: 3 }));
    expect(useStore.getState().gameId).toBe('tb1');
  });

  it('counts only the scheduled classical games in the match score', async () => {
    world.rounds = [round(R1, 1, T0 - 50 * HOUR, { finished: true }), round(R2, 15, T0 - HOUR, { ongoing: true })];
    world.tournamentPgn = game({ round: 1, id: 'g1', sans: ITALIAN, result: '1-0' }) + game({ round: 15, id: 'tb1', sans: QGD, result: '1-0' });
    const { useStore, selectScore } = await boot();
    await vi.advanceTimersByTimeAsync(0);
    expect(selectScore(useStore.getState())).toMatchObject({ bPoints: 1, played: 1 });
  });
});
