import { LICHESS } from '../config';

export interface RoundInfo {
  id: string;
  name: string;
  slug: string;
  startsAt?: number;
  ongoing?: boolean;
  finished?: boolean;
  url: string;
}

export interface TournamentInfo {
  tour: {
    id: string;
    name: string;
    slug: string;
    info?: { tc?: string; location?: string; players?: string; format?: string };
    url: string;
  };
  rounds: RoundInfo[];
  defaultRoundId?: string;
}

export interface RoundJsonGame {
  id: string;
  name: string;
  fen?: string;
  lastMove?: string;
  thinkTime?: number;
  status?: string;
  players?: { name: string; title?: string; rating?: number; fideId?: number; fed?: string; clock?: number }[];
}

export interface RoundJson {
  round: RoundInfo;
  games: RoundJsonGame[];
  photos?: Record<string, { small?: string; medium?: string }>;
}

const json = async <T>(url: string, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
};

export const getTournament = (tourId: string) => json<TournamentInfo>(`${LICHESS}/api/broadcast/${tourId}`);

export const getRoundJson = (roundId: string) => json<RoundJson>(`${LICHESS}/api/broadcast/-/-/${roundId}`);

export const getRoundPgn = async (roundId: string, signal?: AbortSignal): Promise<string> => {
  const res = await fetch(`${LICHESS}/api/broadcast/round/${roundId}.pgn`, { signal });
  if (!res.ok) throw new Error(`${res.status} round pgn`);
  return res.text();
};

export const getTournamentPgn = async (tourId: string): Promise<string> => {
  const res = await fetch(`${LICHESS}/api/broadcast/${tourId}.pgn`);
  if (!res.ok) throw new Error(`${res.status} tournament pgn`);
  return res.text();
};

export type FeedStatus = 'connecting' | 'live' | 'polling';

/**
 * Follows a round with the lowest delay available.
 *
 * Primary path: Lichess' push stream, which sends a game's full PGN the moment
 * a move is added. Safety net: a slow poll of the round PGN that catches
 * anything a stalled connection missed, and speeds up while the stream is down.
 */
export const followRound = (
  roundId: string,
  onPgn: (pgn: string) => void,
  onStatus: (s: FeedStatus) => void,
): (() => void) => {
  let stopped = false;
  let ctrl: AbortController | undefined;
  let streamHealthy = false;
  let retry = 0;
  let pollTimer: number | undefined;

  const deliver = (pgn: string) => {
    if (!stopped && pgn.trim()) onPgn(pgn);
  };

  const runStream = async () => {
    while (!stopped) {
      ctrl = new AbortController();
      try {
        const res = await fetch(`${LICHESS}/api/stream/broadcast/round/${roundId}.pgn`, { signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!streamHealthy) {
            streamHealthy = true;
            retry = 0;
            onStatus('live');
          }
          buf += decoder.decode(value, { stream: true });
          // Each game ends with a blank-line gap; keep an incomplete tail buffered.
          const cut = buf.lastIndexOf('\n\n\n');
          if (cut === -1) continue;
          deliver(buf.slice(0, cut));
          buf = buf.slice(cut + 3);
        }
      } catch {
        // fall through to reconnect
      }
      if (stopped) return;
      streamHealthy = false;
      retry++;
      onStatus('polling');
      await new Promise(r => setTimeout(r, Math.min(8000, 800 * retry)));
    }
  };

  const poll = async () => {
    window.clearTimeout(pollTimer);
    if (stopped) return;
    try {
      deliver(await getRoundPgn(roundId));
    } catch {
      // ignore; the next tick retries
    }
    if (!stopped) pollTimer = window.setTimeout(poll, streamHealthy ? 20000 : 2500);
  };

  // Phones suspend network streams in the background; refresh right away on return.
  const onVisible = () => {
    if (document.visibilityState === 'visible') void poll();
  };
  document.addEventListener('visibilitychange', onVisible);

  onStatus('connecting');
  void poll(); // paints the page immediately even if the stream is slow to open
  void runStream();

  return () => {
    stopped = true;
    ctrl?.abort();
    window.clearTimeout(pollTimer);
    document.removeEventListener('visibilitychange', onVisible);
  };
};
