import { useShallow } from 'zustand/react/shallow';
import { POINTS_TO_WIN } from '../config';
import { useT } from '../hooks';
import { fedFlag, formatPoints, shortName } from '../lib/format';
import { selectScore, useStore } from '../store';
import { KNOWN_PLAYERS } from '../config';
import type { PlayerInfo } from '../lib/pgn';

const flagOf = (p: PlayerInfo, feds: Record<string, string>) =>
  fedFlag(p.fideId ? (feds[p.fideId] ?? KNOWN_PLAYERS[p.fideId]?.fed) : undefined);

export function MatchPanel() {
  const t = useT();
  const lang = useStore(s => s.settings.lang);
  const rounds = useStore(s => s.rounds);
  const roundId = useStore(s => s.roundId);
  const matchGames = useStore(s => s.matchGames);
  const tour = useStore(s => s.tour);
  const feds = useStore(s => s.feds);
  const resultVisible = useStore(s => s.resultVisible);
  const revealed = useStore(s => s.revealed);
  const liveGame = useStore(s => (s.gameId ? s.games[s.gameId] : undefined));
  const selectRound = useStore(s => s.selectRound);
  const score = useStore(useShallow(selectScore));
  const locale = lang === 'tr' ? 'tr-TR' : 'en-GB';

  const fmt = (ms: number | undefined) =>
    ms
      ? new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms)
      : '';

  const resultText = (r: string) => (r === '1/2-1/2' ? '½–½' : r === '1-0' ? '1–0' : r === '0-1' ? '0–1' : '');

  return (
    <div className="match">
      {score && (
        <div className="score-card">
          <div className="score-side">
            <span className="flag">{flagOf(score.a, feds)}</span>
            <span className="score-name">{shortName(score.a)}</span>
          </div>
          <div className="score-num">
            {formatPoints(score.aPoints)} <span>–</span> {formatPoints(score.bPoints)}
          </div>
          <div className="score-side right">
            <span className="score-name">{shortName(score.b)}</span>
            <span className="flag">{flagOf(score.b, feds)}</span>
          </div>
        </div>
      )}
      <p className="muted small center">
        {t.firstTo.replace('{n}', formatPoints(POINTS_TO_WIN))}
        {tour?.info?.tc ? ` · ${t.timeControl}: ${tour.info.tc}` : ''}
      </p>

      <ul className="schedule">
        {rounds.map((r, i) => {
          const mg = matchGames.find(g => g.roundNo === i + 1);
          const isCurrent = r.id === roundId;
          // The game being watched honours the sync delay; others use the feed's result.
          let result = mg?.result ?? '*';
          if (isCurrent && liveGame) result = resultVisible ? liveGame.result : '*';
          const done = result !== '*';
          const live = !done && (isCurrent ? revealed > 0 : !!r.ongoing);
          return (
            <li key={r.id}>
              <button className={`round ${isCurrent ? 'current' : ''}`} onClick={() => selectRound(r.id)}>
                <span className="round-no">{i + 1}</span>
                <span className="round-players">
                  {mg ? (
                    <>
                      <i className="dot white" /> {shortName(mg.white)} <span className="muted">–</span> {shortName(mg.black)}{' '}
                      <i className="dot black" />
                    </>
                  ) : (
                    r.name
                  )}
                </span>
                <span className="round-when">
                  {done ? (
                    <b>{resultText(result)}</b>
                  ) : live ? (
                    <span className="live-pill">{t.live}</span>
                  ) : (
                    <span className="muted">{fmt(r.startsAt)}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
