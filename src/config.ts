// Match configuration. Everything here is public data from the Lichess broadcast.

const params = new URLSearchParams(window.location.search);

/** Lichess broadcast tournament id. `?tour=` overrides it, which is handy for testing on any live broadcast. */
const DEFAULT_TOUR_ID = 'qfkdt8mn';
export const TOUR_ID = params.get('tour') || DEFAULT_TOUR_ID;
/** False when the page is pointed at another broadcast for testing. */
export const IS_MATCH = TOUR_ID === DEFAULT_TOUR_ID;
/** Optional `?round=` forces a specific round id. */
export const FORCED_ROUND_ID = params.get('round');

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
  /** Exact video per game number, when known. Falls back to the channel's live stream. */
  videos?: Record<number, string>;
}

/**
 * Checked on 24 Nov 2026. Chess.com Türkçe streams on YouTube, Twitch and Kick,
 * but YouTube is its main home (largest audience by far, the match stream is
 * scheduled there, and the embed needs no per-domain setup), so only YouTube is
 * listed. Twitch and Kick links can still be pasted.
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
    id: 'yt-satranchess',
    label: 'SatranChess',
    lang: 'tr',
    channelId: 'UCwsdTtR9Lwl1TpoY2vPgjNw',
    url: 'https://www.youtube.com/@SatranChess/live',
    videos: { 1: '3R1Hin3lQgI' },
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
  },
];

/** Listed first in the score line. */
export const CHAMPION_FIDE_ID = '46616543';

export const REPO_URL = 'https://github.com/ozgurbuluta/satrancWC26';
