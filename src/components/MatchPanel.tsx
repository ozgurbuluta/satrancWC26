import { KNOWN_PLAYERS, POINTS_TO_WIN } from '../config';
import { useT } from '../hooks';
import { fedFlag, formatPoints, shortName } from '../lib/format';
import type { PlayerInfo } from '../lib/pgn';
import { selectRoundNo, selectScore, useStore, visibleResult } from '../store';

const flagOf = (p: PlayerInfo, feds: Record<string, string>) =>
  fedFlag(p.fideId ? (feds[p.fideId] ?? KNOWN_PLAYERS[p.fideId]?.fed) : undefined);

export function MatchPanel() {
  const t = useT();
  // This panel reads most of the state, so it simply follows all of it.
  const state = useStore();
  const { rounds, roundId, matchGames, tour, feds, revealed, paused, selectRound } = state;
  const lang = state.settings.lang;
  const score = selectScore(state);
  const roundNo = selectRoundNo(state);
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
          const result = mg ? visibleResult(state, mg) : '*';
          const done = result !== '*';
          // While paused, later games are kept out of sight so the match score is not given away.
          const concealed = paused && i + 1 > roundNo && !!mg && mg.result !== '*';
          const live = !done && !concealed && (isCurrent ? revealed > 0 && !paused : !!r.ongoing);
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
                  ) : concealed ? (
                    <span className="muted">{t.hidden}</span>
                  ) : live ? (
                    <span className="live-pill">{t.live}</span>
                  ) : isCurrent && paused ? (
                    <span className="muted">⏸</span>
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
