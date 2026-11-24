import { useEffect, useState } from 'react';
import { STRINGS, type Strings } from './i18n';
import { cachedEval, cancelEval, requestEval, type EvalResult } from './lib/engine';
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
