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
  vi.unstubAllGlobals();
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

  it('gives a move without a reading a hollow mark without the removed explanation', async () => {
    await mountTime();
    // the third half-move comes without a clock reading
    const pgn = game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 6) }).replace(' { [%clk 1:59:30] }', '');
    await act(async () => push(R1, pgn));
    // White's second and third move are unknown: one has no reading, the next has nothing to compare with
    expect(bars()).toHaveLength(4);
    expect(host.querySelectorAll('.time-chart svg .unknown')).toHaveLength(2);
    expect(text()).not.toContain('hamlenin süresi bilinmiyor');
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

describe('the status under the board', () => {
  it('shows the scheduled date until moves arrive, then live, paused and finished honestly', async () => {
    const start = T0 + 24 * HOUR;
    world.rounds = [round(R1, 1, start)];
    const mod = await boot();
    const { MoveStrip } = await import('../src/components/MoveStrip');
    const Host = () => {
      const g = mod.useStore(mod.selectGameData);
      const shown = mod.useStore(mod.selectShownPly);
      return g ? <MoveStrip game={g} shown={shown} line={null} ownMoves={[]} backLabel="Oyundaki konuma dön" atNewest /> : null;
    };
    await act(() => root.render(<Host />));
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: [] })));
    const status = () => host.querySelector('[role="status"]')!;
    expect(status().querySelector('time')?.getAttribute('dateTime')).toBe(new Date(start).toISOString());
    expect(status().textContent).toContain('26 Kas');
    expect(status().textContent).not.toMatch(/Canlı|Bitti/i);
    expect(status().querySelector('.pulse')).toBeNull();

    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: ITALIAN })));
    expect(status().textContent).toBe('Canlı');
    expect(status().querySelector('.pulse')).not.toBeNull();
    await act(async () => mod.useStore.getState().pause());
    expect(status().textContent).toBe('Duraklatıldı');
    await act(async () => mod.useStore.getState().resume());
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: ITALIAN, result: '1/2-1/2' })));
    expect(status().textContent).toBe('Bitti');
    expect(status().querySelector('.pulse')).toBeNull();
  });
});

describe('the win chance card', () => {
  it('does not give a winning side 100 %: it shows how such positions ended', async () => {
    const mod = await boot();
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: [] })));
    const { WinChance } = await import('../src/components/EnginePanel');
    const g = mod.selectGameData(mod.useStore.getState())!;
    // Black (Gukesh in this game) is four and a half pawns up
    const evaluation = { fen: g.initialFen, depth: 24, source: 'local' as const, pvs: [{ cp: -456, moves: ['e2e4'] }] };
    await act(() => root.render(<WinChance game={g} evaluation={evaluation} />));
    const numbers = [...host.querySelectorAll('.wc b')].map(b => b.textContent);
    expect(numbers).toEqual(['1%', '6%', '93%']);
    expect(host.textContent).not.toContain('100');
    expect(host.querySelector('.wdl-bar')!.getAttribute('aria-label')).toBe('Sindarov 1%, Berabere 6%, Gukesh 93%');
    expect(host.textContent).toContain('Benzer değerlendirmeli üst düzey oyunların sonuçlarına göre');
  });
});

describe('what the engine card says about the choice of move', () => {
  const card = async (cps: number[]) => {
    const mod = await boot();
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: [] })));
    const { EngineCard } = await import('../src/components/EnginePanel');
    const g = mod.selectGameData(mod.useStore.getState())!;
    const evaluation = { fen: g.initialFen, depth: 20, source: 'cloud' as const, pvs: ['e2e4', 'd2d4', 'g1f3'].slice(0, cps.length).map((move, i) => ({ cp: cps[i], moves: [move] })) };
    await act(() => root.render(<EngineCard game={g} fen={g.initialFen} shown={0} evaluation={evaluation} inLine={false} />));
    return host.querySelector('.engine-card .note')?.textContent ?? '';
  };

  it('is called Stockfish, marked as a name so that capitals do not change its letters', async () => {
    await card([20, 18, 15]);
    const title = host.querySelector('.engine-card h2')!;
    expect(title.textContent).toBe('Stockfish');
    expect(title.getAttribute('lang')).toBe('en');
    expect(host.querySelector('.engine-card')!.getAttribute('aria-label')).toBe('Stockfish');
  });

  it('says nothing where every line is good', async () => {
    expect(await card([20, 18, 15])).toBe('');
    expect(host.textContent).not.toContain('Sakin');
    expect(host.textContent).not.toContain('birkaç iyi hamle');
  });

  it('names the only good move and what the next one would be', async () => {
    // the second line gives away more than a fifth of the winning chances: a mistake
    expect(await card([150, 20, 10])).toBe('Tek hamleSindarov için e4. d4 hata olur.');
    expect(host.querySelector('.engine-card .note .q')!.className).toContain('q-critical');
  });

  it('says so when the best move is ahead by an inaccuracy only', async () => {
    expect(await card([90, 30, 20])).toBe('En iyisie4. d4 yanlışlık olur.');
  });

  it('names both when two moves are good and the third is not', async () => {
    expect(await card([200, 195, 20])).toBe('İki hamlee4 ve d4 aynı değerde. Af3 büyük hata olur.');
  });

  it('has nothing to compare with a single line', async () => {
    expect(await card([150])).toBe('');
  });

  it('says who is winning, by name, in place of anything about the choice', async () => {
    // White (Sindarov here) to move and far ahead, with several moves that keep it
    expect(await card([456, 365, 298])).toBe('Sindarov kazanıyor.');
    expect(host.textContent).not.toContain('yanlışlık');
    expect(host.textContent).not.toContain('Sakin');
  });

  it('names the winner when it is the other side that is to move', async () => {
    expect(await card([-456, -500, -600])).toBe('Gukesh kazanıyor.');
  });

  it('adds the move when only one keeps the win', async () => {
    expect(await card([456, 100, 50])).toBe('Sindarov kazanıyor. Kazancı yalnızca e4 koruyor.');
  });
});

describe('engine line preference', () => {
  it('offers one to five lines, remembers the choice and displays two-decimal scores', async () => {
    const mod = await boot();
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: [] })));
    const { EngineCard } = await import('../src/components/EnginePanel');
    const g = mod.selectGameData(mod.useStore.getState())!;
    const evaluation = { fen: g.initialFen, depth: 20, source: 'cloud' as const,
      pvs: ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'b1c3'].map((move, i) => ({ cp: 24 - i, moves: [move] })) };
    await act(() => root.render(<EngineCard game={g} fen={g.initialFen} shown={0} evaluation={evaluation} inLine={false} />));
    const select = host.querySelector('select')!;
    expect([...select.options].map(o => o.value)).toEqual(['1', '2', '3', '4', '5']);
    expect(select.closest('label')!.textContent).toContain('Varyant sayısı');
    expect(host.querySelectorAll('.pv-list li')).toHaveLength(3);
    await act(() => { select.value = '5'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.querySelectorAll('.pv-list li')).toHaveLength(5);
    expect([...host.querySelectorAll('.pv-eval')].map(e => e.textContent)).toEqual(['+0.24', '+0.23', '+0.22', '+0.21', '+0.20']);
    expect(JSON.parse(localStorage.getItem('wcc26:settings')!).engineLines).toBe(5);
    await act(() => { select.value = '1'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.querySelectorAll('.pv-list li')).toHaveLength(1);
  });
});

describe('the broadcast panel', () => {
  const mountStream = async () => {
    const mod = await boot();
    const { StreamPanel } = await import('../src/components/StreamPanel');
    await act(() => root.render(<StreamPanel />));
    return mod;
  };
  const options = () => [...host.querySelectorAll('.stream-pick option')].map(o => o.textContent);

  it('offers the listed channels only: no link of the viewer’s own, no button to another tab', async () => {
    await mountStream();
    expect(options()).toEqual(['Chess.com Türkçe', 'Chess.com (EN)', 'FIDE (EN)']);
    expect(text()).not.toContain('Kendi bağlantım');
    expect(text()).not.toContain('SatranChess');
    expect(host.querySelector('.stream-top a')).toBeNull();
    expect(host.querySelector('input')).toBeNull();
    // one control beside the dropdown: hiding the video
    expect([...host.querySelectorAll('.stream-top button')].map(b => b.textContent)).toEqual(['Yayını gizle']);
  });

  it('falls back to the first channel for a choice that is no longer offered', async () => {
    for (const gone of ['yt-satranchess', 'custom']) {
      localStorage.setItem('wcc26:settings', JSON.stringify({ streamId: gone, customStream: 'https://youtu.be/dQw4w9WgXcQ' }));
      const mod = await mountStream();
      expect(host.querySelector<HTMLSelectElement>('.stream-pick select')!.value).toBe('yt-chesscomtr');
      expect(host.querySelector('iframe')!.getAttribute('src')).toContain('youtube');
      expect(host.querySelector('iframe')!.getAttribute('src')).not.toContain('dQw4w9WgXcQ');
      // choosing another one is remembered as before
      const select = host.querySelector<HTMLSelectElement>('.stream-pick select')!;
      await act(async () => {
        select.value = 'yt-fide';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(mod.useStore.getState().settings.streamId).toBe('yt-fide');
      await act(() => root.render(<></>));
      localStorage.clear();
    }
  });
});

describe('the moves under the engine', () => {
  it('are a table: a number, White’s move, Black’s move', async () => {
    // jsdom lays nothing out and has no observer for it; the list only uses one to keep the current move in sight
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const mod = await boot();
    const { MovesPanel } = await import('../src/components/AnalysisPanel');
    const Host = () => {
      const g = mod.useStore(mod.selectGameData);
      const shown = mod.useStore(mod.selectShownPly);
      return g ? <MovesPanel game={g} shown={shown} /> : null;
    };
    await act(() => root.render(<Host />));
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 5) })));
    // every cell of the grid in order: a number before each of White's moves, none before Black's
    const cells = [...host.querySelectorAll('.move-list .mv')].flatMap(mv => [...mv.children].map(c => (c.className.includes('move-num') ? `#${c.textContent}` : c.textContent)));
    expect(cells).toEqual(['#1.', 'e4', 'e5', '#2.', 'Af3', 'Ac6', '#3.', 'Fc4']);
    expect(host.querySelector('.move.active')!.textContent).toBe('Fc4');
    // a move is still a button that takes the board there
    await act(async () => host.querySelectorAll<HTMLButtonElement>('.move-list .move')[1].click());
    expect(mod.useStore.getState().viewPly).toBe(2);
  });
});

describe('turning the board', () => {
  it('is one button that can sit in the strip or beside the board', async () => {
    const mod = await boot();
    const { FlipButton, MoveStrip } = await import('../src/components/MoveStrip');
    const Host = ({ flip }: { flip: boolean }) => {
      const g = mod.useStore(mod.selectGameData);
      const shown = mod.useStore(mod.selectShownPly);
      return g ? (
        <>
          <div className="rail">{!flip && <FlipButton className="tool-btn" />}</div>
          <MoveStrip game={g} shown={shown} line={null} ownMoves={[]} backLabel="Canlı konuma dön" atNewest flip={flip} />
        </>
      ) : null;
    };
    await act(() => root.render(<Host flip />));
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: ITALIAN })));
    const flips = () => [...host.querySelectorAll<HTMLButtonElement>('button[aria-keyshortcuts="F"]')];
    expect(flips()).toHaveLength(1);
    expect(flips()[0].closest('.move-strip')).not.toBeNull();
    expect(flips()[0].getAttribute('aria-label')).toBe('Tahtayı çevir');
    await act(async () => flips()[0].click());
    expect(mod.useStore.getState().flipped).toBe(true);

    // beside the board: the strip gives it up, and it is the same button
    await act(() => root.render(<Host flip={false} />));
    expect(flips()).toHaveLength(1);
    expect(flips()[0].closest('.move-strip')).toBeNull();
    expect(flips()[0].closest('.rail')).not.toBeNull();
    await act(async () => flips()[0].click());
    expect(mod.useStore.getState().flipped).toBe(false);
  });
});

describe('the settings tab', () => {
  it('is one block for each setting, with what it does inside the block', async () => {
    await boot();
    const { SettingsPanel } = await import('../src/components/SettingsPanel');
    await act(() => root.render(<SettingsPanel />));
    const blocks = [...host.querySelectorAll('.settings > .setting')];
    expect(blocks.map(b => b.querySelector('.setting-row > span')!.textContent)).toEqual(['Dil', 'Notasyon', 'Stockfish değerlendirmesi', 'En iyi hamle oku', 'Hamle sesi', 'Spoiler koruması', 'Klavye']);
    // every block starts with its row; a note is never a sibling of the blocks, where a rule could come between it and its row
    for (const b of blocks) expect(b.firstElementChild!.className).toBe('setting-row');
    expect(host.querySelectorAll('.settings > p:not(.notice)')).toHaveLength(0);
    const noted = blocks.filter(b => b.querySelector('p'));
    expect(noted.map(b => b.querySelector('.setting-row > span')!.textContent)).toEqual(['Spoiler koruması', 'Klavye']);
    expect(noted[0].querySelector('p')!.textContent).toBe('Her oyunu en son gördüğün hamlede duraklatılmış aç');
    // the keyboard block has no control, only its note
    expect(noted[1].querySelector('.seg')).toBeNull();
    // a switch still switches
    const sound = blocks[4].querySelectorAll<HTMLButtonElement>('.seg button');
    await act(async () => sound[1].click());
    expect(sound[1].getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the top bar', () => {
  it('shows the status and the language, and no connection dot', async () => {
    const mod = await boot();
    const { Header } = await import('../src/components/Header');
    await act(() => root.render(<Header />));
    await act(async () => push(R1, game({ round: 1, id: 'g1', sans: ITALIAN })));
    expect(host.querySelector('.feed-dot')).toBeNull();
    const right = host.querySelector('.top-right')!;
    expect([...right.children].map(c => c.className.split(' ')[0])).toEqual(['pill', 'lang']);
    expect(right.textContent).toBe('CANLIEN');
    expect(mod.useStore.getState().feed).toBeDefined(); // the store still knows; the bar no longer says
  });


  it('has a mark of its own and the title in two halves that each stay whole', async () => {
    await boot();
    const { Header } = await import('../src/components/Header');
    await act(() => root.render(<Header />));
    const brand = host.querySelector('.brand')!;
    expect(brand.querySelector('svg.logo path')).not.toBeNull();
    expect(brand.querySelector('svg.logo')!.getAttribute('aria-hidden')).toBe('true');
    expect([...brand.querySelectorAll('h1 span')].map(s => s.textContent)).toEqual(['Dünya Satranç', 'Şampiyonası 2026']);
    // read as one title, with the space between the halves
    expect(brand.querySelector('h1')!.textContent).toBe('Dünya Satranç Şampiyonası 2026');
    expect(brand.querySelector('p')!.textContent).toBe('Cenevre');
  });

  describe('the match as a scoreboard', () => {
    const R4 = 'round004';
    const threeGames = () => {
      world.rounds = [round(R1, 1, T0 - 49 * HOUR, { finished: true }), round(R2, 2, T0 - 25 * HOUR, { finished: true }), round(R3, 3, T0 - HOUR, { ongoing: true }), round(R4, 4, T0 + 23 * HOUR)];
      world.defaultRoundId = R3;
      // game 1: Sindarov wins with White. game 2: a draw, Gukesh with White.
      world.tournamentPgn = game({ round: 1, id: 'g1', sans: QGD, result: '1-0' }) + game({ round: 2, id: 'g2', whiteIsSindarov: false, sans: ITALIAN, result: '1/2-1/2' });
    };
    const mount = async (squares: boolean) => {
      threeGames();
      const mod = await boot();
      const { Header } = await import('../src/components/Header');
      await act(() => root.render(<Header squares={squares} />));
      await act(async () => push(R3, game({ round: 3, id: 'g3', sans: ITALIAN.slice(0, 5) })));
      return mod;
    };
    const halves = (tile: Element) => [...tile.querySelectorAll('.half')].map(h => `${h.className.replace('half', '').trim().replace(/\s+/g, ' ')}:${h.textContent}`);

    it('has a row for each player, read as name then total, the champion first', async () => {
      await mount(true);
      const who = [...host.querySelectorAll('.match-strip .who')];
      expect(who.map(w => w.className)).toEqual(['who a', 'who b']);
      expect(who.map(w => w.querySelector('.who-name')!.textContent)).toEqual(['Gukesh', 'Sindarov']);
      expect(who.map(w => w.querySelector('.pts')!.textContent)).toEqual(['½', '1½']);
      // names that are capitalised by the stylesheet are marked as not Turkish
      for (const w of who) expect(w.querySelector('.who-name')!.getAttribute('lang')).toBe('en');
      // both players come before the tiles, so the score is heard before the list of games
      const strip = host.querySelector('.match-strip')!;
      expect([...strip.children].map(c => c.className.split(' ')[0])).toEqual(['who', 'who', 'game-squares', 'game-now']);
      expect(strip.querySelector('.game-now')!.textContent).toBe('3. oyun');
    });

    it('gives every game a tile: two halves once it has started, its number while it is to come', async () => {
      await mount(true);
      const tiles = [...host.querySelectorAll('.game-squares .sq')];
      expect(tiles).toHaveLength(4);
      // game 1: Gukesh (top row) lost with Black, Sindarov won with White
      expect(tiles[0].className).toMatch(/split done won-b/);
      expect(halves(tiles[0])).toEqual(['black lost:0', 'white won:1']);
      // game 2: a draw, Gukesh with White
      expect(tiles[1].className).toMatch(/split done draw/);
      expect(halves(tiles[1])).toEqual(['white:½', 'black:½']);
      // game 3, in progress: the pieces each has, no points yet, and the red light
      expect(tiles[2].className).toMatch(/split live/);
      expect(halves(tiles[2])).toEqual(['black:', 'white:']);
      expect(tiles[2].querySelector('.sq-live')).not.toBeNull();
      expect(tiles[2].getAttribute('aria-current')).toBe('true');
      // game 4, to come: one tile with its number, and nothing about colours
      expect(tiles[3].className).toMatch(/whole ahead/);
      expect(tiles[3].querySelector('.half')).toBeNull();
      expect(tiles[3].textContent).toBe('4');
      // what a tile shows is for the eye; its name says the same in words
      expect(tiles[0].getAttribute('aria-label')).toBe('1. oyun: Sindarov – Gukesh, 1–0');
      for (const t of tiles) for (const part of t.children) expect(part.getAttribute('aria-hidden')).toBe('true');
    });

    it('opens a game from its tile', async () => {
      const mod = await mount(true);
      const tiles = () => [...host.querySelectorAll<HTMLButtonElement>('.game-squares .sq')];
      await act(async () => tiles()[0].click());
      expect(mod.useStore.getState().roundId).toBe(R1);
      expect(tiles()[0].getAttribute('aria-current')).toBe('true');
      expect(tiles()[2].getAttribute('aria-current')).toBeNull();
      expect(host.querySelector('.match-strip .game-now')!.textContent).toBe('1. oyun');
    });

    it('keeps the names and totals where there is no room for the tiles', async () => {
      await mount(false);
      expect(host.querySelector('.game-squares')).toBeNull();
      expect(host.querySelector('.match-strip')!.className).not.toMatch(/with-games/);
      expect([...host.querySelectorAll('.match-strip .pts')].map(p => p.textContent)).toEqual(['½', '1½']);
    });

    it('says nothing of a result the viewer has not reached', async () => {
      // watching game 1 from its start while game 2 is already over
      world.rounds = [round(R1, 1, T0 - 25 * HOUR, { finished: true }), round(R2, 2, T0 - HOUR, { finished: true }), round(R3, 3, T0 + 23 * HOUR)];
      world.defaultRoundId = R1;
      world.tournamentPgn = game({ round: 1, id: 'g1', sans: QGD, result: '1/2-1/2' }) + game({ round: 2, id: 'g2', whiteIsSindarov: false, sans: ITALIAN, result: '0-1' });
      const mod = await boot();
      const { Header } = await import('../src/components/Header');
      await act(() => root.render(<Header squares />));
      await act(async () => {
        mod.useStore.getState().selectRound(R1);
        push(R1, game({ round: 1, id: 'g1', sans: QGD, result: '1/2-1/2' }));
        mod.useStore.getState().restart();
      });
      const tiles = [...host.querySelectorAll('.game-squares .sq')];
      expect(tiles[1].className).toMatch(/whole hidden/);
      expect(tiles[1].textContent).toBe('2');
      expect(tiles[1].querySelector('.half')).toBeNull();
      expect([...host.querySelectorAll('.match-strip .pts')].map(p => p.textContent)).toEqual(['0', '0']);
    });
  });
});
