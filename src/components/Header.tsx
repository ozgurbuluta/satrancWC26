import { useShallow } from 'zustand/react/shallow';
import { GAMES_IN_MATCH, IS_MATCH, KNOWN_PLAYERS } from '../config';
import { useNow, useT } from '../hooks';
import { fedFlag, formatCountdown, formatPoints, shortName } from '../lib/format';
import type { PlayerInfo } from '../lib/pgn';
import { selectScore, useStore } from '../store';
import { GamesDrawer } from './GamesMenu';

/** `gamesButton`: the game list is not on screen beside the board, so the header offers it. */
export function Header({ gamesButton = false }: { gamesButton?: boolean }) {
  const t = useT();
  const lang = useStore(s => s.settings.lang);
  const setSetting = useStore(s => s.setSetting);
  const rounds = useStore(s => s.rounds);
  const roundId = useStore(s => s.roundId);
  const revealed = useStore(s => s.revealed);
  const resultVisible = useStore(s => s.resultVisible);
  const feed = useStore(s => s.feed);
  const feds = useStore(s => s.feds);
  const delaySec = useStore(s => s.settings.delaySec);
  const paused = useStore(s => s.paused);
  const view = useStore(s => s.view);
  const setView = useStore(s => s.setView);
  const score = useStore(useShallow(selectScore));

  const roundIdx = rounds.findIndex(r => r.id === roundId);
  const round = rounds[roundIdx];
  const waiting = revealed === 0 && !resultVisible;
  const now = useNow(1000, waiting);
  const flag = (p: PlayerInfo) => fedFlag(p.fideId ? (feds[p.fideId] ?? KNOWN_PLAYERS[p.fideId]?.fed) : undefined);

  let status: React.ReactNode = null;
  if (paused) status = <span className="pill paused">⏸ {t.pausedPill}</span>;
  else if (resultVisible) status = <span className="pill done">{t.finished}</span>;
  else if (revealed > 0)
    status = (
      <span className="pill live">
        <i className="pulse" />
        {t.live}
      </span>
    );
  else if (round?.startsAt && round.startsAt > now)
    status = (
      <span className="pill soon">
        <span className="lbl">{t.startsIn}</span> <b>{formatCountdown(round.startsAt - now)}</b>
      </span>
    );
  else if (round) status = <span className="pill soon">{t.startingSoon}</span>;

  return (
    <header className="top">
      {gamesButton && <GamesDrawer />}
      <div className="brand">
        <span className="logo" aria-hidden="true" />
        <div>
          <h1>{t.title}</h1>
          <p>
            {t.location}
            {round
              ? IS_MATCH && roundIdx + 1 > GAMES_IN_MATCH
                ? ` · ${t.tiebreak}`
                : ` · ${t.game} ${roundIdx + 1} ${t.of} ${IS_MATCH ? GAMES_IN_MATCH : rounds.length}`
              : ''}
          </p>
        </div>
      </div>

      <nav className="viewnav" aria-label={t.title}>
        <button className={view === 'live' ? 'active' : ''} aria-current={view === 'live' ? 'page' : undefined} onClick={() => setView('live')}>
          {t.viewLive}
        </button>
        <button className={view === 'puzzles' ? 'active' : ''} aria-current={view === 'puzzles' ? 'page' : undefined} onClick={() => setView('puzzles')}>
          {t.viewPuzzles}
        </button>
      </nav>

      {score && (
        <div className="scoreline" aria-label="score">
          <span className="who">
            <span className="flag">{flag(score.a)}</span> {shortName(score.a)}
          </span>
          <span className="pts">
            {formatPoints(score.aPoints)}
            <i>–</i>
            {formatPoints(score.bPoints)}
          </span>
          <span className="who">
            {shortName(score.b)} <span className="flag">{flag(score.b)}</span>
          </span>
        </div>
      )}

      <div className="top-right">
        {delaySec > 0 && !paused && <span className="pill delay">{t.boardDelayed.replace('{n}', String(delaySec))}</span>}
        {status}
        <span
          className={`feed-dot ${feed}`}
          title={feed === 'live' ? t.feedLive : feed === 'polling' ? t.feedPolling : t.feedConnecting}
          aria-label={feed === 'live' ? t.feedLive : feed === 'polling' ? t.feedPolling : t.feedConnecting}
        />
        <button className="lang" onClick={() => setSetting('lang', lang === 'tr' ? 'en' : 'tr')} aria-label={t.language}>
          {lang === 'tr' ? 'EN' : 'TR'}
        </button>
      </div>
    </header>
  );
}
