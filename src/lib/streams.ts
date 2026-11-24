// Chooses the right YouTube video of a channel for a given game of the match.

export interface StreamEntry {
  id: string;
  title: string;
  /** ISO date the stream was created on YouTube. */
  published: string;
}

/** Recent live streams per YouTube channel id, newest first. */
export type StreamFeeds = Record<string, StreamEntry[]>;

export const fetchStreamFeeds = async (channelIds: string[]): Promise<StreamFeeds> => {
  const res = await fetch(`/api/streams?channels=${channelIds.join(',')}`);
  // A static host without the function answers with the page itself; treat that as "no data".
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) throw new Error('no stream feed');
  return ((await res.json()) as { channels: StreamFeeds }).channels;
};

// The players or the title sponsor must be named: "World Championship" alone also matches other events.
const ABOUT_MATCH = /gukesh|sindarov|salesforce/i;
const NOT_A_GAME = /ceremony|press conference|warm-?up|preview|council|closing|tören|basın toplantısı/i;

/** "Game 3", "Round 3", "3. Oyun", "3. Parti", "3. Gün" → 3 */
export const gameNumber = (title: string): number | undefined => {
  const m = /\b(?:game|round)\s*#?\s*(\d{1,2})\b/i.exec(title) ?? /(?:^|[^\d])(\d{1,2})\s*\.\s*(?:oyun|parti|gün|maç|tur)/i.exec(title);
  return m ? Number(m[1]) : undefined;
};

const newest = (list: StreamEntry[]): StreamEntry | undefined =>
  [...list].sort((a, b) => Date.parse(b.published) - Date.parse(a.published))[0];

/**
 * Video for game `roundNo`, or undefined to fall back to "whatever the channel
 * is streaming live right now".
 *
 * A title that names the game number is trusted for any game. Titles without a
 * number are only used for games that are over (to find that day's recording):
 * for the game being played, the channel's own live stream is the safer choice.
 */
export const pickVideo = (
  entries: StreamEntry[] | undefined,
  roundNo: number,
  round: { startsAt?: number; finished?: boolean } | undefined,
  exclude?: RegExp,
): string | undefined => {
  if (!entries?.length || roundNo < 1) return undefined;
  const candidates = entries.filter(e => ABOUT_MATCH.test(e.title) && !NOT_A_GAME.test(e.title) && !exclude?.test(e.title));
  const numbered = candidates.filter(e => gameNumber(e.title) === roundNo);
  if (numbered.length) return newest(numbered)!.id;
  if (!round?.finished || round.startsAt === undefined) return undefined;
  const cutoff = round.startsAt + 8 * 3600 * 1000;
  return newest(candidates.filter(e => gameNumber(e.title) === undefined && Date.parse(e.published) <= cutoff))?.id;
};
