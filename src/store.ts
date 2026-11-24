import { create } from 'zustand';
import { CHAMPION_FIDE_ID, FORCED_ROUND_ID, TOUR_ID } from './config';
import type { Lang } from './i18n';
import { resultPoints, type Notation } from './lib/format';
import {
  followRound,
  getRoundJson,
  getTournament,
  getTournamentPgn,
  type FeedStatus,
  type RoundInfo,
  type TournamentInfo,
} from './lib/lichess';
import { parseGame, splitGames, type GameData, type PlayerInfo } from './lib/pgn';
import { playMove } from './lib/sound';

export interface Settings {
  lang: Lang;
  notation: Notation;
  /** Seconds the board is held back to match a video stream. */
  delaySec: number;
  sound: boolean;
  engine: boolean;
  arrow: boolean;
  streamId: string;
  customStream: string;
  streamHidden: boolean;
  /** Width of the side column in px on desktop (0 = automatic). */
  sideWidth: number;
}

const DEFAULTS: Settings = {
  lang: 'tr',
  notation: 'tr',
  delaySec: 0,
  sound: true,
  engine: true,
  arrow: true,
  streamId: 'yt-chesscomtr',
  customStream: '',
  streamHidden: false,
  sideWidth: 0,
};

const SETTINGS_KEY = 'wcc26:settings';

const loadSettings = (): Settings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // private mode or blocked storage: fall back to defaults
  }
  return DEFAULTS;
};

const saveSettings = (s: Settings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
};

export interface MatchGame {
  roundNo: number;
  white: PlayerInfo;
  black: PlayerInfo;
  result: string;
}

interface State {
  tour?: TournamentInfo['tour'];
  rounds: RoundInfo[];
  roundId?: string;
  games: Record<string, GameData>;
  gameOrder: string[];
  gameId?: string;
  feed: FeedStatus;
  loadError: boolean;
  feds: Record<string, string>;
  matchGames: MatchGame[];
  /** Number of plies of the selected game that are visible after the sync delay. */
  revealed: number;
  resultVisible: boolean;
  /** null = follow the live edge. */
  viewPly: number | null;
  flipped: boolean;
  settings: Settings;
  init: () => void;
  selectRound: (id: string) => void;
  selectGame: (id: string) => void;
  setViewPly: (n: number | null) => void;
  step: (delta: number) => void;
  toggleFlip: () => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

let stopFeed: (() => void) | undefined;
let revealTimer: number | undefined;
let started = false;
const rawById = new Map<string, string>();

export const useStore = create<State>((set, get) => {
  const recomputeReveal = () => {
    window.clearTimeout(revealTimer);
    const s = get();
    const g = s.gameId ? s.games[s.gameId] : undefined;
    if (!g) {
      if (s.revealed !== 0 || s.resultVisible) set({ revealed: 0, resultVisible: false });
      return;
    }
    const tNow = Date.now() - s.settings.delaySec * 1000;
    let n = 0;
    while (n < g.plies.length && g.plies[n].seenAt <= tNow) n++;
    const over = g.result !== '*';
    const resultVisible = over && n === g.plies.length && g.resultSeenAt <= tNow;

    if (n !== s.revealed || resultVisible !== s.resultVisible) {
      if (n === s.revealed + 1 && s.viewPly === null && s.settings.sound) playMove(g.plies[n - 1].capture);
      set({
        revealed: n,
        resultVisible,
        viewPly: s.viewPly !== null && s.viewPly >= n ? null : s.viewPly,
      });
    }

    const nextAt = n < g.plies.length ? g.plies[n].seenAt : over && !resultVisible ? g.resultSeenAt : undefined;
    if (nextAt !== undefined) revealTimer = window.setTimeout(recomputeReveal, Math.max(30, nextAt - tNow));
  };

  /** Uses Lichess' "think time" to learn when the latest move was actually played. */
  const syncThinkTime = async (roundId: string) => {
    const before = get();
    const lenBefore = before.gameId ? before.games[before.gameId]?.plies.length : undefined;
    try {
      const data = await getRoundJson(roundId);
      const s = get();
      if (s.roundId !== roundId) return;
      const feds: Record<string, string> = { ...s.feds };
      for (const g of data.games) for (const p of g.players ?? []) if (p.fideId && p.fed) feds[String(p.fideId)] = p.fed;
      const patch: Partial<State> = { feds };

      const g = s.gameId ? s.games[s.gameId] : undefined;
      const remote = data.games.find(x => x.id === s.gameId);
      if (g && remote && remote.thinkTime !== undefined && g.plies.length > 0 && g.plies.length === lenBefore) {
        const plies = g.plies.slice();
        const last = plies[plies.length - 1];
        plies[plies.length - 1] = { ...last, seenAt: Date.now() - remote.thinkTime * 1000 };
        patch.games = { ...s.games, [g.id]: { ...g, plies } };
      }
      set(patch);
      recomputeReveal();
    } catch {
      // flags and the exact clock start are nice-to-have
    }
  };

  const ingest = (roundId: string, pgn: string) => {
    const s = get();
    if (s.roundId !== roundId) return;
    const now = Date.now();
    const games = { ...s.games };
    const order = s.gameOrder.slice();
    let changed = false;
    let needThinkSync = false;
    for (const chunk of splitGames(pgn)) {
      const id = /\[GameURL "[^"]*\/([^"/]+)"\]/.exec(chunk)?.[1];
      if (id && rawById.get(id) === chunk) continue;
      const prev = id ? games[id] : undefined;
      const parsed = parseGame(chunk, prev, prev ? now : 0);
      if (!parsed) continue;
      rawById.set(parsed.id, chunk);
      // More than one new move at once means we were away; exact timing is unknown.
      if (prev && parsed.plies.length - prev.plies.length >= 2) needThinkSync = true;
      if (!games[parsed.id]) order.push(parsed.id);
      games[parsed.id] = parsed;
      changed = true;
    }
    if (!changed && !s.loadError) return;
    set({ games, gameOrder: order, gameId: s.gameId ?? order[0], loadError: false });
    recomputeReveal();
    if (needThinkSync) void syncThinkTime(roundId);
  };

  const loadMatchGames = async () => {
    try {
      const pgn = await getTournamentPgn(TOUR_ID);
      const matchGames: MatchGame[] = [];
      for (const chunk of splitGames(pgn)) {
        const g = parseGame(chunk, undefined, 0);
        if (!g) continue;
        matchGames.push({ roundNo: parseInt(g.round, 10) || matchGames.length + 1, white: g.white, black: g.black, result: g.result });
      }
      set({ matchGames });
    } catch {
      // schedule still renders without colours and results
    }
  };

  const loadTournament = async (first: boolean) => {
    try {
      const data = await getTournament(TOUR_ID);
      set({ tour: data.tour, rounds: data.rounds });
      if (first) {
        const pick =
          (FORCED_ROUND_ID && data.rounds.find(r => r.id === FORCED_ROUND_ID)?.id) ||
          data.rounds.find(r => r.ongoing)?.id ||
          data.defaultRoundId ||
          data.rounds.find(r => !r.finished)?.id ||
          data.rounds[data.rounds.length - 1]?.id;
        if (pick) get().selectRound(pick);
      }
    } catch {
      if (first) {
        set({ loadError: true });
        window.setTimeout(() => void loadTournament(true), 4000);
      }
    }
  };

  return {
    rounds: [],
    games: {},
    gameOrder: [],
    feed: 'connecting',
    loadError: false,
    feds: {},
    matchGames: [],
    revealed: 0,
    resultVisible: false,
    viewPly: null,
    flipped: false,
    settings: loadSettings(),

    init: () => {
      if (started) return;
      started = true;
      void loadTournament(true);
      void loadMatchGames();
      window.setInterval(() => void loadTournament(false), 60000);
      window.setInterval(() => void loadMatchGames(), 180000);
    },

    selectRound: id => {
      stopFeed?.();
      rawById.clear();
      window.clearTimeout(revealTimer);
      set({ roundId: id, games: {}, gameOrder: [], gameId: undefined, revealed: 0, resultVisible: false, viewPly: null, feed: 'connecting' });
      let firstData = true;
      stopFeed = followRound(
        id,
        pgn => {
          ingest(id, pgn);
          if (firstData) {
            firstData = false;
            void syncThinkTime(id);
          }
        },
        feed => set({ feed }),
      );
    },

    selectGame: id => {
      set({ gameId: id, viewPly: null, revealed: 0, resultVisible: false });
      recomputeReveal();
    },

    setViewPly: n => {
      const { revealed } = get();
      set({ viewPly: n === null || n >= revealed ? null : Math.max(0, n) });
    },

    step: delta => {
      const { viewPly, revealed } = get();
      const cur = viewPly ?? revealed;
      const n = Math.max(0, Math.min(revealed, cur + delta));
      set({ viewPly: n >= revealed ? null : n });
    },

    toggleFlip: () => set(s => ({ flipped: !s.flipped })),

    setSetting: (key, value) => {
      const settings = { ...get().settings, [key]: value };
      saveSettings(settings);
      set({ settings });
      if (key === 'delaySec') recomputeReveal();
    },
  };
});

export const selectGameData = (s: State): GameData | undefined => (s.gameId ? s.games[s.gameId] : undefined);

/** Ply currently shown on the board. */
export const selectShownPly = (s: State): number => Math.min(s.viewPly ?? s.revealed, s.revealed);

export interface ClockView {
  white?: number;
  black?: number;
  /** Side whose clock is counting down right now. */
  running?: 'white' | 'black';
}

/** Clocks as of ply `shown`. At the live edge the side to move ticks in real time. */
export const clocksAt = (g: GameData, shown: number, atLiveEdge: boolean, resultVisible: boolean, delaySec: number): ClockView => {
  let white = g.initialClock;
  let black = g.initialClock;
  for (let i = 0; i < shown; i++) {
    const p = g.plies[i];
    if (p.clk === undefined) continue;
    if (i % 2 === 0) white = p.clk;
    else black = p.clk;
  }
  const whiteStarts = g.initialFen.split(' ')[1] !== 'b';
  const sideToMove: 'white' | 'black' = (shown % 2 === 0) === whiteStarts ? 'white' : 'black';
  if (!atLiveEdge || resultVisible || shown === 0) return { white, black };
  const last = g.plies[shown - 1];
  if (last.seenAt > 0) {
    const elapsed = Math.max(0, (Date.now() - delaySec * 1000 - last.seenAt) / 1000);
    if (sideToMove === 'white' && white !== undefined) white = Math.max(0, white - elapsed);
    if (sideToMove === 'black' && black !== undefined) black = Math.max(0, black - elapsed);
  }
  return { white, black, running: sideToMove };
};

export interface MatchScore {
  a: PlayerInfo;
  b: PlayerInfo;
  aPoints: number;
  bPoints: number;
  played: number;
}

/** Match score, honouring the sync delay for the game being watched. */
export const selectScore = (s: State): MatchScore | undefined => {
  if (!s.matchGames.length) return undefined;
  const first = s.matchGames[0];
  // Champion first; otherwise game 1's White.
  const firstIsA = first.black.fideId !== CHAMPION_FIDE_ID;
  const a = firstIsA ? first.white : first.black;
  const b = firstIsA ? first.black : first.white;
  const same = (x: PlayerInfo, y: PlayerInfo) => (x.fideId && y.fideId ? x.fideId === y.fideId : x.name === y.name);
  const currentRoundNo = s.rounds.findIndex(r => r.id === s.roundId) + 1;
  const live = selectGameData(s);
  let aPoints = 0;
  let bPoints = 0;
  let played = 0;
  for (const mg of s.matchGames) {
    let result = mg.result;
    if (mg.roundNo === currentRoundNo && live && same(live.white, mg.white)) result = s.resultVisible ? live.result : '*';
    const pts = resultPoints(result);
    if (!pts) continue;
    played++;
    const whiteIsA = same(mg.white, a);
    aPoints += whiteIsA ? pts[0] : pts[1];
    bPoints += whiteIsA ? pts[1] : pts[0];
  }
  return { a, b, aPoints, bPoints, played };
};
