import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, game, HOUR, ITALIAN, push, QGD, R1, R2, R3, resetWorld, round, world } from './helpers';

const T0 = Date.UTC(2026, 10, 25, 15, 0, 0);
let host: HTMLDivElement;
let root: Root;
const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  resetWorld();
  world.rounds = [round(R1, 1, T0 - HOUR, { ongoing: true })];
  world.defaultRoundId = R1;
  // jsdom lays nothing out; give every element a width so a chart has room to draw
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 280 });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  if (width) Object.defineProperty(HTMLElement.prototype, 'clientWidth', width);
  vi.useRealTimers();
});

/** The time panel as the app mounts it: one instance that follows the open game. */
const mountTime = async () => {
  const mod = await boot();
  const { TimePanel } = await import('../src/components/TimePanel');
  const Host = () => {
    const g = mod.useStore(mod.selectGameData);
    const shown = mod.useStore(mod.selectShownPly);
    return g ? <TimePanel game={g} shown={shown} /> : null;
  };
  await act(() => root.render(<Host />));
  return mod;
};
const bars = () => host.querySelectorAll('.time-chart svg .bar');
const text = () => host.textContent ?? '';

describe('time per move', () => {
  it('draws the chart when the first timed move arrives in a game that had none', async () => {
    await mountTime();
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: [] })));
    expect(host.querySelector('.time-chart svg')).toBeNull();
    expect(text()).toContain('Henüz hamle yok.');

    // the same panel, still mounted, when the game starts
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 1) })));
    expect(host.querySelector('.time-chart svg')).not.toBeNull();
    expect(bars()).toHaveLength(1);

    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 6) })));
    expect(bars()).toHaveLength(6);
    expect(host.querySelectorAll('.time-chart svg .bar.a, .time-chart svg .bar.b')).toHaveLength(6);
  });

  it('names both players, their longest think and a scale', async () => {
    await mountTime();
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 6) })));
    expect(text()).toContain('Sindarov');
    expect(text()).toContain('Gukesh');
    expect(text()).toContain('En uzun düşünme');
    // the helper's clocks: each move after the first takes 20 seconds of its player's time
    expect([...host.querySelectorAll('.think b')].map(b => b.textContent)).toEqual(['20 sn', '20 sn']);
    expect(text()).toMatch(/1 dk/); // the scale under the chart
    expect(host.querySelector('.time-chart svg')?.getAttribute('aria-label')).toMatch(/Hamle başına düşünme süresi\. .*20 sn/);
  });

  it('marks the move on the board', async () => {
    const mod = await mountTime();
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 6) })));
    expect(host.querySelectorAll('.bar.here')).toHaveLength(1);
    await act(async () => mod.useStore.getState().setViewPly(2));
    expect(host.querySelectorAll('.bar.here')).toHaveLength(1);
    expect(host.querySelector('.band')).not.toBeNull();
  });

  it('says so when the time control cannot be read, and draws nothing', async () => {
    await mountTime();
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 4) }).replace('40/7200:20/3600:900+30', 'Classical')));
    expect(bars()).toHaveLength(0);
    expect(host.querySelector('.time-chart svg')).toBeNull();
    expect(text()).toContain('Bu oyun için saat bilgisi yok.');
  });

  it('gives a move without a reading a hollow mark and counts it, never a bar', async () => {
    await mountTime();
    // the third half-move comes without a clock reading
    const pgn = game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 6) }).replace(' { [%clk 1:59:30] }', '');
    await act(async () => push(R1, pgn));
    // White's second and third move are unknown: one has no reading, the next has nothing to compare with
    expect(bars()).toHaveLength(4);
    expect(host.querySelectorAll('.time-chart svg .unknown')).toHaveLength(2);
    expect(text()).toContain('2 hamlenin süresi bilinmiyor');
    for (const bar of bars()) expect(Number(bar.getAttribute('width'))).toBeGreaterThan(0);
  });
});

describe('the games of the match as rows', () => {
  const g1 = () => game({ round: 1, id: 'g1', sans: QGD, result: '1/2-1/2' });
  const g2 = (result = '1-0') => game({ round: 2, id: 'g2', whiteIsSindarov: false, sans: ITALIAN, result });

  it('tells played, live and coming games apart, and who won', async () => {
    world.rounds = [round(R1, 1, T0 - 49 * HOUR, { finished: true }), round(R2, 2, T0 - 25 * HOUR, { finished: true }), round(R3, 3, T0 - HOUR, { ongoing: true })];
    world.defaultRoundId = R3;
    world.tournamentPgn = g1() + g2();
    const { useStore, selectGameRows } = await boot();
    push(R3, game({ round: 3, id: 'g3', sans: ITALIAN.slice(0, 5) }));
    const rows = selectGameRows(useStore.getState());
    expect(rows.map(r => r.status)).toEqual(['done', 'done', 'live']);
    expect(rows.map(r => r.result)).toEqual(['1/2-1/2', '1-0', '*']);
    // game 2 was won by its White player, Gukesh, who is the left side of the score
    expect(rows[1].winner).toBe('a');
    expect(rows[0].winner).toBeUndefined();
    expect(rows[2]).toMatchObject({ current: true, move: 3, several: false });
  });

  it('keeps later results out of sight while the viewer is paused', async () => {
    world.rounds = [round(R1, 1, T0 - 25 * HOUR, { finished: true }), round(R2, 2, T0 - HOUR, { finished: true }), round(R3, 3, T0 + 23 * HOUR)];
    world.defaultRoundId = R1;
    world.tournamentPgn = g1() + g2('0-1');
    const { useStore, selectGameRows } = await boot();
    const s = () => useStore.getState();
    s().selectRound(R1);
    push(R1, g1());
    s().restart(); // replay game 1 without spoilers
    const rows = selectGameRows(s());
    expect(rows[0]).toMatchObject({ current: true, status: 'paused', result: '*' });
    expect(rows[1]).toMatchObject({ status: 'hidden', result: '*', winner: undefined });
    expect(rows[2].status).toBe('ahead');
  });

  it('a day with several boards has no single result', async () => {
    world.rounds = [round(R1, 15, T0 - HOUR, { ongoing: true })];
    const { useStore, selectGameRows } = await boot();
    push(R1, game({ round: 15, id: 'tb1', sans: ITALIAN, result: '1-0' }) + game({ round: 15, id: 'tb2', whiteIsSindarov: false, sans: QGD.slice(0, 2) }));
    const row = selectGameRows(useStore.getState())[0];
    expect(row).toMatchObject({ several: true, result: '*', winner: undefined });
  });
});

describe('choosing a move from a list', () => {
  it('lists the legal moves by piece and reports the one picked, moving nothing', async () => {
    await boot();
    const { MoveChooser } = await import('../src/components/MoveEntry');
    const picked: string[] = [];
    // after 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5: White may castle
    const fen = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    await act(() => root.render(<MoveChooser fen={fen} onMove={m => picked.push(m.uci)} />));
    const groups = [...host.querySelectorAll('.move-group')].map(g => g.getAttribute('aria-label'));
    expect(groups).toEqual(['Piyon', 'At', 'Fil', 'Kale', 'Vezir', 'Şah']);
    const chips = [...host.querySelectorAll<HTMLButtonElement>('.chip')];
    const labels = chips.map(c => c.textContent);
    expect(labels).toContain('O-O');
    expect(labels).toContain('Ac3'); // Turkish notation: A is the knight
    expect(new Set(labels).size).toBe(labels.length);
    await act(async () => chips.find(c => c.textContent === 'O-O')!.click());
    expect(picked).toHaveLength(1);
    expect(picked[0]).toMatch(/^e1[gh]1$/);
  });
});
