import { useEffect, useState } from 'react';
import { useScoresVersion, useT } from '../hooks';
import type { Strings } from '../i18n';
import { cachedEval, fillScores, judgeMove, scoreOf, type EvalResult } from '../lib/engine';
import { getMasters, totalGames, type ExplorerData } from '../lib/explorer';
import { firstMoveSquares, formatEval, localizeSan, pvToSan, shortName } from '../lib/format';
import type { GameData } from '../lib/pgn';
import { moveByUci } from '../lib/position';
import { canGuess, referencesHeld, useStore, type GuessEntry } from '../store';
import { qualityLabel } from './AnalysisPanel';
import { ModelEstimate } from './ModelEstimate';
import { MoveChooser, MoveInput } from './MoveEntry';

const moveNo = (ply: number) => `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '…'}`;

/** What the engine thinks of a move, once it has a score for the position before and after it. */
const engineVerdict = (fenBefore: string, fenAfter: string, uci: string | undefined, t: Strings): string | undefined => {
  const before = scoreOf(fenBefore);
  const after = scoreOf(fenAfter);
  if (!before || !after) return undefined;
  const whiteMoved = fenBefore.split(' ')[1] !== 'b';
  const best = firstMoveSquares(fenBefore, before.best);
  const played = uci ? moveByUci(fenBefore, uci) : undefined;
  const judged = judgeMove(before, after, whiteMoved, !!best && !!played && best[0] === played.from && best[1] === played.to);
  return judged ? qualityLabel(judged.quality, t) : undefined;
};

interface Props {
  game: GameData;
  /**
   * The position the prediction is about: the newest visible one of the game.
   * Never the board's, which may show an earlier move or a line of the viewer's own.
   */
  fen: string;
  /** Evaluation of whatever the board shows. Used here only when that is this same position. */
  evaluation?: EvalResult;
  /** The board shows something other than `fen`. */
  boardElsewhere: boolean;
}

/**
 * Guess the next move. Two references are shown next to the viewer's guess,
 * and kept apart on purpose: how often each move was played in master games
 * (real frequencies, only while the position exists in the database) and
 * what the engine considers strongest. Neither is a probability of what the
 * player will do, and nothing here pretends to be one.
 *
 * Everything about a prediction happens in this panel. The board is not
 * involved: a move made there is analysis, and choosing a move here moves
 * nothing there.
 */
export function PredictPanel({ game, fen, evaluation, boardElsewhere }: Props) {
  const t = useT();
  const lang = useStore(s => s.settings.lang);
  const notation = useStore(s => s.settings.notation);
  const guessMode = useStore(s => s.settings.guessMode);
  const setSetting = useStore(s => s.setSetting);
  const guess = useStore(s => s.guess);
  const log = useStore(s => s.guessLog[game.id]);
  const revealed = useStore(s => s.revealed);
  const resultVisible = useStore(s => s.resultVisible);
  const allowed = useStore(canGuess);
  const held = useStore(referencesHeld);
  const makeGuess = useStore(s => s.makeGuess);
  const clearGuess = useStore(s => s.clearGuess);
  const peekEngine = useStore(s => s.peekEngine);
  useScoresVersion();

  const open = !!guess && guess.gameId === game.id && guess.forPly === revealed + 1;
  const whiteToMove = fen.split(' ')[1] !== 'b';
  const mover = whiteToMove ? game.white : game.black;
  // The references would give the game away to someone still guessing.
  const showReferences = !held;
  // The engine looks at one position at a time, the board's. Its lines are shown here only for this position.
  const engineEval = evaluation && evaluation.fen === fen ? evaluation : cachedEval(fen);

  // The engine's opinion of a guess needs a score before and after it: for the
  // open guess, and for the latest settled one. One request, because a newer
  // request replaces an older one.
  useEffect(() => {
    const fens: string[] = [];
    if (open && guess) fens.push(fen, guess.fenAfter);
    const last = log?.at(-1);
    if (last && !last.hit) fens.push(last.fenBefore, last.fenAfterGuess);
    if (fens.length) void fillScores([...new Set(fens)]);
  }, [open, guess, fen, log]);

  const [masters, setMasters] = useState<{ fen: string; d?: ExplorerData; error?: boolean }>({ fen });
  useEffect(() => {
    if (!showReferences) return;
    let alive = true;
    setMasters({ fen });
    getMasters(fen)
      .then(d => alive && setMasters({ fen, d }))
      .catch(() => alive && setMasters({ fen, error: true }));
    return () => {
      alive = false;
    };
  }, [fen, showReferences]);

  const entries: GuessEntry[] = log ?? [];
  const hits = entries.filter(e => e.hit).length;
  const last = entries.at(-1);
  const d = masters.fen === fen ? masters.d : undefined;
  const total = d ? totalGames(d) : 0;
  const nf = (n: number) => new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-GB').format(n);
  const guessVerdict = open && guess ? engineVerdict(fen, guess.fenAfter, guess.uci, t) : undefined;

  return (
    <div className="predict">
      <div className="setting">
        <span>
          <strong>{t.guessMode}</strong>
          <span className="muted small block">{t.guessModeHelp}</span>
        </span>
        <div className="seg" role="group" aria-label={t.guessMode}>
          <button className={guessMode ? 'active' : ''} aria-pressed={guessMode} onClick={() => setSetting('guessMode', true)}>
            {t.on}
          </button>
          <button className={!guessMode ? 'active' : ''} aria-pressed={!guessMode} onClick={() => setSetting('guessMode', false)}>
            {t.off}
          </button>
        </div>
      </div>

      {guessMode && (
        <section className="guess-card" aria-live="polite">
          {allowed && !open && (
            <>
              <p>
                <strong>{t.guessPrompt.replace('{player}', shortName(mover))}</strong>
              </p>
              <p className="muted small">{t.guessHow}</p>
              {boardElsewhere && <p className="muted small">{t.guessAbout}</p>}
              <MoveChooser fen={fen} onMove={makeGuess} />
              <MoveInput fen={fen} label={t.typeMove} onMove={makeGuess} />
              <button className="link small" onClick={peekEngine}>
                {t.guessSkip}
              </button>
            </>
          )}
          {open && guess && (
            <>
              <p>
                {t.yourGuess} <strong className="guess-move">{`${moveNo(guess.forPly)} ${localizeSan(guess.san, notation)}`}</strong>
                <button className="link small" onClick={clearGuess}>
                  {t.guessChange}
                </button>
              </p>
              <p className="muted small">
                {guessVerdict ? t.engineSays.replace('{verdict}', guessVerdict.toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-GB')) : t.guessWaiting}
              </p>
            </>
          )}
          {!allowed && !open && <p className="muted">{resultVisible ? t.guessOver : t.guessPeeked}</p>}
        </section>
      )}

      {last && (
        <section className={`guess-result ${last.hit ? 'hit' : 'miss'}`} aria-live="polite">
          <strong>{last.hit ? t.guessHit : t.guessMiss}</strong>
          <span>
            {' '}
            {t.guessPlayed.replace('{move}', `${moveNo(last.ply)} ${localizeSan(last.played, notation)}`)}
            {!last.hit && ` ${t.guessYours.replace('{move}', localizeSan(last.guess, notation))}`}
          </span>
        </section>
      )}

      {entries.length > 0 && (
        <p className="guess-score">
          {t.guessScore.replace('{hits}', String(hits)).replace('{total}', String(entries.length))}
        </p>
      )}

      {showReferences ? (
        <>
          <section>
            <h3>{t.mastersPlayed}</h3>
            {d && total > 0 ? (
              <>
                <table className="freq">
                  <caption className="muted small">{t.mastersSample.replace('{n}', nf(total))}</caption>
                  <tbody>
                    {d.moves.slice(0, 5).map(m => {
                      const n = totalGames(m);
                      return (
                        <tr key={m.uci}>
                          <th scope="row">{localizeSan(m.san, notation)}</th>
                          <td className="num">{nf(n)}</td>
                          <td className="bar" aria-hidden="true">
                            <i style={{ width: `${Math.max(2, (n / total) * 100)}%` }} />
                          </td>
                          <td className="num">{Math.round((n / total) * 100)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {total < 20 && <p className="muted small">{t.mastersFew}</p>}
              </>
            ) : (
              <p className="muted">{d ? t.mastersNoData : masters.error ? t.explorerError : t.loading}</p>
            )}
            <p className="muted small">{t.mastersNote}</p>
          </section>

          <section>
            <h3>{t.engineSuggests}</h3>
            {engineEval && engineEval.pvs.length > 0 ? (
              <ol className="engine-first">
                {engineEval.pvs.map((pv, i) => {
                  const first = pvToSan(fen, pv.moves, 1)[0];
                  return first ? (
                    <li key={i}>
                      <strong>{localizeSan(first.san, notation)}</strong>
                      <span className="muted">{formatEval(pv)}</span>
                    </li>
                  ) : null;
                })}
              </ol>
            ) : (
              <p className="muted">{boardElsewhere ? t.engineElsewhere : t.thinking}</p>
            )}
            <p className="muted small">{t.engineNote}</p>
          </section>

          <p className="muted small honest">{t.predictHonest}</p>
        </>
      ) : (
        <p className="muted small">{t.referencesAfter}</p>
      )}

      {entries.length > 0 && (
        <section>
          <h3>{t.guessHistory}</h3>
          <ol className="rows guess-rows">
            {[...entries].reverse().map(e => {
              const verdict = e.hit ? undefined : engineVerdict(e.fenBefore, e.fenAfterGuess, undefined, t);
              return (
                <li key={e.ply}>
                  <span className={`mark ${e.hit ? 'hit' : 'miss'}`} aria-label={e.hit ? t.guessHit : t.guessMiss}>
                    {e.hit ? '✓' : '✗'}
                  </span>
                  <span className="row-main">{`${moveNo(e.ply)} ${localizeSan(e.played, notation)}`}</span>
                  <span className="muted">{e.hit ? '' : `${t.yourGuess} ${localizeSan(e.guess, notation)}${verdict ? ` (${verdict.toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-GB')})` : ''}`}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* The site's own estimate, last in the tab. It is shown, never acted on. */}
      <ModelEstimate game={game} fen={fen} />
    </div>
  );
}
