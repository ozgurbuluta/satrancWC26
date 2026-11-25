import { useMemo } from 'react';
import { REPO_URL } from '../config';
import model from '../data/predictor.json';
import { useT } from '../hooks';
import { trackOutbound } from '../lib/analytics';
import { localizeSan, shortName } from '../lib/format';
import type { GameData } from '../lib/pgn';
import { predict, shares, type PredictorModel } from '../lib/predictor/model';
import { clocksAt, referencesHeld, selectStakes, useStore } from '../store';

const MODEL = model as unknown as PredictorModel & {
  report: { selection: { selected: number }; split: { test: { games: number } }; shown: { n: number; top1: number; top3: number; whenSure: { n: number; said: number; happened: number } } };
};
const DOCS = `${REPO_URL}/blob/main/docs/PREDICTOR.md`;
const whole = (x: number) => String(Math.round(x * 100));

interface Props {
  game: GameData;
  /** The newest visible position of the game: what the estimate is about, whatever the board shows. */
  fen: string;
}

/**
 * The site's own estimate of the next move: three legal moves with a share
 * each, and the rest as "other". It is an experimental model fitted on the
 * two players' earlier games; what it can and cannot do is in the details
 * under it, in numbers that were measured.
 *
 * It only ever uses what the viewer has been shown: the visible position,
 * the visible clock, and the match score before this game. It is display
 * only: nothing here makes a guess or moves a piece.
 */
export function ModelEstimate({ game, fen }: Props) {
  const t = useT();
  const notation = useStore(s => s.settings.notation);
  const revealed = useStore(s => s.revealed);
  const resultVisible = useStore(s => s.resultVisible);
  const held = useStore(referencesHeld);
  const peekEngine = useStore(s => s.peekEngine);

  const whiteToMove = fen.split(' ')[1] !== 'b';
  const mover = whiteToMove ? game.white : game.black;
  const opponent = whiteToMove ? game.black : game.white;
  // The reading after the mover's last visible move. It does not tick here: the estimate changes with moves, not with seconds.
  const secondsLeft = clocksAt(game, revealed, false, 0)[whiteToMove ? 'white' : 'black'];
  const lastMove = revealed > 0 ? game.plies[revealed - 1]?.uci : undefined;
  const ownLastMove = revealed > 1 ? game.plies[revealed - 2]?.uci : undefined;
  // The match before this game, as three plain numbers, so the estimate is only worked out again when one of them changes.
  const pointsOf = (id: string | undefined) => (s: Parameters<typeof selectStakes>[0]) => {
    const stakes = selectStakes(s);
    return stakes && id ? (stakes.points[id] ?? 0) : undefined;
  };
  const moverPoints = useStore(pointsOf(mover.fideId));
  const opponentPoints = useStore(pointsOf(opponent.fideId));
  const gamesLeft = useStore(s => selectStakes(s)?.gamesLeft);

  const prediction = useMemo(
    () =>
      predict(MODEL, {
        fen,
        lastMove,
        ownLastMove,
        moverId: mover.fideId,
        secondsLeft,
        match: moverPoints !== undefined && opponentPoints !== undefined && gamesLeft !== undefined ? { moverPoints, opponentPoints, gamesLeft } : undefined,
      }),
    [fen, lastMove, ownLastMove, mover.fideId, secondsLeft, moverPoints, opponentPoints, gamesLeft],
  );
  const shown = useMemo(() => shares(prediction), [prediction]);
  const moveNo = `${Number(fen.split(' ')[5]) || 1}${whiteToMove ? '.' : '…'}`;
  const report = MODEL.report;

  let body: React.ReactNode;
  if (resultVisible) body = <p className="muted">{t.modelOver}</p>;
  else if (!prediction.supported) body = <p className="muted">{t.modelUnsupported}</p>;
  else if (prediction.moves.length === 0) body = <p className="muted">{t.modelNone}</p>;
  else if (held)
    body = (
      <>
        <p className="muted">{t.modelHeld}</p>
        <button type="button" className="btn ghost" onClick={peekEngine}>
          {t.modelReveal}
        </button>
      </>
    );
  else
    body = (
      <>
        <p className="model-for">{t.modelFor.replace('{player}', shortName(mover)).replace('{move}', moveNo)}</p>
        <ol className="model-moves">
          {shown.top.map(m => (
            <li key={m.uci}>
              <strong>{localizeSan(m.san, notation)}</strong>
              <span className="model-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(2, m.percent)}%` }} />
              </span>
              <span className="num">{m.percent} %</span>
            </li>
          ))}
          {shown.other > 0 && (
            <li className="other">
              <span>{t.modelOther}</span>
              <span className="model-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(2, shown.other)}%` }} />
              </span>
              <span className="num">{shown.other} %</span>
            </li>
          )}
        </ol>
      </>
    );

  const behind = prediction.urgency > 0;
  return (
    <section className="model-estimate" aria-labelledby="model-title">
      <h3 id="model-title">
        {t.modelTitle} <span className="tag experimental">{t.experimental}</span>
      </h3>
      {body}
      <details className="model-details">
        <summary>{t.modelHow}</summary>
        <p>{t.modelWhat.replace('{games}', String(report.selection.selected))}</p>
        <p>
          {t.modelMeasured
            .replace('{games}', String(report.split.test.games))
            .replace('{n}', String(report.shown.n))
            .replace('{top1}', whole(report.shown.top1))
            .replace('{top3}', whole(report.shown.top3))}
        </p>
        <p>{t.modelSure.replace('{said}', whole(report.shown.whenSure.said)).replace('{happened}', whole(report.shown.whenSure.happened))}</p>
        <p>{t.modelStyle}</p>
        <p>
          {t.modelClock}{' '}
          {prediction.pressure > 0 ? t.modelClockOn.replace('{p}', whole(prediction.pressure)) : secondsLeft === undefined ? t.modelClockUnknown : t.modelClockOff}
        </p>
        <p>
          {t.modelStakes}{' '}
          {prediction.urgency === 0
            ? t.modelStakesOff
            : (behind ? t.modelStakesBehind : t.modelStakesAhead).replace('{u}', String(Math.max(1, Math.round(Math.abs(prediction.urgency) * 100))))}
        </p>
        {prediction.supported && prediction.moves.length > 0 && !resultVisible && !held && <p>{prediction.seenBefore ? t.modelSeen : t.modelNotSeen}</p>}
        <p>
          <a href={DOCS} target="_blank" rel="noreferrer" onClick={() => trackOutbound(DOCS)}>
            {t.modelDocs}
          </a>
        </p>
      </details>
    </section>
  );
}
