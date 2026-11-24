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
  /** Open every game paused at the last move you saw, so nothing is spoiled. */
  spoilerShield: boolean;
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
  spoilerShield: false,
};

const SETTINGS_KEY = 'wcc26:settings';
const PAUSE_KEY = 'wcc26:pause';
const SEEN_KEY = 'wcc26:seen';

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // private mode or blocked storage: fall back
  }
  return fallback;
};

const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
};

/** Paused ply per game id, so a pause survives closing the tab. */
const pauses = readJson<Record<string, number>>(PAUSE_KEY, {});
/** Furthest ply this browser has shown per game id. */
const seen = readJson<Record<string, number>>(SEEN_KEY, {});

export interface MatchGame {
  roundNo: number;
  white: PlayerInfo;
  black: PlayerInfo;
  result: string;
  /** UCI moves, for comparing openings between games of the match. */
  moves: string[];
  sans: string[];
  opening?: string;
}

/** A position from another game shown on the board for comparison. */
export interface Preview {
  fen: string;
  lastMove?: [string, string];
  label: string;
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
  /** Number of plies of the selected game that are visible (after sync delay and pause). */
  revealed: number;
  resultVisible: boolean;
  /** null = follow the newest visible move. */
  viewPly: number | null;
  flipped: boolean;
  /** Catch-up mode: nothing past `pausePly` is shown until the viewer asks. */
  paused: boolean;
  pausePly: number;
  /** Auto-reveal interval in ms while paused (0 = off). */
  autoplayMs: number;
  preview: Preview | null;
  /** The viewer chose to see the video even though the board is paused. */
  streamUncovered: boolean;
  settings: Settings;
  init: () => void;
  selectRound: (id: string) => void;
  selectGame: (id: string) => void;
  setViewPly: (n: number | null) => void;
  step: (delta: number) => void;
  toggleFlip: () => void;
  pause: () => void;
  resume: () => void;
  revealNext: () => void;
  restart: () => void;
  setAutoplay: (ms: number) => void;
  setPreview: (p: Preview | null) => void;
  setStreamUncovered: (v: boolean) => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

let stopFeed: (() => void) | undefined;
let revealTimer: number | undefined;
let autoplayTimer: number | undefined;
let started = false;
const rawById = new Map<string, string>();

/** Moves that have arrived and passed the sync delay, ignoring any pause. */
const delayedCount = (g: GameData, delaySec: number): number => {
  const tNow = Date.now() - delaySec * 1000;
  let n = 0;
  while (n < g.plies.length && g.plies[n].seenAt <= tNow) n++;
  return n;
};

export const useStore = create<State>((set, get) => {
  const persistPause = () => {
    const s = get();
    if (!s.gameId) return;
    if (s.paused) pauses[s.gameId] = s.pausePly;
    else delete pauses[s.gameId];
    writeJson(PAUSE_KEY, pauses);
  };

  /** Pause state a game should open with: a stored pause, or the spoiler shield. */
  const pauseFor = (gameId: string): Pick<State, 'paused' | 'pausePly' | 'autoplayMs'> => {
    const stored = pauses[gameId];
    if (stored !== undefined) return { paused: true, pausePly: stored, autoplayMs: 0 };
    if (get().settings.spoilerShield) return { paused: true, pausePly: seen[gameId] ?? 0, autoplayMs: 0 };
    return { paused: false, pausePly: 0, autoplayMs: 0 };
  };

  const stopAutoplay = () => {
    window.clearInterval(autoplayTimer);
    autoplayTimer = undefined;
  };

  const recomputeReveal = () => {
    window.clearTimeout(revealTimer);
    const s = get();
    const g = s.gameId ? s.games[s.gameId] : undefined;
    if (!g) {
      if (s.revealed !== 0 || s.resultVisible) set({ revealed: 0, resultVisible: false });
      return;
    }
    const tNow = Date.now() - s.settings.delaySec * 1000;
    const available = delayedCount(g, s.settings.delaySec);
    const over = g.result !== '*';
    // Nothing left to hide once a finished game has been stepped through to the end.
    if (s.paused && over && s.pausePly >= g.plies.length) {
      stopAutoplay();
      set({ paused: false, autoplayMs: 0 });
      persistPause();
    }
    const paused = get().paused;
    const n = paused ? Math.min(available, s.pausePly) : available;
    const resultVisible = over && n === g.plies.length && g.resultSeenAt <= tNow;

    if (n !== s.revealed || resultVisible !== s.resultVisible) {
      if (n === s.revealed + 1 && s.viewPly === null && s.settings.sound) playMove(g.plies[n - 1].capture);
      set({
        revealed: n,
        resultVisible,
        viewPly: s.viewPly !== null && s.viewPly >= n ? null : s.viewPly,
      });
    }
    if (n > (seen[g.id] ?? 0)) {
      seen[g.id] = n;
      writeJson(SEEN_KEY, seen);
    }

    const nextAt =
      available < g.plies.length ? g.plies[available].seenAt : over && g.resultSeenAt > tNow ? g.resultSeenAt : undefined;
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
      if (g && remote && remote.thinkTime !== undefined && g.plies.length > 0 && g.plies.length === lenBefore && g.result === '*') {
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
    const patch: Partial<State> = { games, gameOrder: order, loadError: false };
    if (!s.gameId && order[0]) {
      // First data for this round: decide the pause state before anything is shown.
      patch.gameId = order[0];
      Object.assign(patch, pauseFor(order[0]));
    }
    set(patch);
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
        matchGames.push({
          roundNo: parseInt(g.round, 10) || matchGames.length + 1,
          white: g.white,
          black: g.black,
          result: g.result,
          moves: g.plies.map(p => p.uci),
          sans: g.plies.map(p => p.san),
          opening: g.opening,
        });
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
    paused: false,
    pausePly: 0,
    autoplayMs: 0,
    preview: null,
    streamUncovered: false,
    settings: { ...DEFAULTS, ...readJson<Partial<Settings>>(SETTINGS_KEY, {}) },

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
      stopAutoplay();
      rawById.clear();
      window.clearTimeout(revealTimer);
      set({
        roundId: id,
        games: {},
        gameOrder: [],
        gameId: undefined,
        revealed: 0,
        resultVisible: false,
        viewPly: null,
        paused: false,
        pausePly: 0,
        autoplayMs: 0,
        preview: null,
        feed: 'connecting',
      });
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
      stopAutoplay();
      set({ gameId: id, viewPly: null, revealed: 0, resultVisible: false, preview: null, ...pauseFor(id) });
      recomputeReveal();
    },

    setViewPly: n => {
      const { revealed } = get();
      set({ viewPly: n === null || n >= revealed ? null : Math.max(0, n), preview: null });
    },

    step: delta => {
      const { viewPly, revealed, paused, preview } = get();
      if (preview) {
        set({ preview: null });
        return;
      }
      if (delta > 0 && viewPly === null && paused) {
        get().revealNext();
        return;
      }
      const cur = viewPly ?? revealed;
      const n = Math.max(0, Math.min(revealed, cur + delta));
      set({ viewPly: n >= revealed ? null : n });
    },

    toggleFlip: () => set(s => ({ flipped: !s.flipped })),

    pause: () => {
      stopAutoplay();
      set(s => ({ paused: true, pausePly: s.revealed, autoplayMs: 0, streamUncovered: false }));
      persistPause();
    },

    resume: () => {
      stopAutoplay();
      set({ paused: false, autoplayMs: 0, viewPly: null, preview: null });
      persistPause();
      recomputeReveal();
    },

    revealNext: () => {
      const s = get();
      const g = s.gameId ? s.games[s.gameId] : undefined;
      if (!s.paused || !g) return;
      const available = delayedCount(g, s.settings.delaySec);
      if (s.pausePly + 1 >= available) {
        // Caught up with everything that has been played: back to live.
        stopAutoplay();
        set({ paused: false, autoplayMs: 0, viewPly: null, preview: null });
      } else {
        set({ pausePly: s.pausePly + 1, viewPly: null, preview: null });
      }
      persistPause();
      recomputeReveal();
    },

    restart: () => {
      stopAutoplay();
      set({ paused: true, pausePly: 0, autoplayMs: 0, viewPly: null, preview: null });
      persistPause();
      recomputeReveal();
    },

    setAutoplay: ms => {
      stopAutoplay();
      set({ autoplayMs: ms });
      if (ms > 0) {
        autoplayTimer = window.setInterval(() => {
          if (!get().paused) stopAutoplay();
          else get().revealNext();
        }, ms);
      }
    },

    setPreview: p => set({ preview: p }),

    setStreamUncovered: v => set({ streamUncovered: v }),

    setSetting: (key, value) => {
      const settings = { ...get().settings, [key]: value };
      writeJson(SETTINGS_KEY, settings);
      set({ settings });
      if (key === 'delaySec') recomputeReveal();
    },
  };
});

export const selectGameData = (s: State): GameData | undefined => (s.gameId ? s.games[s.gameId] : undefined);

/** Ply currently shown on the board. */
export const selectShownPly = (s: State): number => Math.min(s.viewPly ?? s.revealed, s.revealed);

/** 1-based game number of the selected round. */
export const selectRoundNo = (s: State): number => s.rounds.findIndex(r => r.id === s.roundId) + 1;

export interface ClockView {
  white?: number;
  black?: number;
  /** Side whose clock is counting down right now. */
  running?: 'white' | 'black';
}

/** Clocks as of ply `shown`. At the live edge the side to move ticks in real time. */
export const clocksAt = (g: GameData, shown: number, ticking: boolean, delaySec: number): ClockView => {
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
  if (!ticking || shown === 0) return { white, black };
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

/**
 * Result of a match game as the viewer is allowed to see it: the game being
 * watched honours the sync delay and pause, and while paused later games stay hidden.
 */
export const visibleResult = (s: State, mg: MatchGame): string => {
  const currentRoundNo = selectRoundNo(s);
  const live = selectGameData(s);
  if (mg.roundNo === currentRoundNo && live) return s.resultVisible ? live.result : '*';
  if (s.paused && currentRoundNo > 0 && mg.roundNo > currentRoundNo) return '*';
  return mg.result;
};

export const selectScore = (s: State): MatchScore | undefined => {
  if (!s.matchGames.length) return undefined;
  const first = s.matchGames[0];
  // Champion first; otherwise game 1's White.
  const firstIsA = first.black.fideId !== CHAMPION_FIDE_ID;
  const a = firstIsA ? first.white : first.black;
  const b = firstIsA ? first.black : first.white;
  const same = (x: PlayerInfo, y: PlayerInfo) => (x.fideId && y.fideId ? x.fideId === y.fideId : x.name === y.name);
  let aPoints = 0;
  let bPoints = 0;
  let played = 0;
  for (const mg of s.matchGames) {
    const pts = resultPoints(visibleResult(s, mg));
    if (!pts) continue;
    played++;
    const whiteIsA = same(mg.white, a);
    aPoints += whiteIsA ? pts[0] : pts[1];
    bPoints += whiteIsA ? pts[1] : pts[0];
  }
  return { a, b, aPoints, bPoints, played };
};
