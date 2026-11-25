import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useScoresVersion, useT } from '../hooks';
import { track } from '../lib/analytics';
import { fillScores, scoreOf, stopFillScores, winningChances } from '../lib/engine';
import { formatEval, localizeSan } from '../lib/format';
import type { GameData } from '../lib/pgn';
import { judgePly, QUALITY_GLYPH, type PlyJudgement } from '../lib/quality';
import { useStore } from '../store';
import { qualityLabel } from './AnalysisPanel';
import { TimePanel } from './TimePanel';

// Line and marker colours for the light surface (each at least 3:1 against it).
const SERIES_A = '#2f6fb7';
const STATUS_SERIOUS = '#c8641c';
const STATUS_CRITICAL = '#b3261e';

const useWidth = (): [React.RefObject<HTMLDivElement | null>, number] => {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
};

const moveLabel = (game: GameData, i: number, san: string) => {
  const whiteStarts = game.initialFen.split(' ')[1] !== 'b';
  const first = Number(game.initialFen.split(' ')[5]) || 1;
  const no = first + Math.floor((i + (whiteStarts ? 0 : 1)) / 2);
  const white = (i % 2 === 0) === whiteStarts;
  return `${no}${white ? '.' : '…'} ${san}`;
};

interface ChartProps {
  game: GameData;
  shown: number;
  revealed: number;
}

/** White's winning chances after every move. Single series, so the title names it. */
function EvalChart({ game, shown, revealed, judged }: ChartProps & { judged: (PlyJudgement | undefined)[] }) {
  const t = useT();
  const notation = useStore(s => s.settings.notation);
  const setViewPly = useStore(s => s.setViewPly);
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = 150;
  const pad = { l: 6, r: 6, t: 10, b: 20 };
  const plotW = Math.max(10, width - pad.l - pad.r);
  const plotH = H - pad.t - pad.b;
  const n = Math.max(revealed, 1);
  const x = (i: number) => pad.l + (i / n) * plotW;
  const y = (wc: number) => pad.t + ((1 - wc) / 2) * plotH;
  const zeroY = y(0);

  // index 0 is the starting position, index i the position after ply i
  const pts: (number | undefined)[] = [];
  for (let i = 0; i <= revealed; i++) {
    const s = scoreOf(i === 0 ? game.initialFen : game.plies[i - 1].fen);
    pts.push(s ? winningChances(s) : undefined);
  }
  // one path per unbroken run of known points
  const runs: number[][] = [];
  let run: number[] = [];
  pts.forEach((v, i) => {
    if (v === undefined) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(i);
  });
  if (run.length) runs.push(run);

  const onMove = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left - pad.l) / plotW) * n);
    setHover(Math.max(0, Math.min(revealed, i)));
  };

  const ticks: number[] = [];
  const stepMoves = revealed > 120 ? 20 : 10;
  for (let m = stepMoves; m * 2 <= revealed; m += stepMoves) ticks.push(m);
  const hv = hover !== null ? pts[hover] : undefined;
  const hoverScore = hover !== null ? scoreOf(hover === 0 ? game.initialFen : game.plies[hover - 1].fen) : undefined;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={t.evalChartSub}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onClick={() => {
            if (hover === null) return;
            setViewPly(hover);
            track('chart_jump', { chart: 'eval' });
          }}
        >
          <line className="grid" x1={pad.l} x2={pad.l + plotW} y1={y(1)} y2={y(1)} />
          <line className="grid" x1={pad.l} x2={pad.l + plotW} y1={y(-1)} y2={y(-1)} />
          <line className="grid zero" x1={pad.l} x2={pad.l + plotW} y1={zeroY} y2={zeroY} />
          {ticks.map(m => (
            <text key={m} className="tick" x={x(m * 2)} y={H - 5} textAnchor="middle">
              {m}
            </text>
          ))}
          <text className="tick" x={pad.l + 2} y={pad.t + 10}>
            {t.whiteAdv}
          </text>
          <text className="tick" x={pad.l + 2} y={pad.t + plotH - 4}>
            {t.blackAdv}
          </text>
          {runs.map((r, k) => {
            const line = r.map((i, j) => `${j ? 'L' : 'M'}${x(i).toFixed(1)},${y(pts[i]!).toFixed(1)}`).join(' ');
            const area = `${line} L${x(r[r.length - 1]).toFixed(1)},${zeroY} L${x(r[0]).toFixed(1)},${zeroY} Z`;
            return (
              <g key={k}>
                <path d={area} fill={SERIES_A} opacity={0.1} />
                <path d={line} fill="none" stroke={SERIES_A} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            );
          })}
          {judged.map((j, i) =>
            j && (j.quality === 'mistake' || j.quality === 'blunder') && pts[i + 1] !== undefined ? (
              <circle
                key={i}
                className="ring"
                cx={x(i + 1)}
                cy={y(pts[i + 1]!)}
                r={4}
                fill={j.quality === 'blunder' ? STATUS_CRITICAL : STATUS_SERIOUS}
              />
            ) : null,
          )}
          {pts[shown] !== undefined && (
            <>
              <line className="cursor" x1={x(shown)} x2={x(shown)} y1={pad.t} y2={pad.t + plotH} />
              <circle className="ring" cx={x(shown)} cy={y(pts[shown]!)} r={4.5} fill="var(--text)" />
            </>
          )}
          {hover !== null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + plotH} />}
        </svg>
      )}
      {hover !== null && (
        <div className="tip" style={{ left: Math.max(4, Math.min(width - 150, x(hover) + 8)) }}>
          <b>{hv !== undefined && hoverScore ? formatEval(hoverScore) : '–'}</b>
          <span>{hover === 0 ? '0.' : moveLabel(game, hover - 1, localizeSan(game.plies[hover - 1].san, notation))}</span>
        </div>
      )}
    </div>
  );
}

/** `withTime`: also show the time per move here, on screens where it has no place of its own beside the board. */
export function ChartsPanel({ game, shown, withTime }: { game: GameData; shown: number; withTime: boolean }) {
  const t = useT();
  const notation = useStore(s => s.settings.notation);
  const revealed = useStore(s => s.revealed);
  const setViewPly = useStore(s => s.setViewPly);
  useScoresVersion();

  // Score every position the viewer has seen; hidden moves are never analysed.
  useEffect(() => {
    void fillScores([game.initialFen, ...game.plies.slice(0, revealed).map(p => p.fen)]);
    return () => stopFillScores();
  }, [game, revealed]);

  const judged: (PlyJudgement | undefined)[] = [];
  let scored = scoreOf(game.initialFen) ? 1 : 0;
  for (let i = 0; i < revealed; i++) {
    judged.push(judgePly(game, i));
    if (scoreOf(game.plies[i].fen)) scored++;
  }
  const moments = judged
    .map((j, i) => ({ j, i }))
    .filter((e): e is { j: PlyJudgement; i: number } => !!e.j && e.j.loss >= 0.1)
    .sort((a, b) => b.j.loss - a.j.loss)
    .slice(0, 10)
    .sort((a, b) => a.i - b.i);

  return (
    <div className="charts">
      <section>
        <h3>
          {t.evalChart}
          {scored < revealed + 1 && <span className="muted small"> · {t.calculating.replace('{a}', String(scored)).replace('{b}', String(revealed + 1))}</span>}
        </h3>
        <p className="muted small sub">{t.evalChartSub}</p>
        <EvalChart game={game} shown={shown} revealed={revealed} judged={judged} />
      </section>

      <section>
        <h3>{t.keyMoments}</h3>
        {moments.length === 0 ? (
          <p className="muted small">{t.noKeyMoments}</p>
        ) : (
          <ol className="rows">
            {moments.map(({ j, i }) => (
              <li key={i}>
                <button
                  onClick={() => {
                    setViewPly(i + 1);
                    track('chart_jump', { chart: 'key_moment', quality: j.quality });
                  }}
                >
                  <span className={`glyph-box g-${j.quality}`}>{QUALITY_GLYPH[j.quality]}</span>
                  <span className="row-main">{moveLabel(game, i, localizeSan(game.plies[i].san, notation))}</span>
                  <span className="muted">{qualityLabel(j.quality, t)}</span>
                  <b>
                    {formatEval(j.before)} → {formatEval(j.after)}
                  </b>
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="muted small">{t.approx}</p>
      </section>

      {withTime && <TimePanel game={game} shown={shown} />}
    </div>
  );
}
