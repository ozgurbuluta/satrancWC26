import { useScoresVersion, useT } from '../hooks';
import type { Strings } from '../i18n';
import { moveChoice, wdl, winningChances, type EvalResult, type PV } from '../lib/engine';
import { formatEval, localizeSan, pvToSan, shortName } from '../lib/format';
import type { GameData } from '../lib/pgn';
import { judgePly, QUALITY_GLYPH } from '../lib/quality';
import { useStore } from '../store';
import { qualityLabel } from './AnalysisPanel';

/** The engine's score in words: who is better, and by how much. */
export const verdictText = (pv: PV | undefined, t: Strings): string => {
  if (!pv) return '';
  if (pv.mate !== undefined) return `${Math.abs(pv.mate)} ${t.mateIn}`;
  const cp = pv.cp ?? 0;
  const abs = Math.abs(cp);
  if (abs < 30) return t.equal;
  if (abs < 90) return cp > 0 ? t.whiteSlightly : t.blackSlightly;
  if (abs < 250) return cp > 0 ? t.whiteBetter : t.blackBetter;
  return cp > 0 ? t.whiteWinning : t.blackWinning;
};

const pct = (x: number) => `${Math.round(x * 100)}`;

/** Win, draw and loss as the engine's evaluation suggests them. An estimate, and labelled as one. */
export function WinChance({ game, evaluation }: { game: GameData; evaluation?: EvalResult }) {
  const t = useT();
  const engineOn = useStore(s => s.settings.engine);
  const best = engineOn ? evaluation?.pvs[0] : undefined;
  const split = wdl(best);
  const value = (x: number) => (best ? pct(x) : '–');
  return (
    <section className="card win-chance" aria-label={t.winChance}>
      <h2 className="eyebrow">{t.winChance}</h2>
      <div className="wc-row">
        <div className="wc">
          <span className="wc-name">
            <i className="dot white" aria-hidden="true" />
            <span lang="en">{shortName(game.white)}</span>
          </span>
          <b>
            {value(split.win)}
            {best && <small>%</small>}
          </b>
        </div>
        <div className="wc mid">
          <span className="wc-name">{t.draw}</span>
          <b>
            {value(split.draw)}
            {best && <small>%</small>}
          </b>
        </div>
        <div className="wc end">
          <span className="wc-name">
            <span lang="en">{shortName(game.black)}</span>
            <i className="dot black" aria-hidden="true" />
          </span>
          <b>
            {value(split.loss)}
            {best && <small>%</small>}
          </b>
        </div>
      </div>
      <div
        className={`wdl-bar ${best ? '' : 'empty'}`}
        role="img"
        // while the engine is on but has not answered yet, this says so; "off" is only said when it is off
        aria-label={best ? `${shortName(game.white)} ${pct(split.win)}%, ${t.draw} ${pct(split.draw)}%, ${shortName(game.black)} ${pct(split.loss)}%` : engineOn ? t.thinking : t.engineOff}
      >
        <i className="w" style={{ flexGrow: Math.max(split.win, 0.001) }} />
        <i className="d" style={{ flexGrow: Math.max(split.draw, 0.001) }} />
        <i className="b" style={{ flexGrow: Math.max(split.loss, 0.001) }} />
      </div>
      <p className="muted small">{t.wdlNote}</p>
    </section>
  );
}

interface EngineProps {
  game: GameData;
  /** Position on the board: the game's, or the one reached in the viewer's own line. */
  fen: string;
  shown: number;
  evaluation?: EvalResult;
  /** The board shows the viewer's own line, so notes about the game's last move do not apply. */
  inLine: boolean;
}

/** The engine's lines for the position on the board: a score, the move it would play, and how it goes on. */
export function EngineCard({ game, fen, shown, evaluation, inLine }: EngineProps) {
  const t = useT();
  const notation = useStore(s => s.settings.notation);
  const lines = useStore(s => s.settings.engineLines);
  const lang = useStore(s => s.settings.lang);
  const engineOn = useStore(s => s.settings.engine);
  const setSetting = useStore(s => s.setSetting);
  useScoresVersion();

  const whiteStarts = game.initialFen.split(' ')[1] !== 'b';
  const firstMoveNo = Number(game.initialFen.split(' ')[5]) || 1;
  const whiteToMove = fen.split(' ')[1] !== 'b';
  const mover = whiteToMove ? game.white : game.black;
  // The note on the last move is about the game; it has no place next to a line of the viewer's own.
  const lastJudged = !inLine && shown > 0 ? judgePly(game, shown - 1) : undefined;
  const lastPly = !inLine && shown > 0 ? game.plies[shown - 1] : undefined;
  const lastMoveNo = firstMoveNo + Math.floor((shown - 1 + (whiteStarts ? 0 : 1)) / 2);
  const lastWasWhite = ((shown - 1) % 2 === 0) === whiteStarts;

  // What the choice looks like when it is narrow: the good moves by name, and what the next one would be.
  // Where every line is good there is nothing worth a sentence, and none is shown.
  let choice: { critical: boolean; tag: string; text: string } | undefined;
  const narrow = engineOn && evaluation ? moveChoice(evaluation.pvs, whiteToMove) : undefined;
  if (narrow && evaluation) {
    const sanOf = (line: number) => {
      const san = pvToSan(fen, evaluation.pvs[line].moves, 1)[0]?.san;
      return san ? localizeSan(san, notation) : undefined;
    };
    const move = sanOf(0);
    const second = sanOf(1);
    const next = sanOf(narrow.next);
    const quality = qualityLabel(narrow.quality, t).toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-GB');
    if (move && next && (narrow.kind !== 'two' || second)) {
      const fill = (text: string) =>
        text.replace('{player}', shortName(mover)).replace('{move}', move).replace('{second}', second ?? '').replace('{next}', next).replace('{quality}', quality);
      choice =
        narrow.kind === 'only'
          ? { critical: true, tag: t.choiceOnlyTag, text: fill(t.choiceOnly) }
          : narrow.kind === 'best'
            ? { critical: false, tag: t.choiceBestTag, text: fill(t.choiceBest) }
            : { critical: false, tag: t.choiceTwoTag, text: fill(t.choiceTwo) };
    }
  }

  return (
    <section className="card engine-card" aria-label={t.engine}>
      <div className="engine-head">
        {/* a name, not a Turkish word: without this the capitals would turn its "i" into "İ" */}
        <h2 className="eyebrow" lang="en">
          {t.engine}
        </h2>
        {engineOn && evaluation && (
          <span className="engine-src">
            {evaluation.source === 'cloud' ? t.cloud : t.local}, {t.depth} {evaluation.depth}
          </span>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={engineOn}
          aria-label={t.engineSetting}
          title={t.engineSetting}
          className={`switch ${engineOn ? 'on' : ''}`}
          onClick={() => setSetting('engine', !engineOn)}
        >
          <i aria-hidden="true" />
        </button>
      </div>

      <label className="engine-lines">
        <span>{t.engineLines}</span>
        <select value={lines} onChange={e => setSetting('engineLines', Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>

      {!engineOn ? (
        <p className="muted">{t.engineOff}</p>
      ) : !evaluation ? (
        <p className="muted">{t.thinking}</p>
      ) : (
        <ol className="pv-list">
          {evaluation.pvs.slice(0, lines).map((pv, i) => {
            const moves = pvToSan(fen, pv.moves, 9);
            const first = moves[0];
            return (
              <li key={i}>
                <span className={`pv-eval ${(pv.mate ?? pv.cp ?? 0) < 0 ? 'neg' : 'pos'}`}>{formatEval(pv)}</span>
                <span className="pv-moves">
                  {first && (
                    <strong className="pv-first">
                      {first.label && <em>{first.label}</em>}
                      {localizeSan(first.san, notation)}
                    </strong>
                  )}
                  <span className="pv-rest">
                    {moves.slice(1).map((m, j) => (
                      <span key={j}>
                        {m.label && <em>{m.label}</em>}
                        {localizeSan(m.san, notation)}{' '}
                      </span>
                    ))}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {engineOn && ((lastPly && lastJudged) || choice) && (
        <div className="note">
          {lastPly && lastJudged && (
            <p>
              <span className={`q q-${lastJudged.quality}`}>{qualityLabel(lastJudged.quality, t)}</span>
              <b>
                {lastWasWhite ? `${lastMoveNo}.` : `${lastMoveNo}…`} {localizeSan(lastPly.san, notation)}
                {QUALITY_GLYPH[lastJudged.quality] && lastJudged.quality !== 'best' ? QUALITY_GLYPH[lastJudged.quality] : ''}
              </b>
              {lastJudged.loss >= 0.1 && (
                <span className="muted"> {t.evalWent.replace('{a}', formatEval(lastJudged.before)).replace('{b}', formatEval(lastJudged.after))}</span>
              )}
            </p>
          )}
          {choice && (
            <p>
              <span className={`q ${choice.critical ? 'q-critical' : 'q-calm'}`}>{choice.tag}</span>
              {choice.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The evaluation as one bar above the board: White's share from the left,
 * with the score and what it means in words. The words are drawn twice, dark
 * on the white part and light on the dark part, so they read at any split.
 */
export function EvalStrip({ evaluation }: { evaluation?: EvalResult }) {
  const t = useT();
  const engineOn = useStore(s => s.settings.engine);
  const pv = engineOn ? evaluation?.pvs[0] : undefined;
  const share = 50 + 50 * winningChances(pv);
  const text = !engineOn ? t.engineOff : pv ? `${formatEval(pv)}  ${verdictText(pv, t)}` : t.thinking;
  return (
    <div className={`eval-strip ${pv ? '' : 'idle'}`} role="img" aria-label={text}>
      <span className="eval-strip-text on-black" aria-hidden="true">
        {text}
      </span>
      <div className="eval-strip-white" style={{ width: `${share}%` }} aria-hidden="true">
        <span className="eval-strip-text on-white">{text}</span>
      </div>
    </div>
  );
}
