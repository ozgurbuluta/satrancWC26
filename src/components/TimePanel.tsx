import { useLayoutEffect, useMemo, useState } from 'react';
import { KNOWN_PLAYERS } from '../config';
import { useT } from '../hooks';
import { track } from '../lib/analytics';
import { formatDuration, moveTimes } from '../lib/clock';
import { fedFlag, localizeSan, shortName } from '../lib/format';
import type { GameData, PlayerInfo } from '../lib/pgn';
import { samePlayer, selectScore, useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';

/**
 * The width of an element that may not be on the page yet. The chart is only
 * drawn once there is something to draw, so the element is followed from the
 * moment it appears, not from the moment the panel does.
 */
const useWidth = (): [(el: HTMLDivElement | null) => void, number] => {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!el) {
      setW(0);
      return;
    }
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
};

const GUTTER = 30;
const NICE_MINUTES = [1, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120];

interface Props {
  game: GameData;
  /** Half-moves of the game on the board, to mark the move being looked at. */
  shown: number;
}

/**
 * Time spent on each move, one row per move: one player's bars run to the
 * left, the other's to the right. Each player keeps their side and colour
 * from game to game. Only real clock data is drawn. A move whose time is not
 * known gets a small hollow mark, never a bar of zero.
 */
export function TimePanel({ game, shown }: Props) {
  const t = useT();
  const notation = useStore(s => s.settings.notation);
  const revealed = useStore(s => s.revealed);
  const feds = useStore(s => s.feds);
  const setViewPly = useStore(s => s.setViewPly);
  const score = useStore(useShallow(selectScore));
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  const spent = useMemo(() => moveTimes(game, revealed), [game, revealed]);
  const units = { h: t.hoursShort, m: t.minutes, s: t.seconds };
  const whiteStarts = game.initialFen.split(' ')[1] !== 'b';
  const firstMoveNo = Number(game.initialFen.split(' ')[5]) || 1;
  // The champion's side of the match score is the left side here too; without a score, White is.
  const leftIsWhite = score ? samePlayer(game.white, score.a) : true;
  const left = leftIsWhite ? game.white : game.black;
  const right = leftIsWhite ? game.black : game.white;
  const isWhitePly = (i: number) => (i % 2 === 0) === whiteStarts;
  const onLeft = (i: number) => isWhitePly(i) === leftIsWhite;
  const rowOf = (i: number) => Math.floor((i + (whiteStarts ? 0 : 1)) / 2);
  const moveLabel = (i: number) => `${firstMoveNo + rowOf(i)}${isWhitePly(i) ? '.' : '…'} ${localizeSan(game.plies[i].san, notation)}`;
  const flag = (p: PlayerInfo) => fedFlag(p.fideId ? (feds[p.fideId] ?? KNOWN_PLAYERS[p.fideId]?.fed) : undefined);

  const known = spent.filter((v): v is number => v !== undefined);
  const unknown = spent.length - known.length;
  const longest = (side: 'left' | 'right') => {
    let best: { i: number; v: number } | undefined;
    spent.forEach((v, i) => {
      if (v === undefined || onLeft(i) !== (side === 'left')) return;
      if (!best || v > best.v) best = { i, v };
    });
    return best;
  };
  const longestLeft = longest('left');
  const longestRight = longest('right');

  const rows = revealed > 0 ? rowOf(revealed - 1) + 1 : 0;
  // Few moves get comfortable rows; a long game is drawn tighter so it still fits without scrolling.
  const rowH = rows <= 22 ? 12 : rows <= 45 ? 7 : Math.max(3, Math.floor(330 / rows));
  const top = 4;
  const H = top + rows * rowH + 22;
  const half = Math.max(10, (width - GUTTER) / 2);
  const maxSec = Math.max(60, ...known);
  const niceMin = NICE_MINUTES.find(m => m * 60 >= maxSec) ?? Math.ceil(maxSec / 60);
  const scale = (half - 2) / (niceMin * 60);
  const centre = width / 2;
  const labelEvery = rows <= 12 ? 1 : rows <= 30 ? 5 : 10;
  const shownPly = shown > 0 ? shown - 1 : -1;

  const plyAt = (e: React.MouseEvent): number | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const row = Math.floor((e.clientY - rect.top - top) / rowH);
    if (row < 0 || row >= rows) return null;
    const wantLeft = e.clientX - rect.left < centre;
    for (const i of [row * 2 - (whiteStarts ? 0 : 1), row * 2 + (whiteStarts ? 1 : 0)]) {
      if (i >= 0 && i < revealed && onLeft(i) === wantLeft) return i;
    }
    return null;
  };

  const summary = (who: PlayerInfo, best: { i: number; v: number } | undefined, side: 'left' | 'right') => (
    <div className={`think ${side}`}>
      <span className="think-who">{shortName(who)}</span>
      {best && best.v > 0 ? (
        <button
          type="button"
          className="think-pick"
          onClick={() => {
            setViewPly(best.i + 1);
            track('chart_jump', { chart: 'longest_think' });
          }}
          aria-label={`${shortName(who)}, ${t.longestThink}: ${formatDuration(best.v, units)}, ${moveLabel(best.i)}`}
        >
          <b>{formatDuration(best.v, units)}</b>
          <span className="muted">{moveLabel(best.i)}</span>
        </button>
      ) : (
        <span className="muted">–</span>
      )}
    </div>
  );

  return (
    <section className="card time-panel" aria-label={t.timeChart}>
      <h2 className="eyebrow">{t.timePerMove}</h2>
      {known.length === 0 ? (
        <p className="muted">{revealed === 0 ? t.noMoves : t.noClock}</p>
      ) : (
        <>
          <div className="time-who">
            <span>
              <i className="bar-key a" aria-hidden="true" />
              <span aria-hidden="true">{flag(left)}</span> {shortName(left)}
              <i className={`dot ${leftIsWhite ? 'white' : 'black'}`} title={leftIsWhite ? t.white : t.black} />
            </span>
            <span>
              <i className={`dot ${leftIsWhite ? 'black' : 'white'}`} title={leftIsWhite ? t.black : t.white} />
              {shortName(right)} <span aria-hidden="true">{flag(right)}</span>
              <i className="bar-key b" aria-hidden="true" />
            </span>
          </div>
          <div className="time-chart" ref={ref}>
            {width > 0 && (
              <svg
                width={width}
                height={H}
                role="img"
                aria-label={[
                  t.timeChart,
                  longestLeft ? `${shortName(left)}: ${formatDuration(longestLeft.v, units)} (${moveLabel(longestLeft.i)})` : '',
                  longestRight ? `${shortName(right)}: ${formatDuration(longestRight.v, units)} (${moveLabel(longestRight.i)})` : '',
                ]
                  .filter(Boolean)
                  .join('. ')}
                onPointerMove={e => setHover(plyAt(e))}
                onPointerLeave={() => setHover(null)}
                onClick={e => {
                  const i = plyAt(e);
                  if (i === null) return;
                  setViewPly(i + 1);
                  track('chart_jump', { chart: 'time' });
                }}
              >
                {/* how far a bar can reach, and half of that */}
                {[0.5, 1].map(f => (
                  <g key={f}>
                    <line className="grid" x1={centre - GUTTER / 2 - f * (half - 2)} x2={centre - GUTTER / 2 - f * (half - 2)} y1={top} y2={top + rows * rowH} />
                    <line className="grid" x1={centre + GUTTER / 2 + f * (half - 2)} x2={centre + GUTTER / 2 + f * (half - 2)} y1={top} y2={top + rows * rowH} />
                  </g>
                ))}
                {shownPly >= 0 && <rect className="band" x={0} y={top + rowOf(shownPly) * rowH} width={width} height={rowH} />}
                {Array.from({ length: rows }, (_, r) =>
                  (r + 1) % labelEvery === 0 || r === 0 ? (
                    <text key={r} className="tick" x={centre} y={top + r * rowH + rowH / 2 + 3.5} textAnchor="middle">
                      {firstMoveNo + r}
                    </text>
                  ) : null,
                )}
                {spent.map((v, i) => {
                  const y = top + rowOf(i) * rowH + (rowH > 5 ? 1.5 : 0.5);
                  const h = Math.max(1.5, rowH - (rowH > 5 ? 3 : 1));
                  const leftSide = onLeft(i);
                  const edge = leftSide ? centre - GUTTER / 2 : centre + GUTTER / 2;
                  const here = i === shownPly;
                  if (v === undefined) {
                    // not known: a small hollow mark, so it cannot be mistaken for a move that took no time
                    return rowH >= 5 ? (
                      <rect key={i} className="unknown" x={leftSide ? edge - 5 : edge} y={y + 0.5} width={5} height={Math.max(1, h - 1)} rx={1.5}>
                        <title>{`${moveLabel(i)}: ${t.timeUnknownOne}`}</title>
                      </rect>
                    ) : null;
                  }
                  const w = Math.max(1.5, v * scale);
                  return (
                    <rect
                      key={i}
                      className={`bar ${leftSide ? 'a' : 'b'} ${here ? 'here' : ''} ${hover !== null && hover !== i ? 'dim' : ''}`}
                      x={leftSide ? edge - w : edge}
                      y={y}
                      width={w}
                      height={h}
                      rx={Math.min(h / 2, 4)}
                    />
                  );
                })}
                <text className="tick" x={centre - GUTTER / 2 - (half - 2)} y={H - 6} textAnchor="start">
                  {niceMin} {t.minutes}
                </text>
                <text className="tick" x={centre} y={H - 6} textAnchor="middle">
                  0
                </text>
                <text className="tick" x={centre + GUTTER / 2 + (half - 2)} y={H - 6} textAnchor="end">
                  {niceMin} {t.minutes}
                </text>
              </svg>
            )}
            {hover !== null && game.plies[hover] && (
              <div className={`tip ${onLeft(hover) ? 'at-left' : 'at-right'}`} style={{ top: Math.max(0, top + rowOf(hover) * rowH - 30) }}>
                <b>{spent[hover] !== undefined ? formatDuration(spent[hover]!, units) : t.timeUnknownOne}</b>
                <span>{moveLabel(hover)}</span>
              </div>
            )}
          </div>
          {unknown > 0 && <p className="muted small">{t.timeUnknown.replace('{n}', String(unknown))}</p>}
          <h3 className="eyebrow think-title">{t.longestThink}</h3>
          <div className="think-row">
            {summary(left, longestLeft, 'left')}
            {summary(right, longestRight, 'right')}
          </div>
        </>
      )}
    </section>
  );
}
