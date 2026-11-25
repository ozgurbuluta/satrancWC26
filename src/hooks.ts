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
  const [result, setResult] = useState<EvalResult | undefined>(() => (fen ? cachedEval(fen) : undefined));
  useEffect(() => {
    if (!fen || !enabled) {
      setResult(undefined);
      return;
    }
    setResult(cachedEval(fen));
    // Small debounce so stepping quickly through moves does not fire a request per move.
    const id = window.setTimeout(() => requestEval(fen, setResult, { useLocal: true }), 120);
    return () => {
      window.clearTimeout(id);
      cancelEval();
    };
  }, [fen, enabled]);
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

/** Width of the game list beside the board and the gap after it. The same numbers are in styles.css. */
const RAIL_SPACE = 212;

/**
 * Whether the game list fits beside the board without making the board
 * smaller. The board column wants `max(320px, viewport height - 258px)`;
 * the list is shown only when that much is left after the list, the divider
 * and the side column. Otherwise the list lives in a drawer.
 */
export const railFits = (width: number, height: number, sideWidth?: number): boolean => {
  if (width <= 900) return false;
  // 0 or nothing: the side column has not been resized and follows its own rule in styles.css
  const side = sideWidth && sideWidth > 0 ? sideWidth : Math.max(360, Math.min(580, width * 0.36));
  const wanted = Math.max(320, height - 258);
  const available = width - 32 - RAIL_SPACE - 12 - side;
  return available >= wanted;
};

export const useRailFits = (sideWidth?: number): boolean => {
  const [size, setSize] = useState(() => [window.innerWidth, window.innerHeight]);
  useEffect(() => {
    const on = () => setSize([window.innerWidth, window.innerHeight]);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return railFits(size[0], size[1], sideWidth);
};
