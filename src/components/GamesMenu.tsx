import { useEffect, useRef, useState } from 'react';
import { KNOWN_PLAYERS } from '../config';
import { useT } from '../hooks';
import type { Strings } from '../i18n';
import { fedFlag, formatPoints, shortName } from '../lib/format';
import type { PlayerInfo } from '../lib/pgn';
import { selectGameRows, selectRoundNo, selectScore, useStore, type GameRow } from '../store';

const resultText = (r: string) => (r === '1/2-1/2' ? '½–½' : r === '1-0' ? '1–0' : r === '0-1' ? '0–1' : '');

const whenText = (ms: number | undefined, locale: string) =>
  ms ? new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms) : '';

/** What a row says about its game, in words: for labels and for screen readers. */
const statusText = (row: GameRow, t: Strings, locale: string): string =>
  row.status === 'done'
    ? resultText(row.result)
    : row.status === 'hidden'
      ? t.hidden
      : row.status === 'live'
        ? row.move
          ? `${t.live}, ${t.atMove.replace('{n}', String(row.move))}`
          : t.live
        : row.status === 'paused'
          ? t.pausedPill
          : whenText(row.startsAt, locale);

const rowLabel = (row: GameRow, t: Strings, locale: string): string => {
  const names = row.white && row.black ? `${shortName(row.white)} – ${shortName(row.black)}` : '';
  return [t.gameNo.replace('{n}', String(row.n)) + (names ? `: ${names}` : ''), statusText(row, t, locale), row.tiebreak ? t.tiebreak : '', row.current ? t.gameOpenNow : '']
    .filter(Boolean)
    .join(', ');
};

/**
 * The games of the match, one row each: played, being played and still to
 * come. What each row may show is decided in one place (`selectGameRows`).
 */
export function GameList({ onPick }: { onPick?: () => void }) {
  const t = useT();
  // The list reads most of the state, so it simply follows all of it.
  const state = useStore();
  const { roundId, rounds, revealed, paused, resultVisible, gameOrder, games, gameId, view, selectRound, selectGame, setView } = state;
  const rows = selectGameRows(state);
  const locale = state.settings.lang === 'tr' ? 'tr-TR' : 'en-GB';
  const box = useRef<HTMLOListElement>(null);
  const currentRow = useRef<HTMLLIElement>(null);

  // Where the list scrolls by itself, keep the open game in sight.
  useEffect(() => {
    const list = box.current;
    const row = currentRow.current;
    if (!list || !row || list.scrollHeight <= list.clientHeight) return;
    list.scrollTop = row.offsetTop - list.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2;
  }, [roundId, rounds.length]);

  const pick = (go: () => void) => {
    go();
    if (view !== 'live') setView('live');
    onPick?.();
  };

  return (
    <ol className="game-list" ref={box}>
      {rows.map(row => {
        const known = !!row.white && !!row.black;
        const dated = row.status === 'ahead';
        return (
          <li key={row.roundId} ref={row.current ? currentRow : undefined}>
            <button
              type="button"
              className={`game-row ${row.current ? 'current' : ''} ${row.status}`}
              aria-current={row.current ? 'true' : undefined}
              aria-label={rowLabel(row, t, locale)}
              onClick={() => pick(() => selectRound(row.roundId))}
            >
              <span className="game-no" aria-hidden="true">
                {row.n}
              </span>
              <span className="game-main" aria-hidden="true">
                <span className="game-players">
                  {known ? (
                    <>
                      <i className="dot white" />
                      <span className={row.result === '1-0' ? 'won' : ''}>{shortName(row.white!)}</span>
                      <span className="muted">–</span>
                      <span className={row.result === '0-1' ? 'won' : ''}>{shortName(row.black!)}</span>
                      <i className="dot black" />
                    </>
                  ) : (
                    // A game still to come has no colours yet; its row says when it starts instead.
                    <span>{(dated && whenText(row.startsAt, locale)) || t.gameNo.replace('{n}', String(row.n))}</span>
                  )}
                </span>
                {(!dated || known || row.tiebreak) && (
                  <span className="game-status">
                    {row.status === 'done' ? (
                      <b>{resultText(row.result)}</b>
                    ) : row.status === 'hidden' ? (
                      <span className="muted">{t.hidden}</span>
                    ) : row.status === 'live' ? (
                      <>
                        <span className="live-pill">{t.live}</span>
                        {row.move !== undefined && <span className="muted">{t.atMove.replace('{n}', String(row.move))}</span>}
                      </>
                    ) : row.status === 'paused' ? (
                      <span className="muted">⏸ {t.pausedPill}</span>
                    ) : (
                      known && <span className="muted">{whenText(row.startsAt, locale)}</span>
                    )}
                    {row.tiebreak && <span className="muted">{t.tiebreak}</span>}
                  </span>
                )}
              </span>
            </button>
            {row.several && (
              <ol className="board-list">
                {gameOrder.map((id, j) => {
                  const g = games[id];
                  const chosen = id === gameId;
                  // Other boards of the day say nothing while paused.
                  const boardStatus = chosen
                    ? resultVisible
                      ? resultText(g.result)
                      : revealed > 0 && !paused
                        ? t.live
                        : ''
                    : paused
                      ? ''
                      : g.result !== '*'
                        ? resultText(g.result)
                        : g.plies.length > 0
                          ? t.live
                          : '';
                  const boardNames = `${shortName(g.white)} – ${shortName(g.black)}`;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className={`board-pick ${chosen ? 'current' : ''}`}
                        aria-current={chosen ? 'true' : undefined}
                        aria-label={`${t.boardNo.replace('{n}', String(j + 1))}: ${boardNames}${boardStatus ? `, ${boardStatus}` : ''}`}
                        onClick={() => pick(() => selectGame(id))}
                      >
                        <span aria-hidden="true">{boardNames}</span>
                        <span className="muted" aria-hidden="true">
                          {boardStatus}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The match at a glance, across the top: the score, and one small square per
 * game that opens it. Played games show who won, the game in progress is
 * marked, games to come are empty. `squares` is off where there is no room;
 * the full list is then one button away.
 */
export function MatchStrip({ squares }: { squares: boolean }) {
  const t = useT();
  const state = useStore();
  const { feds, view, selectRound, setView } = state;
  const score = selectScore(state);
  const rows = selectGameRows(state);
  const roundNo = selectRoundNo(state);
  const locale = state.settings.lang === 'tr' ? 'tr-TR' : 'en-GB';
  const flag = (p: PlayerInfo) => fedFlag(p.fideId ? (feds[p.fideId] ?? KNOWN_PLAYERS[p.fideId]?.fed) : undefined);
  const half = Math.ceil(rows.filter(r => !r.tiebreak).length / 2);

  if (!score && rows.length === 0) return null;
  return (
    <div className="match-strip">
      {score && (
        <span className="who">
          <span className="flag" aria-hidden="true">
            {flag(score.a)}
          </span>
          <span className="who-name" lang="en">
            {shortName(score.a)}
          </span>
          <b className="pts">{formatPoints(score.aPoints)}</b>
        </span>
      )}
      {squares && (
        <ol className="game-squares" aria-label={t.games}>
          {rows.map(row => (
            <li key={row.roundId} className={row.n === half + 1 ? 'second-half' : undefined}>
              <button
                type="button"
                className={`sq ${row.status} ${row.winner ? `won-${row.winner}` : row.status === 'done' ? 'draw' : ''} ${row.current ? 'current' : ''}`}
                aria-current={row.current ? 'true' : undefined}
                aria-label={rowLabel(row, t, locale)}
                title={rowLabel(row, t, locale)}
                onClick={() => {
                  selectRound(row.roundId);
                  if (view !== 'live') setView('live');
                }}
              >
                {row.status === 'live' && <i className="sq-live" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ol>
      )}
      {score && (
        <span className="who">
          <b className="pts">{formatPoints(score.bPoints)}</b>
          <span className="who-name" lang="en">
            {shortName(score.b)}
          </span>
          <span className="flag" aria-hidden="true">
            {flag(score.b)}
          </span>
        </span>
      )}
      {roundNo > 0 && <span className="game-now">{t.gameNo.replace('{n}', String(roundNo))}</span>}
    </div>
  );
}

/** The full list of games behind a button, with players, results and dates. */
export function GamesDrawer({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const show = () => {
    const d = dialog.current;
    if (!d) return;
    setOpen(true);
    if (typeof d.showModal === 'function') {
      if (!d.open) d.showModal();
    } else d.setAttribute('open', '');
  };
  const hide = () => {
    const d = dialog.current;
    if (d?.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
    setOpen(false);
  };

  return (
    <>
      <button type="button" className={`games-btn ${compact ? 'compact' : ''}`} aria-haspopup="dialog" aria-expanded={open} title={t.gamesOpen} onClick={show}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span>{t.games}</span>
      </button>
      <dialog
        ref={dialog}
        className="games-drawer"
        aria-label={t.games}
        // Escape and the browser's own close both end here.
        onClose={() => setOpen(false)}
        // A click on the dimmed page around the list closes it.
        onClick={e => {
          if (e.target === dialog.current) hide();
        }}
      >
        <div className="games-drawer-body">
          <div className="games-drawer-head">
            <h2>{t.games}</h2>
            <button type="button" className="btn ghost" onClick={hide}>
              {t.close}
            </button>
          </div>
          {open && <GameList onPick={hide} />}
        </div>
      </dialog>
    </>
  );
}
