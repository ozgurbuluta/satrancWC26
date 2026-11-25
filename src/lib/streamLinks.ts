// Turns stream presets and pasted links into embeddable player addresses.
import { embedHosts } from './embed';

export interface Embed {
  /** Address for the player frame. */
  src: string;
  /** Page to open in a new tab. */
  url: string;
}

export const youtubeChannel = (id: string): string => `https://www.youtube.com/embed/live_stream?channel=${id}`;
export const youtubeVideo = (id: string): string => `https://www.youtube.com/embed/${id}?rel=0`;

/**
 * Twitch refuses to play unless every site in the embedding chain is named:
 * this one and, when this page is itself shown inside another page, each of
 * the pages around it. One `parent` parameter per host.
 */
export const twitch = (name: string, hosts: string[] = embedHosts()): string =>
  `https://player.twitch.tv/?channel=${name}${hosts.map(h => `&parent=${encodeURIComponent(h)}`).join('')}&autoplay=false`;

export const kick = (name: string): string => `https://player.kick.com/${name}`;

/** Turns a pasted YouTube, Twitch or Kick link into an embeddable player address. Anything else: undefined. */
export const parseStreamLink = (input: string): Embed | undefined => {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return undefined;
  }
  const h = u.hostname.replace(/^(www|m)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  const okId = (s: string | null | undefined): s is string => !!s && /^[\w-]{6,}$/.test(s);
  if (h === 'youtu.be' && okId(parts[0])) return { src: youtubeVideo(parts[0]), url: u.href };
  if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (okId(v)) return { src: youtubeVideo(v), url: u.href };
    if (['live', 'embed', 'shorts'].includes(parts[0]) && okId(parts[1])) return { src: youtubeVideo(parts[1]), url: u.href };
    if (parts[0] === 'channel' && /^UC[\w-]{22}$/.test(parts[1] ?? '')) return { src: youtubeChannel(parts[1]), url: u.href };
    return undefined;
  }
  if (h === 'twitch.tv' && parts[0] && /^\w+$/.test(parts[0])) return { src: twitch(parts[0]), url: u.href };
  if (h === 'kick.com' && parts[0] && /^[\w-]+$/.test(parts[0])) return { src: kick(parts[0]), url: u.href };
  return undefined;
};
