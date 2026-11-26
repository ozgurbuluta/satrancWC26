// Match configuration. Everything here is public data from the Lichess broadcast.
import { readShareParams } from './lib/share';

const params = new URLSearchParams(window.location.search);

/** Lichess broadcast tournament id. `?tour=` overrides it, which is handy for testing on any live broadcast. */
const DEFAULT_TOUR_ID = 'qfkdt8mn';
export const TOUR_ID = params.get('tour') || DEFAULT_TOUR_ID;
/** False when the page is pointed at another broadcast for testing. */
export const IS_MATCH = TOUR_ID === DEFAULT_TOUR_ID;
/** Optional `?round=` forces a specific round id. */
export const FORCED_ROUND_ID = params.get('round');

/** Deep link: `?parti=3` opens game 3, `&hamle=24` shows the position after 24 half-moves. */
const linked = readShareParams(window.location.search);
export const LINKED_GAME_NO = linked.gameNo;
export const LINKED_PLY = linked.ply;

export const LICHESS = 'https://lichess.org';
export const GAMES_IN_MATCH = 14;
export const POINTS_TO_WIN = 7.5;

export interface KnownPlayer {
  name: string;
  short: string;
  fed: string;
}

/** Display names keyed by FIDE id (the feed uses "Surname, Name" forms). */
export const KNOWN_PLAYERS: Record<string, KnownPlayer> = {
  '46616543': { name: 'Gukesh Dommaraju', short: 'Gukesh', fed: 'IND' },
  '14205483': { name: 'Javokhir Sindarov', short: 'Sindarov', fed: 'UZB' },
};

export interface StreamPreset {
  id: string;
  label: string;
  lang: 'tr' | 'en';
  /** YouTube channel id; its current live stream is embedded when no video is pinned. */
  channelId: string;
  /** Page to open in a new tab. */
  url: string;
  /** Exact video per game number, when known. Otherwise the stream is found automatically. */
  videos?: Record<number, string>;
  /** Stream titles to skip when choosing automatically. */
  exclude?: RegExp;
}

/**
 * Checked on 26 Nov 2026, during game 3. Chess.com Türkçe streams on YouTube,
 * Twitch and Kick; YouTube is its main home (largest audience by far, the
 * match stream is scheduled there, and the embed needs no per-domain setup),
 * so only YouTube is listed.
 *
 * It is the only Turkish channel here. SatranChess was removed at Özgür's
 * request. A look at the live-stream feeds of some 150 Turkish chess channels
 * and at what was live on YouTube during the game found no other Turkish
 * channel streaming the match, so none was added.
 */
export const STREAM_PRESETS: StreamPreset[] = [
  {
    id: 'yt-chesscomtr',
    label: 'Chess.com Türkçe',
    lang: 'tr',
    channelId: 'UCTQbZcv-4ImPg9rC9jIjzpQ',
    url: 'https://www.youtube.com/@chesscomturkce/live',
    videos: { 1: 'Q102LHSWMOg' },
  },
  {
    id: 'yt-chesscom',
    label: 'Chess.com (EN)',
    lang: 'en',
    channelId: 'UC5kS0l76kC0xOzMPtOmSFGw',
    url: 'https://www.youtube.com/@chess/live',
    videos: { 1: '2JKUu5nRN8A' },
  },
  {
    id: 'yt-fide',
    label: 'FIDE (EN)',
    lang: 'en',
    channelId: 'UC9B47GnzCRFHTT1BIBWvStQ',
    url: 'https://www.youtube.com/@FIDE_chess/live',
    videos: { 1: '7dyXiy2kWsw' },
    // FIDE also runs a stream of the board without commentary
    exclude: /no commentary/i,
  },
];

/** Listed first in the score line. */
export const CHAMPION_FIDE_ID = '46616543';

export const REPO_URL = 'https://github.com/ozgurbuluta/satrancWC26';
