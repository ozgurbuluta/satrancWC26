import { useMemo } from 'react';
import model from '../data/predictor.json';
import { useT } from '../hooks';
import { localizeSan, shortName } from '../lib/format';
import type { GameData } from '../lib/pgn';
import { predict, shares, type PredictorModel } from '../lib/predictor/model';
import { clocksAt, referencesHeld, selectStakes, useStore } from '../store';

const MODEL = model as unknown as PredictorModel;
/** A share as the list prints it. A legal move with a share is never printed as 0. */
const share = (percent: number, belowOne: boolean) => (belowOne ? '<1 %' : `${percent} %`);

interface Props {
  game: GameData;
  /** The newest visible position of the game: what the estimate is about, whatever the board shows. */
  fen: string;
}

/**
 * The site's own estimate of the next move, under the board: three legal
 * moves with a share each, and the rest as "other". It is an experimental
 * model fitted on the two players' earlier games, and labelled as one; what
 * it is and how it was measured is in docs/PREDICTOR.md.
 *
 * It only ever uses what the viewer has been shown: the visible position,
 * the visible clock, and the match score before this game. It is about the
 * game, not about a line the viewer is trying on the board. It is display
 * only: nothing here makes a guess or moves a piece. Where there is nothing
 * to estimate (the game is over, the player is not one of the two, no legal
 * move) it shows nothing at all.
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

  if (resultVisible || !prediction.supported || prediction.moves.length === 0) return null;
  return (
    <section className="card model-estimate" aria-labelledby="model-title">
      <h3 id="model-title">
        {t.modelTitle} <span className="tag experimental">{t.experimental}</span>
        {!held && <span className="model-for">{t.modelFor.replace('{player}', shortName(mover)).replace('{move}', moveNo)}</span>}
      </h3>
      {held ? (
        <p className="model-held">
          <span className="muted">{t.modelHeld}</span>
          <button type="button" className="btn ghost" onClick={peekEngine}>
            {t.modelReveal}
          </button>
        </p>
      ) : (
        <ol className="model-moves">
          {shown.top.map(m => (
            <li key={m.uci}>
              <strong>{localizeSan(m.san, notation)}</strong>
              <span className="model-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(2, m.percent)}%` }} />
              </span>
              <span className="num">{share(m.percent, m.belowOne)}</span>
            </li>
          ))}
          {(shown.other > 0 || shown.otherBelowOne) && (
            <li className="other">
              <span>{t.modelOther}</span>
              <span className="model-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(2, shown.other)}%` }} />
              </span>
              <span className="num">{share(shown.other, shown.otherBelowOne)}</span>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
