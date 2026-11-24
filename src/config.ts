// Match configuration. Everything here is public data from the Lichess broadcast.

const params = new URLSearchParams(window.location.search);

/** Lichess broadcast tournament id. `?tour=` overrides it, which is handy for testing on any live broadcast. */
export const TOUR_ID = params.get('tour') || 'qfkdt8mn';
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
  kind: 'youtube-channel' | 'twitch' | 'kick';
  /** YouTube channel id, Twitch channel name or Kick channel slug. */
  ref: string;
  /** Page to open in a new tab. */
  url: string;
}

export const STREAM_PRESETS: StreamPreset[] = [
  {
    id: 'yt-chesscomtr',
    label: 'Chess.com Türkçe',
    lang: 'tr',
    kind: 'youtube-channel',
    ref: 'UCTQbZcv-4ImPg9rC9jIjzpQ',
    url: 'https://www.youtube.com/@chesscomturkce/live',
  },
  {
    id: 'tw-chesscomtr',
    label: 'Twitch TR',
    lang: 'tr',
    kind: 'twitch',
    ref: 'chesscomturkce',
    url: 'https://www.twitch.tv/chesscomturkce',
  },
  {
    id: 'kick-chesscomtr',
    label: 'Kick TR',
    lang: 'tr',
    kind: 'kick',
    ref: 'chesscomtr',
    url: 'https://kick.com/chesscomtr',
  },
  {
    id: 'yt-chesscomtr-plus',
    label: 'Türkçe +',
    lang: 'tr',
    kind: 'youtube-channel',
    ref: 'UCFCX2x3umRfv-Mih8iHQb9A',
    url: 'https://www.youtube.com/@chesscomtr/live',
  },
  {
    id: 'yt-fide',
    label: 'FIDE (EN)',
    lang: 'en',
    kind: 'youtube-channel',
    ref: 'UC9B47GnzCRFHTT1BIBWvStQ',
    url: 'https://www.youtube.com/@FIDE_chess/live',
  },
  {
    id: 'yt-chesscom',
    label: 'Chess.com (EN)',
    lang: 'en',
    kind: 'youtube-channel',
    ref: 'UC5kS0l76kC0xOzMPtOmSFGw',
    url: 'https://www.youtube.com/@chess/live',
  },
];

/** Listed first in the score line. */
export const CHAMPION_FIDE_ID = '46616543';

export const REPO_URL = 'https://github.com/ozgurbuluta/satrancWC26';
