import { KNOWN_PLAYERS, POINTS_TO_WIN } from '../config';
import { useT } from '../hooks';
import { describeTimeControl, parseInfoTimeControl, parseTimeControl } from '../lib/clock';
import { fedFlag, formatPoints, shortName } from '../lib/format';
import type { PlayerInfo } from '../lib/pgn';
import { selectScore, useStore } from '../store';
import { GameList } from './GamesMenu';

const flagOf = (p: PlayerInfo, feds: Record<string, string>) =>
  fedFlag(p.fideId ? (feds[p.fideId] ?? KNOWN_PLAYERS[p.fideId]?.fed) : undefined);

export function MatchPanel() {
  const t = useT();
  // This panel reads most of the state, so it simply follows all of it.
  const state = useStore();
  const { tour, feds } = state;
  const score = selectScore(state);
  // The broadcast describes its time control in English. It is said again in the viewer's language where it can be
  // read; where it cannot, the English page shows it as it came and the Turkish page leaves it out.
  const periods = parseInfoTimeControl(tour?.info?.tc) ?? parseTimeControl(tour?.info?.tc);
  const tempo = periods ? describeTimeControl(periods, t) : state.settings.lang === 'en' ? tour?.info?.tc : undefined;

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
      <p className="muted small center">{t.firstTo.replace('{n}', formatPoints(POINTS_TO_WIN))}</p>
      {tempo && (
        <p className="muted small center">
          {t.timeControl}: {tempo}
        </p>
      )}

      <GameList />
    </div>
  );
}
