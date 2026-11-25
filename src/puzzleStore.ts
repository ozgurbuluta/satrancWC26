import { create } from 'zustand';
import { LICHESS } from './config';
import builtin from './data/puzzles.json';
import { track } from './lib/analytics';
import type { PlayedMove } from './lib/position';
import {
  addResult,
  EMPTY_SCORE,
  fromLichess,
  ratingBand,
  resultOf,
  revealSolution,
  startPuzzle,
  takeHint,
  tryMove,
  validatePuzzle,
  type Puzzle,
  type PuzzleScore,
  type PuzzleState,
} from './lib/puzzle';
import { playMove } from './lib/sound';
import { readJson, writeJson } from './lib/storage';

/** What to solve: the Lichess puzzle of the day, or the next puzzle of a kind. */
export type PuzzleChoice = 'daily' | 'mix' | 'mateIn1' | 'mateIn2' | 'short' | 'endgame';
export const PUZZLE_CHOICES: PuzzleChoice[] = ['daily', 'mix', 'mateIn1', 'mateIn2', 'short', 'endgame'];

export type Feedback = 'none' | 'correct' | 'wrong' | 'solved' | 'solved_first' | 'revealed';

const SCORE_KEY = 'satranc:puzzle-score';
const OFFLINE: Puzzle[] = (builtin as Omit<Puzzle, 'source'>[]).map(p => ({ ...p, source: 'builtin' as const })).filter(p => !validatePuzzle(p));

interface PuzzleStore {
  choice: PuzzleChoice;
  state?: PuzzleState;
  loading: boolean;
  /** The network puzzle could not be fetched, so one from the built-in set is shown. */
  offline: boolean;
  feedback: Feedback;
  /** The reply or the solution is being played out; input waits. */
  busy: boolean;
  /** Changes when the board must snap back to the current position. */
  syncToken: number;
  score: PuzzleScore;
  load: (choice?: PuzzleChoice) => Promise<void>;
  play: (move: PlayedMove) => void;
  rejected: () => void;
  hint: () => void;
  reveal: () => void;
  reset: () => void;
}

const seen = new Set<string>();
let timers: number[] = [];
let requestNo = 0;
let recorded = false;

const clearTimers = () => {
  timers.forEach(id => window.clearTimeout(id));
  timers = [];
};

const fetchPuzzle = async (choice: PuzzleChoice): Promise<Puzzle | undefined> => {
  const url = choice === 'daily' ? `${LICHESS}/api/puzzle/daily` : `${LICHESS}/api/puzzle/next${choice === 'mix' ? '' : `?angle=${choice}`}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
  if (!res.ok) return undefined;
  // Checked like any outside data: a legal position and a fully legal solution, or it is not shown.
  return fromLichess(await res.json(), choice === 'daily' ? 'daily' : 'lichess');
};

const fromOfflineSet = (choice: PuzzleChoice): Puzzle | undefined => {
  const fits = OFFLINE.filter(p => choice === 'daily' || choice === 'mix' || p.themes.includes(choice));
  const pool = fits.length ? fits : OFFLINE;
  const fresh = pool.filter(p => !seen.has(p.id));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)];
};

export const usePuzzles = create<PuzzleStore>((set, get) => {
  /** Counts a finished puzzle once: score, streak and one anonymous event. */
  const record = (s: PuzzleState) => {
    const result = resultOf(s);
    if (!result || recorded) return;
    recorded = true;
    const score = addResult(get().score, result);
    writeJson(SCORE_KEY, score);
    set({ score });
    track('puzzle_end', { result, rating_band: ratingBand(s.puzzle.rating), hint_used: s.hintUsed });
  };

  return {
    choice: 'mix',
    loading: false,
    offline: false,
    feedback: 'none',
    busy: false,
    syncToken: 0,
    score: { ...EMPTY_SCORE, ...readJson<Partial<PuzzleScore>>(SCORE_KEY, {}) },

    load: async choice => {
      const picked = choice ?? get().choice;
      const mine = ++requestNo;
      clearTimers();
      const leaving = get().state;
      if (leaving && leaving.status === 'solving' && !recorded && leaving.line.length + leaving.mistakes + leaving.hint > 0) {
        track('puzzle_end', { result: 'skipped', rating_band: ratingBand(leaving.puzzle.rating), hint_used: leaving.hintUsed });
      }
      set(st => ({ choice: picked, loading: true, feedback: 'none', busy: false, syncToken: st.syncToken + 1 }));
      let puzzle: Puzzle | undefined;
      try {
        puzzle = await fetchPuzzle(picked);
        // The daily puzzle is the same all day; "next" must not hand the same puzzle twice.
        if (puzzle && picked !== 'daily' && seen.has(puzzle.id)) puzzle = (await fetchPuzzle(picked)) ?? puzzle;
      } catch {
        puzzle = undefined;
      }
      if (mine !== requestNo) return;
      const offline = !puzzle;
      puzzle ??= fromOfflineSet(picked);
      if (!puzzle) {
        set({ loading: false, state: undefined, offline: true });
        return;
      }
      seen.add(puzzle.id);
      recorded = false;
      set(s => ({ state: startPuzzle(puzzle), loading: false, offline, feedback: 'none', syncToken: s.syncToken + 1 }));
      track('puzzle_start', { source: puzzle.source, theme: picked === 'daily' ? undefined : picked });
    },

    play: move => {
      const s = get().state;
      if (!s || get().loading || get().busy || s.status !== 'solving') return;
      const out = tryMove(s, move);
      if (out.outcome === 'wrong') {
        set(st => ({ state: out.afterMove, feedback: 'wrong', syncToken: st.syncToken + 1 }));
        return;
      }
      playMove(move.capture);
      if (!out.afterReply) {
        set({ state: out.afterMove, feedback: resultOf(out.afterMove) === 'first_try' ? 'solved_first' : 'solved' });
        record(out.afterMove);
        return;
      }
      // Show the solver's move, then let the opponent answer.
      set({ state: out.afterMove, feedback: 'correct', busy: true });
      const reply = out.afterReply;
      timers.push(
        window.setTimeout(() => {
          playMove(false);
          set({ state: reply, busy: false, feedback: reply.status === 'solved' ? (resultOf(reply) === 'first_try' ? 'solved_first' : 'solved') : 'correct' });
          record(reply);
        }, 500),
      );
    },

    rejected: () => set(st => ({ syncToken: st.syncToken + 1 })),

    hint: () => {
      const s = get().state;
      if (s && !get().loading && !get().busy) set({ state: takeHint(s), feedback: 'none' });
    },

    reveal: () => {
      const s = get().state;
      if (!s || get().loading || get().busy || s.status !== 'solving') return;
      const frames = revealSolution(s);
      set({ busy: true, feedback: 'revealed' });
      frames.forEach((frame, i) => {
        timers.push(
          window.setTimeout(() => {
            playMove(false);
            const last = i === frames.length - 1;
            set({ state: frame, busy: !last });
            if (last) record(frame);
          }, 650 * (i + 1)),
        );
      });
    },

    reset: () => {
      const s = get().state;
      if (!s || get().loading) return;
      clearTimers();
      // Starting over keeps what already happened: mistakes and help still count.
      set(st => ({
        state: { ...startPuzzle(s.puzzle), mistakes: s.mistakes, hintUsed: s.hintUsed },
        feedback: 'none',
        busy: false,
        syncToken: st.syncToken + 1,
      }));
    },
  };
});
