import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, game, HOUR, ITALIAN, push, QGD, R1, R2, resetWorld, round, world } from './helpers';

const T0 = Date.UTC(2026, 10, 25, 13, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  localStorage.clear();
  resetWorld();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('when the position on the board can be linked', () => {
  it('a round with one game can be shared', async () => {
    world.rounds = [round(R1, 1, T0 - HOUR, { ongoing: true })];
    world.defaultRoundId = R1;
    const { useStore, canSharePosition } = await boot();
    expect(canSharePosition(useStore.getState())).toBe(false); // nothing known about the round yet
    push(R1, game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 6) }));
    expect(canSharePosition(useStore.getState())).toBe(true);
  });

  it('a round with several boards cannot: the link would not say which board', async () => {
    world.rounds = [round(R1, 15, T0 - HOUR, { ongoing: true })];
    world.defaultRoundId = R1;
    const { useStore, canSharePosition } = await boot();
    push(R1, game({ round: 15, id: 'tb1', sans: ITALIAN.slice(0, 10), result: '1/2-1/2' }) + game({ round: 15, id: 'tb2', whiteIsSindarov: false, sans: QGD.slice(0, 4) }));
    expect(Object.keys(useStore.getState().games)).toHaveLength(2);
    expect(canSharePosition(useStore.getState())).toBe(false);

    // picking the other board by hand does not bring the action back
    useStore.getState().selectGame('tb1');
    expect(useStore.getState().gameId).toBe('tb1');
    expect(canSharePosition(useStore.getState())).toBe(false);
  });

  it('stops being shareable the moment a second board appears in the round', async () => {
    world.rounds = [round(R1, 15, T0 - HOUR, { ongoing: true })];
    world.defaultRoundId = R1;
    const { useStore, canSharePosition } = await boot();
    push(R1, game({ round: 15, id: 'tb1', sans: ITALIAN.slice(0, 10) }));
    expect(canSharePosition(useStore.getState())).toBe(true);
    push(R1, game({ round: 15, id: 'tb1', sans: ITALIAN.slice(0, 10), result: '1-0' }) + game({ round: 15, id: 'tb2', whiteIsSindarov: false, sans: [] }));
    expect(canSharePosition(useStore.getState())).toBe(false);
  });

  it('is shareable again in the next round when that one has a single game', async () => {
    world.rounds = [round(R1, 1, T0 - 25 * HOUR, { finished: true }), round(R2, 2, T0 - HOUR, { ongoing: true })];
    world.defaultRoundId = R2;
    const { useStore, canSharePosition } = await boot();
    push(R2, game({ round: 2, id: 'g2', whiteIsSindarov: false, sans: QGD.slice(0, 4) }));
    expect(canSharePosition(useStore.getState())).toBe(true);
    useStore.getState().selectRound(R1);
    expect(canSharePosition(useStore.getState())).toBe(false); // the other round is open but not loaded yet
    push(R1, game({ round: 1, id: 'g1', sans: ITALIAN, result: '1/2-1/2' }));
    expect(canSharePosition(useStore.getState())).toBe(true);
  });
});
