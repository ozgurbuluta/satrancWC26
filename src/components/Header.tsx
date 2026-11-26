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
  const paused = useStore(s => s.paused);
  const view = useStore(s => s.view);
  const setView = useStore(s => s.setView);

  const words = t.title.split(' ');
  const titleHalves = [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')];
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
        {/* The site's own mark: a knight, drawn for it. */}
        <svg className="logo" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <rect className="logo-tile" width="64" height="64" rx="14" />
          <path
            className="logo-piece"
            d="M20 49c.4-8.500 4.600-13 10.200-18.200c-2.600.2-4.300 2.900-8.300 3.600c-3.200.6-6-1.300-5.400-4.400c.9-4.600 6.300-8.300 9.500-13.800c-.4-2.300-.3-4.400.4-6.400c2.200 1 3.900 2.400 5 4.200c9.900 1 15.600 9.200 15.600 19.600c0 5.900-1.600 10.400-1.900 15.400zM16 51.500h32a1.500 1.500 0 0 1 1.500 1.500v2H14.500v-2a1.500 1.500 0 0 1 1.500-1.500z"
          />
          <circle className="logo-tile" cx="27.200" cy="22.400" r="1.700" />
        </svg>
        <div>
          {/* Two halves that each stay whole: on a short bar the title breaks between them and nowhere else. */}
          <h1>
            <span>{titleHalves[0]}</span> <span>{titleHalves[1]}</span>
          </h1>
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
        <button className="lang" onClick={() => setSetting('lang', lang === 'tr' ? 'en' : 'tr')} aria-label={t.language}>
          {lang === 'tr' ? 'EN' : 'TR'}
        </button>
      </div>
    </header>
  );
}
