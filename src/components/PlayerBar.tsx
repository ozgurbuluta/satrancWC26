import { useNow } from '../hooks';
import { displayName, fedFlag, formatClock } from '../lib/format';
import type { GameData, PlayerInfo } from '../lib/pgn';
import { clocksAt, useStore } from '../store';
import { KNOWN_PLAYERS } from '../config';

const GLYPH: Record<string, string> = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

interface Props {
  game: GameData;
  color: 'white' | 'black';
  player: PlayerInfo;
  shown: number;
  atLiveEdge: boolean;
  captured: string[];
  /** Material lead in pawns for this player (0 or negative hides it). */
  lead: number;
}

export function PlayerBar({ game, color, player, shown, atLiveEdge, captured, lead }: Props) {
  const resultVisible = useStore(s => s.resultVisible);
  const delaySec = useStore(s => s.settings.delaySec);
  const fedFromFeed = useStore(s => (player.fideId ? s.feds[player.fideId] : undefined));
  const fed = fedFromFeed ?? (player.fideId ? KNOWN_PLAYERS[player.fideId]?.fed : undefined);

  const paused = useStore(s => s.paused);
  const ticking = atLiveEdge && !resultVisible && !paused && shown > 0;
  useNow(250, ticking);
  const clocks = clocksAt(game, shown, ticking, delaySec);
  const seconds = clocks[color];
  const running = clocks.running === color;
  const low = seconds !== undefined && seconds < 300;

  let outcome = '';
  if (resultVisible && atLiveEdge) {
    if (game.result === '1/2-1/2') outcome = '½';
    else if ((game.result === '1-0') === (color === 'white')) outcome = '1';
    else outcome = '0';
  }

  return (
    <div className={`player-bar ${running ? 'is-running' : ''}`}>
      <div className="avatar" aria-hidden="true">
        {fedFlag(fed) || <span>{displayName(player).charAt(0)}</span>}
      </div>
      <div className="player-meta">
        <div className="player-name">
          {player.title && <span className="title-badge">{player.title}</span>}
          <span className="name">{displayName(player)}</span>
          {player.rating && <span className="rating">{player.rating}</span>}
        </div>
        <div className="captured" aria-hidden="true">
          <span className={`pieces ${color === 'white' ? 'took-black' : 'took-white'}`}>
            {captured.map((r, i) => (
              <i key={i}>{GLYPH[r]}︎</i>
            ))}
          </span>
          {lead > 0 && <span className="lead">+{lead}</span>}
        </div>
      </div>
      {outcome && <div className={`outcome outcome-${outcome === '1' ? 'win' : outcome === '0' ? 'loss' : 'draw'}`}>{outcome}</div>}
      <div className={`clock ${running ? 'running' : ''} ${low ? 'low' : ''} clock-${color}`}>
        <span className="clock-icon" aria-hidden="true" />
        {formatClock(seconds)}
      </div>
    </div>
  );
}
