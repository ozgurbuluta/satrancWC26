import { useEffect, useRef, useState } from 'react';
import { GAMES_IN_MATCH, IS_MATCH } from '../config';
import { useT } from '../hooks';
import { shortName } from '../lib/format';
import { selectGameData, selectRoundNo, useStore, visibleResult } from '../store';

const resultText = (r: string) => (r === '1/2-1/2' ? '½–½' : r === '1-0' ? '1–0' : r === '0-1' ? '0–1' : '');

/**
 * The games of the match: played, being played and still to come. Results
 * follow the same rules as everywhere else: the open game honours the delay
 * and the pause, and while paused later games stay hidden.
 */
export function GameList({ onPick }: { onPick?: () => void }) {
  const t = useT();
  // The list reads most of the state, so it simply follows all of it.
  const state = useStore();
  const { rounds, roundId, matchGames, revealed, paused, resultVisible, gameOrder, games, gameId, view, selectRound, selectGame, setView } = state;
  const roundNo = selectRoundNo(state);
  const open = selectGameData(state);
  const locale = state.settings.lang === 'tr' ? 'tr-TR' : 'en-GB';
  const box = useRef<HTMLOListElement>(null);
  const currentRow = useRef<HTMLLIElement>(null);

  // Where the list scrolls by itself (beside the board, in the drawer), keep the open game in sight.
  useEffect(() => {
    const list = box.current;
    const row = currentRow.current;
    if (!list || !row || list.scrollHeight <= list.clientHeight) return;
    list.scrollTop = row.offsetTop - list.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2;
  }, [roundId, rounds.length]);

  const when = (ms: number | undefined) =>
    ms ? new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms) : '';

  const pick = (go: () => void) => {
    go();
    if (view !== 'live') setView('live');
    onPick?.();
  };

  return (
    <ol className="game-list" ref={box}>
      {rounds.map((r, i) => {
        const n = i + 1;
        const mg = matchGames.find(g => g.roundNo === n);
        const isCurrent = r.id === roundId;
        // A day with several boards has no single result; its boards are listed underneath.
        const several = isCurrent && gameOrder.length > 1;
        const white = isCurrent && open && !several ? open.white : mg?.white;
        const black = isCurrent && open && !several ? open.black : mg?.black;
        const result = several ? '*' : isCurrent && open ? (resultVisible ? open.result : '*') : mg ? visibleResult(state, mg) : '*';
        const done = result !== '*';
        // While paused, later games are kept out of sight so the match score is not given away.
        const concealed = paused && roundNo > 0 && n > roundNo && !!mg && mg.result !== '*';
        const live = !done && !concealed && (isCurrent ? revealed > 0 && !paused : !!r.ongoing);
        const waiting = isCurrent && paused && !done;
        const status = done
          ? resultText(result)
          : concealed
            ? t.hidden
            : live
              ? isCurrent && !several
                ? `${t.live}, ${t.atMove.replace('{n}', String(Math.ceil(revealed / 2)))}`
                : t.live
              : waiting
                ? t.pausedPill
                : when(r.startsAt);
        // A game still to come has no colours yet; its row says when it starts instead.
        const known = !!white && !!black;
        const names = known ? `${shortName(white)} – ${shortName(black)}` : '';
        const tiebreak = IS_MATCH && n > GAMES_IN_MATCH;
        const dated = !done && !concealed && !live && !waiting;
        return (
          <li key={r.id} ref={isCurrent ? currentRow : undefined}>
            <button
              type="button"
              className={`game-row ${isCurrent ? 'current' : ''} ${done ? 'done' : live ? 'live' : 'ahead'}`}
              aria-current={isCurrent ? 'true' : undefined}
              aria-label={[t.gameNo.replace('{n}', String(n)) + (names ? `: ${names}` : ''), status, isCurrent ? t.gameOpenNow : ''].filter(Boolean).join(', ')}
              onClick={() => pick(() => selectRound(r.id))}
            >
              <span className="game-no" aria-hidden="true">
                {n}
              </span>
              <span className="game-main" aria-hidden="true">
                <span className="game-players">
                  {white && black ? (
                    <>
                      <i className="dot white" />
                      <span className={result === '1-0' ? 'won' : ''}>{shortName(white)}</span>
                      <span className="muted">–</span>
                      <span className={result === '0-1' ? 'won' : ''}>{shortName(black)}</span>
                      <i className="dot black" />
                    </>
                  ) : (
                    <span>{(dated && when(r.startsAt)) || t.gameNo.replace('{n}', String(n))}</span>
                  )}
                </span>
                {(!dated || known || tiebreak) && (
                  <span className="game-status">
                    {done ? (
                      <b>{resultText(result)}</b>
                    ) : concealed ? (
                      <span className="muted">{t.hidden}</span>
                    ) : live ? (
                      <>
                        <span className="live-pill">{t.live}</span>
                        {isCurrent && !several && <span className="muted">{t.atMove.replace('{n}', String(Math.ceil(revealed / 2)))}</span>}
                      </>
                    ) : waiting ? (
                      <span className="muted">⏸ {t.pausedPill}</span>
                    ) : (
                      known && <span className="muted">{when(r.startsAt)}</span>
                    )}
                    {tiebreak && <span className="muted">{t.tiebreak}</span>}
                  </span>
                )}
              </span>
            </button>
            {several && (
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

/** The game list beside the board, on screens with room for it. */
export function GamesRail() {
  const t = useT();
  return (
    <nav className="games-rail" aria-label={t.games}>
      <h2>{t.games}</h2>
      <GameList />
    </nav>
  );
}

/** The game list behind a button, for screens where it would take room from the board. */
export function GamesDrawer() {
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
      <button type="button" className="games-btn" aria-haspopup="dialog" aria-expanded={open} title={t.gamesOpen} onClick={show}>
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
