import { describe, expect, it } from 'vitest';
import { embedHosts } from '../src/lib/embed';
import { parseStreamLink, twitch } from '../src/lib/streamLinks';

const origins = (list: string[]) => ({ length: list.length, item: (i: number) => list[i] ?? null });

describe('Twitch inside nested frames', () => {
  it('names every ancestor site, innermost first', () => {
    const hosts = embedHosts(origins(['https://ozgurakanay.com', 'https://outer.example']), undefined, true, 'satrancwc26.vercel.app');
    expect(hosts).toEqual(['satrancwc26.vercel.app', 'ozgurakanay.com', 'outer.example']);
    const src = new URL(twitch('chesscomturkce', hosts));
    expect(src.searchParams.getAll('parent')).toEqual(['satrancwc26.vercel.app', 'ozgurakanay.com', 'outer.example']);
    expect(src.searchParams.get('channel')).toBe('chesscomturkce');
  });

  it('falls back to the public address where the browser hides the chain (Firefox)', () => {
    expect(embedHosts(undefined, 'https://ozgurakanay.com/satranc/', true, 'satrancwc26.vercel.app')).toEqual(['satrancwc26.vercel.app', 'ozgurakanay.com']);
  });

  it('names only itself when it is not framed', () => {
    expect(embedHosts(origins([]), 'https://ozgurakanay.com/satranc/', false, 'satrancwc26.vercel.app')).toEqual(['satrancwc26.vercel.app']);
  });

  it('does not repeat a host and ignores entries that are not web addresses', () => {
    expect(embedHosts(origins(['https://ozgurakanay.com', 'null', 'https://ozgurakanay.com']), 'https://ozgurakanay.com/satranc/', true, 'a.example')).toEqual([
      'a.example',
      'ozgurakanay.com',
    ]);
  });
});

describe('pasted stream links', () => {
  it('accepts YouTube, Twitch and Kick links', () => {
    expect(parseStreamLink('https://www.youtube.com/watch?v=Q102LHSWMOg&si=abc')?.src).toBe('https://www.youtube.com/embed/Q102LHSWMOg?rel=0');
    expect(parseStreamLink('youtu.be/Q102LHSWMOg')?.src).toBe('https://www.youtube.com/embed/Q102LHSWMOg?rel=0');
    expect(parseStreamLink('https://www.youtube.com/live/Q102LHSWMOg')?.src).toBe('https://www.youtube.com/embed/Q102LHSWMOg?rel=0');
    expect(parseStreamLink('https://www.twitch.tv/chesscomturkce')?.src).toMatch(/^https:\/\/player\.twitch\.tv\/\?channel=chesscomturkce&parent=/);
    expect(parseStreamLink('kick.com/chesscomtr')?.src).toBe('https://player.kick.com/chesscomtr');
  });

  it('refuses everything else, so only known players can be framed', () => {
    for (const bad of ['https://evil.example/embed', 'javascript:alert(1)', 'https://youtube.com.evil.example/watch?v=Q102LHSWMOg', 'https://www.youtube.com/@handle', '', 'not a link']) {
      expect(parseStreamLink(bad), bad).toBeUndefined();
    }
  });
});
