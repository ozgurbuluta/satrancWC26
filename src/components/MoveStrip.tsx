import { useEffect, useRef } from 'react';
import { useT } from '../hooks';
import { localizeSan } from '../lib/format';
import type { GameData } from '../lib/pgn';
import { useStore, type Analysis } from '../store';

interface Props {
  game: GameData;
  /** Half-moves of the game on the board. */
  shown: number;
  /** The viewer's own line, when the board shows one. */
  line: Analysis | null;
  /** The own moves with their numbers. */
  ownMoves: { label?: string; san: string }[];
  /** What the return control is called right now ("Canlı konuma dön" or "Oyundaki konuma dön"). */
  backLabel: string;
  /** The board is on the newest position of the game and shows no line. */
  atNewest: boolean;
}

/**
 * The bar under the board: turn the board, step through the moves, and the
 * moves themselves in one line. The same line shows the game's moves or,
 * while the viewer plays moves of their own, that line of theirs, so nothing
 * on the page shifts when a line is started.
 */
export function MoveStrip({ game, shown, line, ownMoves, backLabel, atNewest }: Props) {
  const t = useT();
  const notation = useStore(s => s.settings.notation);
  const revealed = useStore(s => s.revealed);
  const paused = useStore(s => s.paused);
  const startsAt = useStore(s => s.rounds.find(r => r.id === s.roundId)?.startsAt);
  const resultVisible = useStore(s => s.resultVisible);
  const lang = useStore(s => s.settings.lang);
  const step = useStore(s => s.step);
  const setViewPly = useStore(s => s.setViewPly);
  const toggleFlip = useStore(s => s.toggleFlip);
  const analysisGoto = useStore(s => s.analysisGoto);
  const track = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLButtonElement>(null);

  // Keep the move on the board in sight, inside the strip only: the page itself never scrolls for this.
  const cursor = line ? `own:${line.cursor}:${line.moves.length}` : `game:${shown}:${revealed}`;
  useEffect(() => {
    const box = track.current;
    const el = active.current;
    if (!box) return;
    if (!el) {
      box.scrollLeft = 0;
      return;
    }
    const target = el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2;
    box.scrollLeft = Math.max(0, target);
  }, [cursor]);

  const whiteStarts = game.initialFen.split(' ')[1] !== 'b';
  const firstMoveNo = Number(game.initialFen.split(' ')[5]) || 1;
  const plies = game.plies.slice(0, revealed);
  const noBack = !line && shown === 0;
  const noForward = line ? line.cursor >= line.moves.length : atNewest && !paused;
  const waiting = !paused && !resultVisible && revealed === 0;
  const liveNow = !paused && !resultVisible && revealed > 0;
  const scheduledDate = startsAt
    ? new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(startsAt)
    : t.startingSoon;

  return (
    <div className="move-strip">
      <button type="button" className="nav-btn" onClick={toggleFlip} aria-label={t.flip} title={`${t.flip} (F)`} aria-keyshortcuts="F">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path d="M7 4v14m0 0-3-3m3 3 3-3M17 20V6m0 0-3 3m3-3 3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="move-strip-moves">
        <button type="button" className="nav-btn" onClick={() => setViewPly(0)} disabled={noBack} aria-label={t.first} title={`${t.first} (Home)`} aria-keyshortcuts="Home">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M18 6l-6 6 6 6M8 6v12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className="nav-btn" onClick={() => step(-1)} disabled={noBack} aria-label={t.prev} title={`${t.prev} (←)`} aria-keyshortcuts="ArrowLeft">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={`strip-track ${line ? 'own' : ''}`} ref={track} role="group" aria-label={line ? t.analysisLine : t.moves}>
          {line ? (
            <>
              <span className="tag">{t.analysisTag}</span>
              <button
                type="button"
                ref={line.cursor === 0 ? active : undefined}
                className={`move ${line.cursor === 0 ? 'active' : ''}`}
                onClick={() => analysisGoto(0)}
                title={t.analysisStart}
                aria-label={t.analysisStart}
              >
                ●
              </button>
              {ownMoves.map((m, i) => (
                <span className="mv" key={i}>
                  {m.label && <span className="move-num">{m.label}</span>}
                  <button type="button" ref={line.cursor === i + 1 ? active : undefined} className={`move ${line.cursor === i + 1 ? 'active' : ''}`} onClick={() => analysisGoto(i + 1)}>
                    {localizeSan(m.san, notation)}
                  </button>
                </span>
              ))}
            </>
          ) : plies.length === 0 ? (
            <span className="muted">{t.noMoves}</span>
          ) : (
            plies.map((p, i) => {
              const whiteMove = (i % 2 === 0) === whiteStarts;
              const moveNo = firstMoveNo + Math.floor((i + (whiteStarts ? 0 : 1)) / 2);
              const here = i + 1 === shown;
              return (
                <span className="mv" key={i}>
                  {(whiteMove || i === 0) && <span className="move-num">{whiteMove ? `${moveNo}.` : `${moveNo}…`}</span>}
                  <button type="button" ref={here ? active : undefined} className={`move ${here ? 'active' : ''}`} onClick={() => setViewPly(i + 1)}>
                    {localizeSan(p.san, notation)}
                  </button>
                </span>
              );
            })
          )}
        </div>
        <button type="button" className="nav-btn" onClick={() => step(1)} disabled={noForward} aria-label={t.next} title={`${t.next} (→)`} aria-keyshortcuts="ArrowRight">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {/* The last-move control also leaves the viewer's own line. */}
        <button
          type="button"
          className="nav-btn"
          onClick={() => setViewPly(null)}
          disabled={atNewest}
          aria-label={line ? backLabel : t.last}
          title={`${line ? backLabel : t.last} (↑)`}
          aria-keyshortcuts="ArrowUp End"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M6 6l6 6-6 6M16 6v12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {/* One control in one place: it says the board is live, or brings it back there. */}
      {atNewest ? (
        <span className={`live-state ${liveNow ? 'on' : ''} ${waiting ? 'scheduled' : ''}`} role="status">
          {liveNow && <i className="pulse" aria-hidden="true" />}
          {liveNow ? t.liveShort : paused ? t.pausedPill : waiting ? (
            startsAt ? <time dateTime={new Date(startsAt).toISOString()}>{scheduledDate}</time> : scheduledDate
          ) : t.finished}
        </span>
      ) : (
        <button type="button" className="go-live" onClick={() => setViewPly(null)} title={`${backLabel} (↑)`} aria-keyshortcuts="ArrowUp End">
          {liveNow && <i className="pulse" aria-hidden="true" />}
          {backLabel}
        </button>
      )}
    </div>
  );
}
