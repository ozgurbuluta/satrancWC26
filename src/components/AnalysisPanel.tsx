import { useEffect, useRef } from 'react';
import { useScoresVersion, useT } from '../hooks';
import type { Strings } from '../i18n';
import { wdl, winningChances, type EvalResult, type MoveQuality, type PV } from '../lib/engine';
import { formatEval, localizeSan, pvToSan, shortName } from '../lib/format';
import type { GameData } from '../lib/pgn';
import { judgePly, QUALITY_GLYPH } from '../lib/quality';
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

export const qualityLabel = (q: MoveQuality, t: Strings): string =>
  ({ best: t.qBest, good: t.qGood, inaccuracy: t.qInaccuracy, mistake: t.qMistake, blunder: t.qBlunder })[q];

const pct = (x: number) => `${Math.round(x * 100)}%`;

interface Props {
  game: GameData;
  /** Position on the board: the game's, or the one reached in the viewer's own line. */
  fen: string;
  shown: number;
  evaluation?: EvalResult;
  /** Set while the board shows the viewer's own line: the half-move of the game it started from. */
  lineFrom?: number;
}

export function AnalysisPanel({ game, fen, shown, evaluation, lineFrom }: Props) {
  const t = useT();
  const notation = useStore(s => s.settings.notation);
  const engineOn = useStore(s => s.settings.engine);
  const inLine = lineFrom !== undefined;
  const revealed = useStore(s => s.revealed);
  const setViewPly = useStore(s => s.setViewPly);
  const paused = useStore(s => s.paused);
  const activeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useScoresVersion();

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
  }, [shown, revealed, lineFrom]);

  const best = evaluation?.pvs[0];
  const whiteStarts = game.initialFen.split(' ')[1] !== 'b';
  const firstMoveNo = Number(game.initialFen.split(' ')[5]) || 1;
  const plies = game.plies.slice(0, revealed);
  const whiteToMove = fen.split(' ')[1] !== 'b';
  const mover = whiteToMove ? game.white : game.black;

  const split = wdl(best);
  // The note on the last move is about the game; it has no place next to a line of the viewer's own.
  const lastJudged = !inLine && shown > 0 ? judgePly(game, shown - 1) : undefined;
  const lastPly = !inLine && shown > 0 ? game.plies[shown - 1] : undefined;
  const lastMoveNo = firstMoveNo + Math.floor((shown - 1 + (whiteStarts ? 0 : 1)) / 2);
  const lastWasWhite = ((shown - 1) % 2 === 0) === whiteStarts;

  // "Only move" when the second-best line gives away a lot for the side to move.
  let tension: { critical: boolean; text: string } | undefined;
  if (engineOn && evaluation && evaluation.pvs.length >= 2) {
    const sign = whiteToMove ? 1 : -1;
    const gap = (winningChances(evaluation.pvs[0]) - winningChances(evaluation.pvs[1])) * sign;
    const bestSan = pvToSan(fen, evaluation.pvs[0].moves, 1)[0]?.san;
    if (gap >= 0.2 && bestSan) {
      tension = { critical: true, text: t.onlyMove.replace('{player}', shortName(mover)).replace('{move}', localizeSan(bestSan, notation)) };
    } else {
      tension = { critical: false, text: t.fewMoves.replace('{player}', shortName(mover)) };
    }
  }

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

        {engineOn && best && (
          <div className="wdl" title={t.wdlNote}>
            <div className="wdl-head">
              <span>{t.whoWins}</span>
              <span className="muted small">{t.wdlNote}</span>
            </div>
            <div className="wdl-bar" role="img" aria-label={`${shortName(game.white)} ${pct(split.win)}, ${t.draw} ${pct(split.draw)}, ${shortName(game.black)} ${pct(split.loss)}`}>
              <i className="w" style={{ flexGrow: Math.max(split.win, 0.001) }} />
              <i className="d" style={{ flexGrow: Math.max(split.draw, 0.001) }} />
              <i className="b" style={{ flexGrow: Math.max(split.loss, 0.001) }} />
            </div>
            <div className="wdl-legend">
              <span>
                <i className="sw w" /> {shortName(game.white)} <b>{pct(split.win)}</b>
              </span>
              <span>
                <i className="sw d" /> {t.draw} <b>{pct(split.draw)}</b>
              </span>
              <span>
                <i className="sw b" /> {shortName(game.black)} <b>{pct(split.loss)}</b>
              </span>
            </div>
          </div>
        )}

        {engineOn && (lastPly || tension) && (
          <div className="note">
            {lastPly && lastJudged && (
              <p>
                <span className={`q q-${lastJudged.quality}`}>{qualityLabel(lastJudged.quality, t)}</span>
                <b>
                  {lastWasWhite ? `${lastMoveNo}.` : `${lastMoveNo}…`} {localizeSan(lastPly.san, notation)}
                  {QUALITY_GLYPH[lastJudged.quality] && lastJudged.quality !== 'best' ? QUALITY_GLYPH[lastJudged.quality] : ''}
                </b>
                {lastJudged.loss >= 0.1 && (
                  <span className="muted">
                    {' '}
                    · {t.evalWent.replace('{a}', formatEval(lastJudged.before)).replace('{b}', formatEval(lastJudged.after))}
                  </span>
                )}
              </p>
            )}
            {tension && (
              <p>
                <span className={`q ${tension.critical ? 'q-critical' : 'q-calm'}`}>{tension.critical ? t.critical : t.calm}</span>
                {tension.text}
              </p>
            )}
          </div>
        )}
      </div>

      {game.opening && !paused && (
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
          // While the board shows an own line, the game move it started after is marked instead of an active one.
          const active = !inLine && i + 1 === shown;
          const branch = inLine && i + 1 === lineFrom;
          const judged = engineOn ? judgePly(game, i) : undefined;
          const glyph = judged && judged.quality !== 'best' ? QUALITY_GLYPH[judged.quality] : '';
          return (
            <span className="mv" key={i}>
              {(whiteMove || i === 0) && <span className="move-num">{whiteMove ? `${moveNo}.` : `${moveNo}…`}</span>}
              <button
                ref={active || branch ? activeRef : undefined}
                className={`move ${active ? 'active' : ''} ${branch ? 'branch' : ''}`}
                onClick={() => setViewPly(i + 1)}
                title={branch ? t.branchHere : judged && glyph ? qualityLabel(judged.quality, t) : undefined}
              >
                {localizeSan(p.san, notation)}
                {glyph && <span className={`glyph g-${judged!.quality}`}>{glyph}</span>}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
