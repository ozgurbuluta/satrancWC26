import { useEffect, useState, useSyncExternalStore } from 'react';
import { STRINGS, type Strings } from './i18n';
import { cachedEval, cancelEval, requestEval, scoresVersion, subscribeScores, type EvalResult } from './lib/engine';
import { useStore } from './store';

export const useT = (): Strings => STRINGS[useStore(s => s.settings.lang)];

/** Re-renders the caller on an interval; used by clocks and countdowns only. */
export const useNow = (intervalMs: number, active = true): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active]);
  return now;
};

/** Live evaluation of a position (cloud first, local engine as fallback). */
export const useEval = (fen: string | undefined, enabled: boolean): EvalResult | undefined => {
  const lines = useStore(s => s.settings.engineLines);
  const [result, setResult] = useState<EvalResult | undefined>(() => (fen ? cachedEval(fen, lines) : undefined));
  useEffect(() => {
    if (!fen || !enabled) {
      setResult(undefined);
      return;
    }
    setResult(cachedEval(fen, lines));
    // Small debounce so stepping quickly through moves does not fire a request per move.
    const id = window.setTimeout(() => requestEval(fen, setResult, { useLocal: true, multiPv: lines }), 120);
    return () => {
      window.clearTimeout(id);
      cancelEval();
    };
  }, [fen, enabled, lines]);
  return result && result.fen === fen ? result : undefined;
};

export const useIsMobile = (): boolean => {
  const query = '(max-width: 900px)';
  const [mobile, setMobile] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
};

/** Re-renders the caller whenever a new position score is stored. */
export const useScoresVersion = (): number => useSyncExternalStore(subscribeScores, scoresVersion);

/** Follows a CSS media query. */
export const useMedia = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
};

/**
 * Gives the keyboard back to the page when the viewer presses anywhere on it.
 *
 * A click in the video hands the keyboard to the video's frame: arrow keys
 * then seek the video and never reach the board. A press on the page would
 * normally take the keyboard back, but the board cancels the press it
 * receives (it handles the drag itself), so the browser leaves the focus
 * where it was, in the frame. Any press the page sees is outside the frame,
 * so that is the moment to take the focus out of it. The press itself goes
 * on as usual: a button is still pressed, a piece is still picked up.
 */
export const useKeyboardBackFromFrames = (): void => {
  useEffect(() => {
    const reclaim = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLIFrameElement)) return;
      active.blur();
      window.focus();
    };
    // while the event travels down, before the board has had it
    window.addEventListener('pointerdown', reclaim, true);
    return () => window.removeEventListener('pointerdown', reclaim, true);
  }, []);
};

/** Three columns: win chance, guessing and time beside the board on the left, the broadcast and the tabs on the right. */
export const WIDE_LAYOUT = '(min-width: 1180px)';
/** Room in the top bar for one square per game. */
export const GAME_SQUARES = '(min-width: 1280px)';
