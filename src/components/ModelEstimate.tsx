import { useEffect, useMemo, useState } from 'react';
import model from '../data/predictor.json';
import { useScoresVersion, useT } from '../hooks';
import { cachedEval, lookUpEval, scoreOf, winningChances, type EvalResult } from '../lib/engine';
import { localizeSan, shortName } from '../lib/format';
import type { GameData } from '../lib/pgn';
import { predict, shares, withEngine, type EngineLine, type PredictorModel } from '../lib/predictor/model';
import { clocksAt, selectRoundNo, selectStakes, useStore } from '../store';

const MODEL = model as unknown as PredictorModel;
/** A share as the list prints it. A legal move with a share is never printed as 0. */
const share = (percent: number, belowOne: boolean) => (belowOne ? '<1 %' : `${percent} %`);

/** How long the card waits for the engine before it shows the estimate without it, in milliseconds. */
const ENGINE_WAIT_MS = 4000;

interface Props {
  game: GameData;
  /** The newest visible position of the game: what the estimate is about, whatever the board shows. */
  fen: string;
  /** What the engine says about the position on the board. Used when that is the position the estimate is about. */
  evaluation?: EvalResult;
}

/**
 * The site's own estimate of the next move, under the board: three legal
 * moves with a share each, and the rest as "other". It is a model fitted on
 * the two players' earlier games; what it is and how it was measured is in
 * docs/PREDICTOR.md. It is shown at once, whether or not the viewer is
 * guessing moves.
 *
 * With the engine on, the engine's lines for the position go into it: a
 * move the engine thinks little of, or does not list, gets a much smaller
 * share, by weights fitted on the two players' games. The lines are the
 * ones the page already has for the position; nothing more is asked of the
 * engine for this card.
 *
 * It only ever uses what the viewer has been shown: the visible position,
 * the visible clock, and the match score before this game. It is about the
 * game, not about a line the viewer is trying on the board. It is display
 * only: nothing here makes a guess or moves a piece. Where there is nothing
 * to estimate (the game is over, the player is not one of the two, no legal
 * move) it shows nothing at all.
 */
export function ModelEstimate({ game, fen, evaluation }: Props) {
  const t = useT();
  const notation = useStore(s => s.settings.notation);
  const engineOn = useStore(s => s.settings.engine);
  const lineCount = useStore(s => s.settings.engineLines);
  // quick scores of the game's positions arrive on their own; the card looks again when they do
  const scoresSeen = useScoresVersion();
  const revealed = useStore(s => s.revealed);
  const resultVisible = useStore(s => s.resultVisible);

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
  // What the two have already played against each other in this match: earlier games only, never the open one or a later one.
  const roundNo = useStore(selectRoundNo);
  const matchGames = useStore(s => s.matchGames);
  const earlier = useMemo(
    () =>
      gamesLeft === undefined
        ? []
        : matchGames
            .filter(mg => mg.roundNo < roundNo && mg.moves.length > 0)
            .sort((a, b) => a.roundNo - b.roundNo)
            .map(mg => ({ whiteId: mg.white.fideId, blackId: mg.black.fideId, moves: mg.moves })),
    [matchGames, roundNo, gamesLeft],
  );

  const prediction = useMemo(
    () =>
      predict(MODEL, {
        fen,
        lastMove,
        ownLastMove,
        moverId: mover.fideId,
        secondsLeft,
        match: moverPoints !== undefined && opponentPoints !== undefined && gamesLeft !== undefined ? { moverPoints, opponentPoints, gamesLeft } : undefined,
        earlier,
      }),
    [fen, lastMove, ownLastMove, mover.fideId, secondsLeft, moverPoints, opponentPoints, gamesLeft, earlier],
  );

  // The engine's lines for this position, best first, as the mover's winning chances: the board's analysis when the
  // board is on this position, an analysis kept from earlier otherwise, or at least the engine's one move for it.
  const lines = useMemo<EngineLine[]>(() => {
    if (!engineOn) return [];
    const side = whiteToMove ? 1 : -1;
    const found = evaluation && evaluation.fen === fen ? evaluation : cachedEval(fen, lineCount);
    if (found?.pvs.length) return found.pvs.filter(pv => pv.moves[0]).map(pv => ({ uci: pv.moves[0], chances: side * winningChances(pv) }));
    const score = scoreOf(fen);
    return score?.best ? [{ uci: score.best, chances: side * winningChances(score) }] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineOn, evaluation, fen, lineCount, whiteToMove, scoresSeen]);
  // The board is on another position (an earlier move, a line of the viewer's own): the engine is busy with that one,
  // so this position is looked up in the cloud database, which knows the positions of a game like this within a minute.
  const boardIsHere = !!evaluation && evaluation.fen === fen;
  useEffect(() => {
    if (engineOn && !boardIsHere && !cachedEval(fen, lineCount)) void lookUpEval(fen, lineCount);
  }, [engineOn, boardIsHere, fen, lineCount]);
  // With the engine on, the card waits a moment for its lines instead of showing an estimate that knows nothing of
  // how good the moves are. If the engine does not answer, the estimate is shown without it.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    setWaited(false);
    const id = window.setTimeout(() => setWaited(true), ENGINE_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [fen]);
  const informed = useMemo(() => withEngine(MODEL, prediction, lines), [prediction, lines]);
  const pending = engineOn && !!MODEL.engine && lines.length === 0 && !waited;
  const shown = useMemo(() => shares(informed), [informed]);
  const moveNo = `${Number(fen.split(' ')[5]) || 1}${whiteToMove ? '.' : '…'}`;

  if (resultVisible || !prediction.supported || prediction.moves.length === 0) return null;
  return (
    <section className="card model-estimate" aria-labelledby="model-title">
      <h3 id="model-title">
        {t.modelTitle}
        <span className="model-for">{t.modelFor.replace('{player}', shortName(mover)).replace('{move}', moveNo)}</span>
      </h3>
      {pending ? (
        <p className="muted model-wait" role="status">
          {t.thinking}
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
