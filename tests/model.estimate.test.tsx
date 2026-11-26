import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, game, HOUR, ITALIAN, push, QGD, R1, R2, R3, resetWorld, round, world } from './helpers';

const T0 = Date.UTC(2026, 10, 25, 15, 0, 0);
const GUKESH = '46616543';
const SINDAROV = '14205483';
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  resetWorld();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const finished = (n: number, result: string, whiteIsSindarov = true) => game({ round: n, id: `g${n}`, sans: QGD, result, whiteIsSindarov });

describe('the match situation the estimate may use', () => {
  it('is the score before the open game, from earlier games only', async () => {
    world.rounds = [round(R1, 1, T0 - 49 * HOUR, { finished: true }), round(R2, 2, T0 - 25 * HOUR, { finished: true }), round(R3, 3, T0 - HOUR, { ongoing: true })];
    world.defaultRoundId = R3;
    // game 1: Sindarov (White) wins. Game 2: Gukesh (White) and Sindarov draw.
    world.tournamentPgn = finished(1, '1-0') + finished(2, '1/2-1/2', false);
    const { useStore, selectStakes } = await boot();
    push(R3, game({ round: 3, id: 'g3', sans: ITALIAN.slice(0, 4) }));
    expect(selectStakes(useStore.getState())).toEqual({ points: { [SINDAROV]: 1.5, [GUKESH]: 0.5 }, gamesLeft: 12 });
  });

  it('never includes the open game or later ones, also when they are over and the viewer is paused', async () => {
    world.rounds = [round(R1, 1, T0 - 49 * HOUR, { finished: true }), round(R2, 2, T0 - 25 * HOUR, { finished: true }), round(R3, 3, T0 - HOUR, { finished: true })];
    world.defaultRoundId = R1;
    world.tournamentPgn = finished(1, '1-0') + finished(2, '0-1', false) + finished(3, '1-0');
    const { useStore, selectStakes } = await boot();
    const s = () => useStore.getState();

    // replaying game 2 without spoilers: only game 1 counts, although games 2 and 3 are known to be decided
    s().selectRound(R2);
    push(R2, finished(2, '0-1', false));
    s().restart();
    expect(s().paused).toBe(true);
    expect(selectStakes(s())).toEqual({ points: { [SINDAROV]: 1, [GUKESH]: 0 }, gamesLeft: 13 });
    // the same once the game has been watched to its end: its own result still does not count for its own moves
    s().resume();
    expect(s().resultVisible).toBe(true);
    expect(selectStakes(s())).toEqual({ points: { [SINDAROV]: 1, [GUKESH]: 0 }, gamesLeft: 13 });

    // the first game of the match starts from nothing
    s().selectRound(R1);
    expect(selectStakes(s())).toEqual({ points: {}, gamesLeft: 14 });
  });

  it('does not exist outside the scheduled games', async () => {
    world.rounds = [round(R1, 15, T0 - HOUR, { ongoing: true })];
    const { useStore, selectStakes } = await boot();
    expect(selectStakes(useStore.getState())).toBeDefined(); // the first listed round counts as game 1 here
    useStore.setState({ rounds: [], roundId: undefined });
    expect(selectStakes(useStore.getState())).toBeUndefined();
  });
});

/** The estimate as the prediction tab mounts it. */
const mount = async (pgn: string) => {
  world.rounds = [round(R1, 1, T0 - HOUR, { ongoing: true })];
  world.defaultRoundId = R1;
  const mod = await boot();
  push(R1, pgn);
  const { ModelEstimate } = await import('../src/components/ModelEstimate');
  const Host = () => {
    const g = mod.useStore(mod.selectGameData);
    const fen = mod.useStore(mod.selectGuessFen);
    return g && fen ? <ModelEstimate game={g} fen={fen} /> : null;
  };
  await act(() => root.render(<Host />));
  return mod;
};
const rows = () => [...host.querySelectorAll('.model-moves li')];
/** The whole numbers of the rows. A row printed as "<1 %" carries none: it counts as 0 here. */
const percents = () =>
  rows().map(li => {
    const shown = li.querySelector('.num')!.textContent!;
    return shown.startsWith('<') ? 0 : Number(shown.replace(/\D/g, ''));
  });
const text = () => host.textContent ?? '';

describe('the estimate under the board', () => {
  it('shows three legal moves and the rest as "other", adding up to 100', async () => {
    await mount(game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 4) }));
    expect(rows()).toHaveLength(4);
    expect(rows()[3].textContent).toContain('Diğer hamleler');
    expect(percents().reduce((a, b) => a + b, 0)).toBe(100);
    expect(percents()[3]).toBeGreaterThan(0);
    expect(text()).not.toContain('Deneysel');
    expect(text()).toMatch(/Sindarov için, 3\. hamle/);
  });

  it('prints a legal move with a share under one percent as "<1 %", never as 0', async () => {
    // Black's first move after 1. d4: two replies take nearly everything in the players' own games
    await mount(game({ round: 1, id: 'g1', sans: ['d4'] }));
    expect(text()).toMatch(/Gukesh için, 1… hamle/);
    const shown = rows().map(li => li.querySelector('.num')!.textContent);
    expect(shown).toHaveLength(4);
    expect(shown[2]).toBe('<1 %');
    for (const value of shown) expect(value).not.toBe('0 %');
    // the rows that carry a number still add up to 100
    expect(percents().reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('follows the game: a new move gives a new estimate for the other player', async () => {
    await mount(game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 4) }));
    const before = rows().map(li => li.textContent);
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 5) })));
    expect(text()).toMatch(/Gukesh için, 3… hamle/);
    expect(rows().map(li => li.textContent)).not.toEqual(before);
    expect(percents().reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('is shown at once in guess mode too: it never waits for the viewer to guess', async () => {
    const mod = await mount(game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 4) }));
    await act(async () => mod.useStore.getState().setSetting('guessMode', true));
    expect(rows()).toHaveLength(4);
    expect(text()).not.toContain('sen tahminini yaptıktan sonra görünür');
    expect(host.querySelectorAll('.model-estimate button')).toHaveLength(0);
    // a new move: the estimate for it is there straight away, before any guess
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 5) })));
    expect(rows()).toHaveLength(4);
    expect(text()).toMatch(/Gukesh için, 3… hamle/);
    // and showing it made no guess for the viewer
    expect(mod.useStore.getState().guess).toBeNull();
  });

  it('shows nothing at all once the game is over', async () => {
    await mount(game({ round: 1, id: 'g1', sans: ITALIAN, result: '1/2-1/2' }));
    expect(host.querySelector('.model-estimate')).toBeNull();
    expect(text()).toBe('');
  });

  it('shows nothing for a player it was not made for', async () => {
    const other = game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 4) }).replace('14205483', '1503014').replace('46616543', '2016192');
    await mount(other);
    expect(host.querySelector('.model-estimate')).toBeNull();
    expect(text()).toBe('');
  });

  it('while paused it estimates the move after the paused position, not the one being played', async () => {
    const mod = await mount(game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 2) }));
    await act(async () => mod.useStore.getState().pause());
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 7) })));
    expect(mod.useStore.getState().revealed).toBe(2);
    expect(text()).toMatch(/Sindarov için, 2\. hamle/);
  });

  it('reads what the player did in the earlier games of this match, and nothing of the open or later ones', async () => {
    // game 1: Sindarov, with White, opened 1. c4, which he does not usually play. Game 3 is his next White.
    const share = async (firstGame: string[]) => {
      resetWorld();
      world.rounds = [round(R1, 1, T0 - 49 * HOUR, { finished: true }), round(R2, 2, T0 - 25 * HOUR, { finished: true }), round(R3, 3, T0 - HOUR, { ongoing: true })];
      world.defaultRoundId = R3;
      world.tournamentPgn = game({ round: 1, id: 'g1', sans: firstGame, result: '1/2-1/2' }) + game({ round: 2, id: 'g2', sans: ['d4', 'd5'], result: '1/2-1/2', whiteIsSindarov: false });
      const mod = await boot();
      push(R3, game({ round: 3, id: 'g3', sans: [] }));
      const { ModelEstimate } = await import('../src/components/ModelEstimate');
      const Host = () => {
        const g = mod.useStore(mod.selectGameData);
        const fen = mod.useStore(mod.selectGuessFen);
        return g && fen ? <ModelEstimate game={g} fen={fen} /> : null;
      };
      await act(() => root.render(<Host />));
      expect(text()).toMatch(/Sindarov için, 1\. hamle/);
      const c4 = rows().find(li => li.querySelector('strong')?.textContent === 'c4');
      const shown = c4 ? Number(c4.querySelector('.num')!.textContent!.replace(/\D/g, '')) : 0;
      await act(() => root.render(<></>));
      return shown;
    };
    const after = await share(['c4', 'e5']);
    const before = await share(['e4', 'e5']);
    // his c4 of game 1 counts; Gukesh's 1. d4 of game 2 is not Sindarov's move and changes nothing for him
    expect(after).toBeGreaterThan(before + 5);
    expect(after).toBeGreaterThanOrEqual(10);
  });

  it('is a title and a list, with no label and no explanation', async () => {
    await mount(game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 4) }));
    const card = host.querySelector('.model-estimate')!;
    expect(card.querySelector('h3')!.textContent).toContain('Model tahmini');
    expect(card.querySelector('.tag')).toBeNull();
    expect(card.textContent).not.toContain('Deneysel');
    expect(card.querySelector('details')).toBeNull();
    expect(card.querySelector('a')).toBeNull();
    expect(card.querySelector('p')).toBeNull();
    expect(card.textContent).not.toContain('Nasıl hesaplanıyor');
    expect(card.textContent).not.toContain('Ölçüm');
  });
});
