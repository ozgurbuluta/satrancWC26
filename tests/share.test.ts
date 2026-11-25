import { describe, expect, it } from 'vitest';
import { buildShareUrl, readShareParams, shareBase } from '../src/lib/share';

const PUBLIC = 'https://ozgurakanay.com/satranc/';
const OWN = { origin: 'https://satrancwc26.vercel.app', basePath: '/' };

describe('share links', () => {
  it('link to a position: the public address plus the game and the half-move, nothing else', () => {
    const url = buildShareUrl({ view: 'live', gameNo: 3, ply: 24 }, PUBLIC, OWN);
    expect(url).toBe('https://ozgurakanay.com/satranc/?parti=3&hamle=24');
    expect([...new URL(url).searchParams.keys()]).toEqual(['parti', 'hamle']);
    expect(new URL(url).hash).toBe('');
  });

  it('link to the start of a game keeps hamle=0', () => {
    expect(buildShareUrl({ view: 'live', gameNo: 1, ply: 0 }, PUBLIC, OWN)).toBe('https://ozgurakanay.com/satranc/?parti=1&hamle=0');
  });

  it('link to the puzzle corner is the fragment only, with no query', () => {
    const url = buildShareUrl({ view: 'puzzles', gameNo: 3, ply: 24 }, PUBLIC, OWN);
    expect(url).toBe('https://ozgurakanay.com/satranc/#bulmaca');
    expect(new URL(url).search).toBe('');
  });

  it('never carries anything that is in the configured public address beyond its origin and path', () => {
    const at = String.fromCharCode(64);
    const noisy = `https://someone:secret${at}ozgurakanay.com/satranc/?internal=1&posthog=test&ref=x.com&utm_source=newsletter&tour=abc&round=xyz#bulmaca`;
    for (const target of [{ view: 'live' as const, gameNo: 2, ply: 31 }, { view: 'puzzles' as const }]) {
      const url = buildShareUrl(target, noisy, OWN);
      expect(url).not.toMatch(/internal|posthog|ref=|utm_|tour|round|someone|secret/);
      expect(new URL(url).username).toBe('');
      expect(new URL(url).origin + new URL(url).pathname).toBe(PUBLIC);
    }
    expect(buildShareUrl({ view: 'live', gameNo: 2, ply: 31 }, noisy, OWN)).toBe('https://ozgurakanay.com/satranc/?parti=2&hamle=31');
  });

  it('leaves out numbers that are missing or out of range instead of guessing', () => {
    expect(buildShareUrl({ view: 'live' }, PUBLIC, OWN)).toBe(PUBLIC);
    expect(buildShareUrl({ view: 'live', ply: 12 }, PUBLIC, OWN)).toBe(PUBLIC); // a position without its game is not linked
    expect(buildShareUrl({ view: 'live', gameNo: 0, ply: 12 }, PUBLIC, OWN)).toBe(PUBLIC);
    expect(buildShareUrl({ view: 'live', gameNo: 41, ply: 12 }, PUBLIC, OWN)).toBe(PUBLIC);
    expect(buildShareUrl({ view: 'live', gameNo: 3, ply: 601 }, PUBLIC, OWN)).toBe('https://ozgurakanay.com/satranc/?parti=3');
    expect(buildShareUrl({ view: 'live', gameNo: 3, ply: -1 }, PUBLIC, OWN)).toBe('https://ozgurakanay.com/satranc/?parti=3');
    expect(buildShareUrl({ view: 'live', gameNo: 3.5, ply: 2.5 }, PUBLIC, OWN)).toBe(PUBLIC);
    expect(buildShareUrl({ view: 'live', gameNo: Number.NaN, ply: Number.POSITIVE_INFINITY }, PUBLIC, OWN)).toBe(PUBLIC);
  });

  it("without a public address, uses this deployment's own origin and base path", () => {
    expect(buildShareUrl({ view: 'live', gameNo: 2, ply: 5 }, undefined, OWN)).toBe('https://satrancwc26.vercel.app/?parti=2&hamle=5');
    expect(buildShareUrl({ view: 'puzzles' }, undefined, { origin: 'https://example.org', basePath: '/satranc/' })).toBe('https://example.org/satranc/#bulmaca');
  });

  it('ignores a public address that is not a web address', () => {
    for (const bad of ['javascript:alert(1)', 'not a url', 'data:text/html,x', 'ftp://example.org/x', '']) {
      expect(shareBase(bad, OWN)).toBe('https://satrancwc26.vercel.app/');
    }
  });

  it('a link that was built is read back as the same game and move', () => {
    for (const [gameNo, ply] of [[1, 0], [3, 24], [14, 187], [40, 600]]) {
      const url = new URL(buildShareUrl({ view: 'live', gameNo, ply }, PUBLIC, OWN));
      expect(readShareParams(url.search)).toEqual({ gameNo, ply });
    }
  });

  it('reading a link ignores anything malformed or out of range', () => {
    expect(readShareParams('?parti=3&hamle=24&internal=1&ref=x.com')).toEqual({ gameNo: 3, ply: 24 });
    expect(readShareParams('?parti=0&hamle=601')).toEqual({ gameNo: undefined, ply: undefined });
    expect(readShareParams('?parti=3abc&hamle=-1')).toEqual({ gameNo: undefined, ply: undefined });
    expect(readShareParams('?parti=%3Cscript%3E&hamle=1e3')).toEqual({ gameNo: undefined, ply: undefined });
    expect(readShareParams('?parti=0003')).toEqual({ gameNo: undefined, ply: undefined }); // four digits: refused outright
    expect(readShareParams('')).toEqual({ gameNo: undefined, ply: undefined });
  });
});
