import { useEffect, useMemo } from 'react';
import { useT } from '../hooks';
import type { Strings } from '../i18n';
import { trackOutbound } from '../lib/analytics';
import { localizeSan } from '../lib/format';
import { expectedMove, solverColor } from '../lib/puzzle';
import { PUZZLE_CHOICES, usePuzzles, type Feedback, type PuzzleChoice } from '../puzzleStore';
import { useStore } from '../store';
import { Board, type BoardShape } from './Board';
import { MoveInput, PromotionPicker, usePromotion } from './MoveEntry';

const choiceLabel = (c: PuzzleChoice, t: Strings): string =>
  ({ daily: t.pzDaily, mix: t.pzMix, mateIn1: t.pzMate1, mateIn2: t.pzMate2, short: t.pzShort, endgame: t.pzEndgame })[c];

const feedbackText = (f: Feedback, t: Strings): string =>
  ({ none: '', correct: t.fbCorrect, wrong: t.fbWrong, solved: t.fbSolved, solved_first: t.fbSolvedFirst, revealed: t.fbRevealed })[f];

/** Left column: the puzzle board with its controls. */
export function PuzzleBoard() {
  const t = useT();
  const state = usePuzzles(s => s.state);
  const loading = usePuzzles(s => s.loading);
  const feedback = usePuzzles(s => s.feedback);
  const busy = usePuzzles(s => s.busy);
  const syncToken = usePuzzles(s => s.syncToken);
  const play = usePuzzles(s => s.play);
  const rejected = usePuzzles(s => s.rejected);
  const hint = usePuzzles(s => s.hint);
  const reveal = usePuzzles(s => s.reveal);
  const reset = usePuzzles(s => s.reset);
  const load = usePuzzles(s => s.load);

  useEffect(() => {
    if (!usePuzzles.getState().state && !usePuzzles.getState().loading) void load();
  }, [load]);

  const fen = state?.fen ?? '';
  const promo = usePromotion(fen, play, rejected);
  const solving = !!state && state.status === 'solving';
  const canMove = solving && !busy && !promo.pending;

  // Help for the current move: first the piece, then the move itself.
  const shapes = useMemo<BoardShape[]>(() => {
    if (!state || !solving || state.hint === 0) return [];
    const move = expectedMove(state);
    if (!move) return [];
    return state.hint === 1 ? [{ from: move.from, brush: 'green' }] : [{ from: move.from, to: move.to, brush: 'green' }];
  }, [state, solving]);

  if (!state) {
    return (
      <section className="board-col puzzle-col">
        <div className="board-skeleton">{loading ? t.pzLoading : t.pzNone}</div>
      </section>
    );
  }

  const solver = solverColor(state.puzzle);
  const status = feedbackText(feedback, t) || (solving ? (state.hint === 1 ? t.hintPiece : state.hint === 2 ? t.hintMove : t.puzzleFind) : '');

  return (
    <section className="board-col puzzle-col">
      <div className="puzzle-head">
        <span className={`turn-dot ${solver}`} aria-hidden="true" />
        <strong>{solver === 'white' ? t.whiteToPlay : t.blackToPlay}</strong>
        {state.puzzle.rating !== undefined && <span className="muted">{t.puzzleRating.replace('{n}', String(state.puzzle.rating))}</span>}
      </div>
      <div className="board-row">
        <Board
          fen={state.fen}
          lastMove={state.lastMove}
          check={state.check}
          orientation={solver}
          shapes={shapes}
          onMove={canMove ? promo.squares : undefined}
          syncToken={syncToken}
        />
        {promo.pending && <PromotionPicker onChoose={promo.choose} />}
      </div>
      <p className={`feedback fb-${feedback}`} role="status" aria-live="polite">
        {status}
      </p>
      <div className="puzzle-actions">
        <button className="btn ghost" onClick={hint} disabled={!solving || busy || state.hint === 2}>
          {t.hintBtn}
        </button>
        <button className="btn ghost" onClick={reveal} disabled={!solving || busy}>
          {t.revealBtn}
        </button>
        <button className="btn ghost" onClick={reset} disabled={busy || (state.line.length === 0 && state.hint === 0)}>
          {t.resetBtn}
        </button>
        <button className={`btn ${solving ? 'ghost' : ''}`} onClick={() => void load()} disabled={loading}>
          {t.nextPuzzle} →
        </button>
      </div>
      {solving && <MoveInput fen={state.fen} label={t.typeMove} disabled={!canMove} onMove={play} />}
    </section>
  );
}

/** Right column, under the stream: what to solve, the score and where puzzles come from. */
export function PuzzlePanel({ onBack, newMove }: { onBack: () => void; newMove: boolean }) {
  const t = useT();
  const notation = useStore(s => s.settings.notation);
  const state = usePuzzles(s => s.state);
  const choice = usePuzzles(s => s.choice);
  const score = usePuzzles(s => s.score);
  const offline = usePuzzles(s => s.offline);
  const loading = usePuzzles(s => s.loading);
  const load = usePuzzles(s => s.load);
  const finished = !!state && state.status !== 'solving';
  const link = state && state.puzzle.source !== 'builtin' ? `https://lichess.org/training/${encodeURIComponent(state.puzzle.id)}` : undefined;

  return (
    <div className="puzzle-panel">
      <button className="back-to-match" onClick={onBack}>
        ← {t.backToMatch}
        {newMove && <span className="live-pill">{t.newMoveBadge}</span>}
      </button>

      <section>
        <h3 id="pz-kind">{t.pzKind}</h3>
        <div className="chips wrap" role="group" aria-labelledby="pz-kind">
          {PUZZLE_CHOICES.map(c => (
            <button key={c} className={`chip ${choice === c ? 'active' : ''}`} aria-pressed={choice === c} disabled={loading} onClick={() => void load(c)}>
              {choiceLabel(c, t)}
            </button>
          ))}
        </div>
        {offline && (
          <p className="notice small" role="status">
            {t.pzOffline}
          </p>
        )}
      </section>

      <section>
        <h3>{t.pzScore}</h3>
        <dl className="stats">
          <div>
            <dt>{t.pzSolved}</dt>
            <dd>{score.solved}</dd>
          </div>
          <div>
            <dt>{t.pzFirst}</dt>
            <dd>{score.firstTry}</dd>
          </div>
          <div>
            <dt>{t.pzStreak}</dt>
            <dd>{score.streak}</dd>
          </div>
          <div>
            <dt>{t.pzBest}</dt>
            <dd>{score.bestStreak}</dd>
          </div>
        </dl>
        {score.revealed > 0 && (
          <p className="muted small">
            {t.pzShown}: {score.revealed}
          </p>
        )}
      </section>

      {state && state.line.length > 0 && (
        <section>
          <h3>{t.pzLine}</h3>
          <p className="pz-line">{state.line.map(san => localizeSan(san, notation)).join('  ')}</p>
        </section>
      )}

      <p className="muted small">
        {t.pzCredit}{' '}
        {finished && link && (
          <a href={link} target="_blank" rel="noreferrer" onClick={() => trackOutbound(link)}>
            {t.pzOpen}
          </a>
        )}
      </p>
    </div>
  );
}
