import { useEffect, useRef } from 'react';
import { useT } from '../hooks';
import type { Strings } from '../i18n';
import type { EvalResult, PV } from '../lib/engine';
import { formatEval, localizeSan, pvToSan } from '../lib/format';
import type { GameData } from '../lib/pgn';
import { useStore } from '../store';

const verdict = (pv: PV | undefined, t: Strings): string => {
  if (!pv) return '';
  if (pv.mate !== undefined) return `${Math.abs(pv.mate)} ${t.mateIn}`;
  const cp = pv.cp ?? 0;
  const abs = Math.abs(cp);
  if (abs < 30) return t.equal;
  if (abs < 90) return cp > 0 ? t.whiteSlightly : t.blackSlightly;
  if (abs < 250) return cp > 0 ? t.whiteBetter : t.blackBetter;
  return cp > 0 ? t.whiteWinning : t.blackWinning;
};

interface Props {
  game: GameData;
  fen: string;
  shown: number;
  evaluation?: EvalResult;
}

export function AnalysisPanel({ game, fen, shown, evaluation }: Props) {
  const t = useT();
  const notation = useStore(s => s.settings.notation);
  const engineOn = useStore(s => s.settings.engine);
  const revealed = useStore(s => s.revealed);
  const setViewPly = useStore(s => s.setViewPly);
  const activeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the current move in view without moving the page itself. Also runs
  // when the list is resized (engine lines appearing change its height).
  useEffect(() => {
    const box = listRef.current;
    if (!box) return;
    const reveal = () => {
      const el = activeRef.current;
      if (!el) return;
      const top = el.offsetTop;
      if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight) {
        box.scrollTo({ top: Math.max(0, top - box.clientHeight / 2) });
      }
    };
    reveal();
    const ro = new ResizeObserver(reveal);
    ro.observe(box);
    return () => ro.disconnect();
  }, [shown, revealed]);

  const best = evaluation?.pvs[0];
  const whiteStarts = game.initialFen.split(' ')[1] !== 'b';
  const firstMoveNo = Number(game.initialFen.split(' ')[5]) || 1;
  const plies = game.plies.slice(0, revealed);

  return (
    <div className="analysis">
      <div className="engine-card">
        <div className="engine-head">
          <div className={`eval-big ${best && (best.mate ?? best.cp ?? 0) < 0 ? 'black-ahead' : ''}`}>
            {engineOn ? (best ? formatEval(best) : '…') : '–'}
          </div>
          <div className="engine-meta">
            <div className="verdict">{engineOn ? (best ? verdict(best, t) : t.thinking) : t.engineOff}</div>
            {evaluation && (
              <div className="engine-src">
                {evaluation.source === 'cloud' ? t.cloud : t.local} · {t.depth} {evaluation.depth}
              </div>
            )}
          </div>
        </div>
        {engineOn && evaluation && (
          <ol className="pv-list">
            {evaluation.pvs.map((pv, i) => (
              <li key={i}>
                <span className={`pv-eval ${(pv.mate ?? pv.cp ?? 0) < 0 ? 'neg' : 'pos'}`}>{formatEval(pv)}</span>
                <span className="pv-moves">
                  {pvToSan(fen, pv.moves, 9).map((m, j) => (
                    <span key={j}>
                      {m.label && <em>{m.label}</em>}
                      {localizeSan(m.san, notation)}{' '}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {game.opening && (
        <div className="opening">
          <span className="eco">{game.eco}</span>
          {game.opening}
        </div>
      )}

      <div className="move-list" ref={listRef}>
        {plies.length === 0 && <p className="muted">{t.noMoves}</p>}
        {plies.map((p, i) => {
          const whiteMove = (i % 2 === 0) === whiteStarts;
          const moveNo = firstMoveNo + Math.floor((i + (whiteStarts ? 0 : 1)) / 2);
          const active = i + 1 === shown;
          return (
            <span className="mv" key={i}>
              {(whiteMove || i === 0) && <span className="move-num">{whiteMove ? `${moveNo}.` : `${moveNo}…`}</span>}
              <button ref={active ? activeRef : undefined} className={`move ${active ? 'active' : ''}`} onClick={() => setViewPly(i + 1)}>
                {localizeSan(p.san, notation)}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
