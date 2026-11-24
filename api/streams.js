// Vercel function: GET /api/streams?channels=<UC…>,<UC…>
//
// Lists each channel's recent live streams (video id, title, date) from
// YouTube's public channel feeds, so the page can open the right video for the
// game being watched without anyone updating links every day. The "UULV…"
// playlist of a channel holds only its live streams, which keeps shorts and
// clips from pushing a stream out of the 15-entry feed.
//
// The CDN caches the answer for a few minutes, so YouTube is asked rarely no
// matter how many people are watching.

const FEED = 'https://www.youtube.com/feeds/videos.xml?playlist_id=UULV';

const decode = s =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

export const parseFeed = xml => {
  const out = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = /<yt:videoId>([\w-]{11})<\/yt:videoId>/.exec(m[1])?.[1];
    const title = /<title>([^<]*)<\/title>/.exec(m[1])?.[1];
    const published = /<published>([^<]+)<\/published>/.exec(m[1])?.[1];
    if (id && title) out.push({ id, title: decode(title), published: published ?? '' });
  }
  return out;
};

export default async function handler(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const ids = (url.searchParams.get('channels') ?? '')
    .split(',')
    .filter(id => /^UC[\w-]{22}$/.test(id))
    .slice(0, 6);

  const channels = {};
  await Promise.all(
    ids.map(async id => {
      try {
        const r = await fetch(FEED + id.slice(2), { signal: AbortSignal.timeout(6000) });
        channels[id] = r.ok ? parseFeed(await r.text()) : [];
      } catch {
        channels[id] = [];
      }
    }),
  );

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=180, stale-while-revalidate=900');
  res.end(JSON.stringify({ channels }));
}
