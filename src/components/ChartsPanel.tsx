import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CHAMPION_FIDE_ID } from '../config';
import { useScoresVersion, useT } from '../hooks';
import { track } from '../lib/analytics';
import { moveTimes } from '../lib/clock';
import { fillScores, scoreOf, stopFillScores, winningChances } from '../lib/engine';
import { formatClock, formatEval, localizeSan, shortName } from '../lib/format';
import type { GameData } from '../lib/pgn';
import { judgePly, QUALITY_GLYPH, type PlyJudgement } from '../lib/quality';
import { useStore } from '../store';
import { qualityLabel } from './AnalysisPanel';

// Two-series palette validated for the dark surface (colour-blind safe, >= 3:1).
const SERIES_A = '#3987e5';
const SERIES_B = '#d95926';
const STATUS_SERIOUS = '#ec835a';
const STATUS_CRITICAL = '#d03b3b';

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
              <circle className="ring" cx={x(shown)} cy={y(pts[shown]!)} r={4.5} fill="#f4f3ef" />
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

/** Thinking time per move: the White player's columns go up, the Black player's go down. */
function TimeChart({ game, shown, revealed }: ChartProps) {
  const t = useT();
  const notation = useStore(s => s.settings.notation);
  const setViewPly = useStore(s => s.setViewPly);
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  // seconds spent on each ply; unknown where the clock readings or the time control do not say
  const spent = useMemo(() => moveTimes(game, revealed), [game, revealed]);

  const hasData = spent.some(v => v !== undefined);
  // Colour follows the player, not the piece colour, so it stays the same from game to game.
  const whiteColor = game.white.fideId === CHAMPION_FIDE_ID ? SERIES_A : game.black.fideId === CHAMPION_FIDE_ID ? SERIES_B : SERIES_A;
  const blackColor = whiteColor === SERIES_A ? SERIES_B : SERIES_A;

  const H = 170;
  const pad = { l: 34, r: 6, t: 8, b: 8 };
  const plotW = Math.max(10, width - pad.l - pad.r);
  const half = (H - pad.t - pad.b) / 2;
  const base = pad.t + half;
  const moves = Math.max(1, Math.ceil(revealed / 2));
  const band = plotW / moves;
  const barW = Math.max(1, Math.min(24, band - 2));
  const maxSec = Math.max(60, ...spent.map(v => v ?? 0));
  const niceMin = [1, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120].find(m => m * 60 >= maxSec) ?? Math.ceil(maxSec / 60);
  const scale = half / (niceMin * 60);
  const r = Math.min(4, barW / 2);

  const column = (i: number) => {
    const v = spent[i];
    if (!v) return null;
    const m = Math.floor(i / 2);
    const up = i % 2 === 0;
    const h = Math.max(1, v * scale);
    const x0 = pad.l + m * band + (band - barW) / 2;
    const x1 = x0 + barW;
    const rr = Math.min(r, h);
    // rounded at the data end, square at the baseline
    const d = up
      ? `M${x0},${base} V${base - h + rr} Q${x0},${base - h} ${x0 + rr},${base - h} H${x1 - rr} Q${x1},${base - h} ${x1},${base - h + rr} V${base} Z`
      : `M${x0},${base} V${base + h - rr} Q${x0},${base + h} ${x0 + rr},${base + h} H${x1 - rr} Q${x1},${base + h} ${x1},${base + h - rr} V${base} Z`;
    const dim = hover !== null && hover !== m;
    return <path key={i} d={d} fill={up ? whiteColor : blackColor} opacity={dim ? 0.45 : 1} />;
  };

  const longest = spent
    .map((v, i) => ({ v: v ?? 0, i }))
    .filter(e => e.v >= 60)
    .sort((a, b) => b.v - a.v)
    .slice(0, 5);

  if (!hasData) return <p className="muted small">{t.noClock}</p>;

  const onMove = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const m = Math.floor((e.clientX - rect.left - pad.l) / band);
    setHover(m >= 0 && m < moves ? m : null);
  };
  const shownMove = shown > 0 ? Math.floor((shown - 1) / 2) : -1;

  return (
    <>
      <div className="legend">
        <span>
          <i style={{ background: whiteColor }} /> {shortName(game.white)} <span className="muted">({t.white})</span>
        </span>
        <span>
          <i style={{ background: blackColor }} /> {shortName(game.black)} <span className="muted">({t.black})</span>
        </span>
      </div>
      <div className="chart" ref={ref}>
        {width > 0 && (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={t.timeChart}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onClick={() => {
              if (hover === null) return;
              setViewPly(Math.min(revealed, hover * 2 + 1));
              track('chart_jump', { chart: 'time' });
            }}
          >
            <line className="grid" x1={pad.l} x2={pad.l + plotW} y1={pad.t} y2={pad.t} />
            <line className="grid" x1={pad.l} x2={pad.l + plotW} y1={pad.t + 2 * half} y2={pad.t + 2 * half} />
            <line className="grid zero" x1={pad.l} x2={pad.l + plotW} y1={base} y2={base} />
            <text className="tick" x={pad.l - 5} y={pad.t + 9} textAnchor="end">
              {niceMin} {t.minutes}
            </text>
            <text className="tick" x={pad.l - 5} y={base + 3} textAnchor="end">
              0
            </text>
            <text className="tick" x={pad.l - 5} y={pad.t + 2 * half - 1} textAnchor="end">
              {niceMin} {t.minutes}
            </text>
            {shownMove >= 0 && <rect className="band" x={pad.l + shownMove * band} y={pad.t} width={band} height={2 * half} />}
            {spent.map((_, i) => column(i))}
          </svg>
        )}
        {hover !== null && (
          <div className="tip" style={{ left: Math.max(4, Math.min(width - 170, pad.l + hover * band + band + 6)) }}>
            <span className="muted">
              {t.move} {hover + 1}
            </span>
            {[hover * 2, hover * 2 + 1].map(i =>
              game.plies[i] && i < revealed ? (
                <span key={i} className="tip-row">
                  <i style={{ background: i % 2 === 0 ? whiteColor : blackColor }} />
                  <b>{spent[i] !== undefined ? formatClock(spent[i]) : '–'}</b> {localizeSan(game.plies[i].san, notation)}
                </span>
              ) : null,
            )}
          </div>
        )}
      </div>
      {longest.length > 0 && (
        <>
          <h4>{t.longest}</h4>
          <ol className="rows">
            {longest.map(e => (
              <li key={e.i}>
                <button
                  onClick={() => {
                    setViewPly(e.i + 1);
                    track('chart_jump', { chart: 'longest_think' });
                  }}
                >
                  <span className="row-main">{moveLabel(game, e.i, localizeSan(game.plies[e.i].san, notation))}</span>
                  <span className="muted">{shortName(e.i % 2 === 0 ? game.white : game.black)}</span>
                  <b>{formatClock(e.v)}</b>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

export function ChartsPanel({ game, shown }: { game: GameData; shown: number }) {
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

      <section>
        <h3>{t.timeChart}</h3>
        <TimeChart game={game} shown={shown} revealed={revealed} />
      </section>
    </div>
  );
}
