// Links a visitor can pass on.
//
// A shared link is built from nothing but the public address and two small
// numbers (or the puzzle corner's fragment). It is never derived from the
// address in the browser, so whatever that address carries (an own-visit
// marker, a test flag, where the visitor came from, a test broadcast) cannot
// travel with it.

/** Largest values a link may carry; the same bounds apply when a link is read. */
export const MAX_GAME_NO = 40;
export const MAX_PLY = 600;
export const PUZZLES_FRAGMENT = '#bulmaca';

export interface ShareTarget {
  view: 'live' | 'puzzles';
  /** 1-based game number of the match. */
  gameNo?: number;
  /** Half-moves played in the position to show (0 is the starting position). */
  ply?: number;
}

const inRange = (n: number | undefined, min: number, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

/**
 * The address links are built on: the public address when one is configured
 * (the page visitors see, when this site sits inside another), otherwise this
 * deployment's own. Only the origin and the path survive: no user name or
 * password, no query, no fragment.
 */
export const shareBase = (publicUrl: string | undefined, own: { origin: string; basePath: string }): string => {
  if (publicUrl) {
    try {
      const u = new URL(publicUrl);
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.origin + u.pathname;
    } catch {
      // not an address: fall through to this deployment's own
    }
  }
  return own.origin + (own.basePath.startsWith('/') ? own.basePath : `/${own.basePath}`);
};

/**
 * The link for what is on screen: one game and one position of it, or the
 * puzzle corner. Out-of-range or missing numbers are left out rather than
 * guessed, and a position without its game is never linked.
 */
export const buildShareUrl = (target: ShareTarget, publicUrl: string | undefined, own: { origin: string; basePath: string }): string => {
  const base = shareBase(publicUrl, own);
  if (target.view === 'puzzles') return base + PUZZLES_FRAGMENT;
  if (!inRange(target.gameNo, 1, MAX_GAME_NO)) return base;
  const query = new URLSearchParams({ parti: String(target.gameNo) });
  if (inRange(target.ply, 0, MAX_PLY)) query.set('hamle', String(target.ply));
  return `${base}?${query.toString()}`;
};

const wholeNumber = (value: string | null, min: number, max: number): number | undefined => {
  if (!value || !/^\d{1,3}$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? n : undefined;
};

/** Reads a shared link's two numbers from a query string. Anything malformed or out of range is ignored. */
export const readShareParams = (search: string): { gameNo?: number; ply?: number } => {
  const params = new URLSearchParams(search);
  return { gameNo: wholeNumber(params.get('parti'), 1, MAX_GAME_NO), ply: wholeNumber(params.get('hamle'), 0, MAX_PLY) };
};
