import { useNow, useT } from '../hooks';
import { formatCountdown } from '../lib/format';
import { useStore } from '../store';
import { GamesDrawer, MatchStrip } from './GamesMenu';

/** `squares`: there is room for one square per game in the bar. Without them the full list is one button away. */
export function Header({ squares = false }: { squares?: boolean }) {
  const t = useT();
  const lang = useStore(s => s.settings.lang);
  const setSetting = useStore(s => s.setSetting);
  const rounds = useStore(s => s.rounds);
  const roundId = useStore(s => s.roundId);
  const revealed = useStore(s => s.revealed);
  const resultVisible = useStore(s => s.resultVisible);
  const feed = useStore(s => s.feed);
  const paused = useStore(s => s.paused);
  const view = useStore(s => s.view);
  const setView = useStore(s => s.setView);

  const roundIdx = rounds.findIndex(r => r.id === roundId);
  const round = rounds[roundIdx];
  const waiting = revealed === 0 && !resultVisible;
  const now = useNow(1000, waiting);

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
      <GamesDrawer compact={squares} />
      <div className="brand">
        <span className="logo" aria-hidden="true" />
        <div>
          <h1>{t.title}</h1>
          <p>{t.location}</p>
        </div>
      </div>

      <MatchStrip squares={squares} />

      <nav className="viewnav" aria-label={t.title}>
        <button className={view === 'live' ? 'active' : ''} aria-current={view === 'live' ? 'page' : undefined} onClick={() => setView('live')}>
          {t.viewLive}
        </button>
        <button className={view === 'puzzles' ? 'active' : ''} aria-current={view === 'puzzles' ? 'page' : undefined} onClick={() => setView('puzzles')}>
          {t.viewPuzzles}
        </button>
      </nav>

      <div className="top-right">
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
