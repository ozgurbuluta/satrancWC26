import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, game, HOUR, ITALIAN, push, QGD, R1, R2, resetWorld, round, world } from './helpers';

const T0 = Date.UTC(2026, 10, 24, 15, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  localStorage.clear();
  resetWorld();
  world.rounds = [round(R1, 1, T0 - HOUR, { ongoing: true }), round(R2, 2, T0 + 23 * HOUR)];
  world.defaultRoundId = R1;
});

afterEach(() => {
  vi.useRealTimers();
});

const live = (n: number, result = '*') => game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, n), result });

describe('spoiler-free pause', () => {
  it('hides moves that arrive after the pause, and the result', async () => {
    const { useStore } = await boot();
    push(R1, live(6));
    expect(useStore.getState().revealed).toBe(6);

    useStore.getState().pause();
    push(R1, live(8));
    expect(useStore.getState().paused).toBe(true);
    expect(useStore.getState().revealed).toBe(6);

    push(R1, live(10, '1-0'));
    expect(useStore.getState().revealed).toBe(6);
    expect(useStore.getState().resultVisible).toBe(false);
  });

  it('does not let a paused viewer step or jump past the pause point', async () => {
    const { useStore, selectShownPly } = await boot();
    push(R1, live(6));
    useStore.getState().pause();
    push(R1, live(10, '1-0'));

    useStore.getState().setViewPly(9);
    expect(selectShownPly(useStore.getState())).toBe(6);
    useStore.getState().setViewPly(3);
    expect(selectShownPly(useStore.getState())).toBe(3);
    // stepping forward from an earlier move only walks through moves already seen
    useStore.getState().step(1);
    expect(selectShownPly(useStore.getState())).toBe(4);
    expect(useStore.getState().revealed).toBe(6);
  });

  it('reveals one move at a time, then returns to live and shows the result once caught up', async () => {
    const { useStore } = await boot();
    push(R1, live(6));
    useStore.getState().pause();
    push(R1, live(8, '1/2-1/2'));

    useStore.getState().revealNext();
    expect(useStore.getState().revealed).toBe(7);
    expect(useStore.getState().paused).toBe(true);
    expect(useStore.getState().resultVisible).toBe(false);

    useStore.getState().revealNext();
    expect(useStore.getState().revealed).toBe(8);
    expect(useStore.getState().paused).toBe(false);
    expect(useStore.getState().resultVisible).toBe(true);
  });

  it('replays from the start and walks forward with the arrow key action', async () => {
    const { useStore } = await boot();
    push(R1, live(6));
    useStore.getState().restart();
    expect(useStore.getState().revealed).toBe(0);
    useStore.getState().step(1);
    useStore.getState().step(1);
    expect(useStore.getState().revealed).toBe(2);
  });

  it('auto-play reveals moves on its interval and stops when it catches up', async () => {
    const { useStore } = await boot();
    push(R1, live(6));
    useStore.getState().restart();
    useStore.getState().setAutoplay(1500);
    await vi.advanceTimersByTimeAsync(1500 * 3);
    expect(useStore.getState().revealed).toBe(3);
    await vi.advanceTimersByTimeAsync(1500 * 10);
    expect(useStore.getState().revealed).toBe(6);
    expect(useStore.getState().paused).toBe(false);
    expect(useStore.getState().autoplayMs).toBe(0);
  });

  it('keeps the match score and later games hidden while paused', async () => {
    world.rounds = [round(R1, 1, T0 - 30 * HOUR, { finished: true }), round(R2, 2, T0 - 6 * HOUR, { finished: true })];
    world.tournamentPgn =
      game({ round: 1, id: 'g1', sans: ITALIAN, result: '1-0' }) + game({ round: 2, id: 'g2', whiteIsSindarov: false, sans: QGD, result: '0-1' });
    const { useStore, selectScore, visibleResult } = await boot();
    useStore.getState().selectRound(R1);
    push(R1, game({ round: 1, id: 'g1', sans: ITALIAN, result: '1-0' }));
    await vi.advanceTimersByTimeAsync(0);

    // watching normally: both results count (Sindarov won both)
    expect(selectScore(useStore.getState())).toMatchObject({ aPoints: 0, bPoints: 2 });

    useStore.getState().restart();
    const s = useStore.getState();
    expect(s.resultVisible).toBe(false);
    expect(s.matchGames.map(mg => visibleResult(s, mg))).toEqual(['*', '*']);
    expect(selectScore(s)).toMatchObject({ aPoints: 0, bPoints: 0, played: 0 });
  });

  it('survives a reload: the stored pause is applied before anything is shown', async () => {
    const first = await boot();
    push(R1, live(6));
    first.useStore.getState().pause();
    push(R1, live(9));

    // "reload": fresh modules, same browser storage, and the feed replays the whole game
    const second = await boot();
    const seenWhileLoading: number[] = [];
    second.useStore.subscribe(s => seenWhileLoading.push(s.revealed));
    push(R1, live(10, '0-1'));
    expect(second.useStore.getState().paused).toBe(true);
    expect(second.useStore.getState().revealed).toBe(6);
    expect(second.useStore.getState().resultVisible).toBe(false);
    expect(Math.max(...seenWhileLoading)).toBe(6);
  });

  it('spoiler shield opens a game paused at the last move this browser saw', async () => {
    const first = await boot();
    push(R1, live(4));
    expect(first.useStore.getState().revealed).toBe(4);

    localStorage.setItem('wcc26:settings', JSON.stringify({ spoilerShield: true }));
    const second = await boot();
    push(R1, live(10, '1-0'));
    expect(second.useStore.getState().paused).toBe(true);
    expect(second.useStore.getState().revealed).toBe(4);
    expect(second.useStore.getState().resultVisible).toBe(false);
  });

  it('spoiler shield opens a game never seen before at the starting position', async () => {
    localStorage.setItem('wcc26:settings', JSON.stringify({ spoilerShield: true }));
    const { useStore } = await boot();
    push(R1, live(10, '1-0'));
    expect(useStore.getState().paused).toBe(true);
    expect(useStore.getState().revealed).toBe(0);
  });
});

describe('board sync delay', () => {
  it('clears the retired saved delay without changing other preferences', async () => {
    localStorage.setItem('wcc26:settings', JSON.stringify({ delaySec: 45, sound: false, notation: 'en' }));
    const { useStore } = await boot();
    expect(useStore.getState().settings).toMatchObject({ delaySec: 0, sound: false, notation: 'en' });
    push(R1, live(4));
    push(R1, live(5));
    expect(useStore.getState().revealed).toBe(5);
  });

  it('holds a new move back by the chosen number of seconds', async () => {
    const { useStore } = await boot();
    push(R1, live(4));
    useStore.getState().setSetting('delaySec', 20);
    push(R1, live(5));
    expect(useStore.getState().revealed).toBe(4);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(useStore.getState().revealed).toBe(4);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(useStore.getState().revealed).toBe(5);
  });

  it('holds the result back as well', async () => {
    const { useStore } = await boot();
    push(R1, live(4));
    useStore.getState().setSetting('delaySec', 20);
    push(R1, live(4, '1/2-1/2'));
    expect(useStore.getState().resultVisible).toBe(false);
    await vi.advanceTimersByTimeAsync(21_000);
    expect(useStore.getState().resultVisible).toBe(true);
  });
});
