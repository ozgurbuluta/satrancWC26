import { useEffect, useRef } from 'react';
import { useScoresVersion, useT } from '../hooks';
import type { Strings } from '../i18n';
import type { MoveQuality } from '../lib/engine';
import { localizeSan } from '../lib/format';
import type { GameData } from '../lib/pgn';
import { judgePly, QUALITY_GLYPH } from '../lib/quality';
import { useStore } from '../store';

export const qualityLabel = (q: MoveQuality, t: Strings): string =>
  ({ best: t.qBest, good: t.qGood, inaccuracy: t.qInaccuracy, mistake: t.qMistake, blunder: t.qBlunder })[q];

interface Props {
  game: GameData;
  shown: number;
  /** Set while the board shows the viewer's own line: the half-move of the game it started from. */
  lineFrom?: number;
}

/** The moves of the game as a table (number, White, Black), with the opening's name and a mark on moves the engine thinks little of. */
export function MovesPanel({ game, shown, lineFrom }: Props) {
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
  // when the list is resized.
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

  const whiteStarts = game.initialFen.split(' ')[1] !== 'b';
  const firstMoveNo = Number(game.initialFen.split(' ')[5]) || 1;
  const plies = game.plies.slice(0, revealed);

  return (
    <div className="analysis">
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
              {/* a game that starts with Black to move: White's cell of the first row stays empty */}
              {!whiteMove && i === 0 && <span aria-hidden="true" />}
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
