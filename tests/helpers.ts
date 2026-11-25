import { vi } from 'vitest';

/** A fake Lichess broadcast the tests drive by hand: rounds, PGN pushes and round status. */

export const R1 = 'round001';
export const R2 = 'round002';
export const R3 = 'round003';
export const HOUR = 3_600_000;

export interface FakeRound {
  id: string;
  name: string;
  slug: string;
  url: string;
  startsAt?: number;
  ongoing?: boolean;
  finished?: boolean;
}

export const round = (id: string, n: number, startsAt: number, flags: { ongoing?: boolean; finished?: boolean } = {}): FakeRound => ({
  id,
  name: `Game ${n}`,
  slug: `game-${n}`,
  url: '',
  startsAt,
  ...flags,
});

export const world = {
  rounds: [] as FakeRound[],
  defaultRoundId: undefined as string | undefined,
  tournamentPgn: '',
  /** Seconds the side to move has been thinking, as the round JSON would report. */
  thinkTime: undefined as number | undefined,
  /** Feed callbacks by round id, captured when the store opens a round. */
  feeds: new Map<string, (pgn: string) => void>(),
  opened: [] as string[],
  closed: [] as string[],
};

export const resetWorld = () => {
  world.rounds = [];
  world.defaultRoundId = undefined;
  world.tournamentPgn = '';
  world.thinkTime = undefined;
  world.feeds.clear();
  world.opened = [];
  world.closed = [];
};

const GUKESH = { name: 'Gukesh D', fideId: '46616543' };
const SINDAROV = { name: 'Sindarov, Javokhir', fideId: '14205483' };

/** Builds one broadcast game in the PGN shape Lichess sends (headers, clocks, blank-line gap). */
export const game = (o: { round: number; id: string; roundId?: string; whiteIsSindarov?: boolean; result?: string; sans?: string[] }): string => {
  const white = o.whiteIsSindarov === false ? GUKESH : SINDAROV;
  const black = o.whiteIsSindarov === false ? SINDAROV : GUKESH;
  const result = o.result ?? '*';
  const sans = o.sans ?? [];
  let clock = 7200;
  const body = sans
    .map((san, i) => {
      clock -= 10;
      const h = Math.floor(clock / 3600);
      const m = String(Math.floor((clock % 3600) / 60)).padStart(2, '0');
      const s = String(clock % 60).padStart(2, '0');
      const no = Math.floor(i / 2) + 1;
      return `${i % 2 === 0 ? `${no}.` : `${no}...`} ${san} { [%clk ${h}:${m}:${s}] }`;
    })
    .join(' ');
  return [
    '[Event "Test"]',
    `[Round "${o.round}.1"]`,
    `[White "${white.name}"]`,
    `[Black "${black.name}"]`,
    `[Result "${result}"]`,
    `[WhiteFideId "${white.fideId}"]`,
    `[BlackFideId "${black.fideId}"]`,
    '[TimeControl "40/7200:20/3600:900+30"]',
    '[Variant "Standard"]',
    `[GameURL "https://lichess.org/broadcast/t/r/${o.roundId ?? 'r'}/${o.id}"]`,
    '',
    `${body} ${result}`.trim(),
    '',
    '',
  ].join('\n');
};

export const ITALIAN = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6'];
export const QGD = ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7'];

/** Sends a PGN update for a round, exactly as the live feed would. */
export const push = (roundId: string, pgn: string) => {
  const feed = world.feeds.get(roundId);
  if (!feed) throw new Error(`round ${roundId} is not open`);
  feed(pgn);
};

/**
 * Loads a fresh copy of the store wired to the fake broadcast. Module state
 * (timers, the "started" flag, the pause map read from localStorage) starts
 * clean each time, like a page load.
 */
export const loadStore = async () => {
  vi.resetModules();
  vi.doMock('../src/lib/lichess', () => ({
    getTournament: async () => ({
      tour: { id: 't', name: 'Test', slug: 't', url: '', info: { tc: '120 min' } },
      rounds: world.rounds.map(r => ({ ...r })),
      defaultRoundId: world.defaultRoundId,
    }),
    getTournamentPgn: async () => world.tournamentPgn,
    getRoundJson: async () => ({ round: {}, games: world.thinkTime === undefined ? [] : [{ id: 'unused', thinkTime: world.thinkTime }] }),
    getRoundPgn: async () => '',
    followRound: (roundId: string, onPgn: (pgn: string) => void, onStatus: (s: string) => void) => {
      world.feeds.set(roundId, onPgn);
      world.opened.push(roundId);
      onStatus('live');
      return () => {
        world.closed.push(roundId);
        world.feeds.delete(roundId);
      };
    },
  }));
  vi.doMock('../src/lib/streams', async importOriginal => ({
    ...(await importOriginal<typeof import('../src/lib/streams')>()),
    fetchStreamFeeds: async () => ({}),
  }));
  vi.doMock('../src/lib/sound', () => ({ playMove: () => undefined, unlockAudio: () => undefined }));
  const mod = await import('../src/store');
  return mod;
};

/** Starts the store the way the app does and waits for the first tournament load. */
export const boot = async () => {
  const mod = await loadStore();
  mod.useStore.getState().init();
  await vi.advanceTimersByTimeAsync(0);
  return mod;
};
