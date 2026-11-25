import { describe, expect, it } from 'vitest';
import { CONTEXT, EVENTS, gate, hostOf, originOf, sanitize, SYSTEM_KEYS } from '../src/lib/analytics';

const page = { origin: 'https://satranc.example', pathname: '/' };

/** Everything that would leave the page for this event, as one string to search. */
const wire = (event: unknown) => JSON.stringify(event);

// Made-up credentials for the tests. They are put together here from parts,
// so this file holds nothing shaped like a real credential and the
// repository's secret check can scan it like any other file.
const AT = String.fromCharCode(64);
/** A web address with a user name and password in it. */
const withLogin = (user: string, secret: string, rest: string) => `https://${user}:${secret}${AT}${rest}`;

describe('privacy contract: what an event may carry', () => {
  it('drops events that are not in the contract', () => {
    expect(gate({ event: 'something_new', properties: { a: 1 } }, page)).toBeNull();
    expect(gate({ event: '$autocapture', properties: { $el_text: 'secret' } }, page)).toBeNull();
    expect(gate({ event: '$identify', properties: {} }, page)).toBeNull();
    expect(gate(null, page)).toBeNull();
  });

  it('keeps only the named properties of an event, inside their bounds', () => {
    const out = gate(
      {
        event: 'game_select',
        properties: {
          how: 'auto',
          game_no: 3,
          board: 99, // out of range
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          pgn: '1. e4 e5',
          url: 'https://example.com/?token=abc',
          note: `someone${AT}example.com`,
        },
      },
      page,
    );
    expect(out?.properties).toMatchObject({ how: 'auto', game_no: 3 });
    for (const leaked of ['board', 'fen', 'pgn', 'url', 'note']) expect(out?.properties).not.toHaveProperty(leaked);
    expect(wire(out)).not.toContain('token=abc');
    expect(wire(out)).not.toContain('example.com/?');
  });

  it('rejects free text where a fixed word is expected', () => {
    expect(sanitize(EVENTS.tab_open, { tab: 'analysis' })).toEqual({ tab: 'analysis' });
    expect(sanitize(EVENTS.tab_open, { tab: 'https://evil.example/?q=1' })).toEqual({});
    expect(sanitize(EVENTS.setting_change, { setting: 'lang', value: 'tr' })).toEqual({ setting: 'lang', value: 'tr' });
    expect(sanitize(EVENTS.setting_change, { setting: 'customStream', value: 'https://youtu.be/abc?si=xyz' })).toEqual({});
  });

  it('rejects numbers that are out of range, fractional or not numbers', () => {
    expect(sanitize(EVENTS.sync_delay_set, { seconds: 15 })).toEqual({ seconds: 15 });
    expect(sanitize(EVENTS.sync_delay_set, { seconds: 9000 })).toEqual({});
    expect(sanitize(EVENTS.sync_delay_set, { seconds: 1.5 })).toEqual({});
    expect(sanitize(EVENTS.sync_delay_set, { seconds: '15' })).toEqual({});
    expect(sanitize(EVENTS.sync_delay_set, { seconds: Number.NaN })).toEqual({});
  });

  it('a pasted stream link is recorded as its platform only', () => {
    const pasted = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=SHARE_ID&list=PRIVATE_LIST';
    const out = gate({ event: 'stream_link_paste', properties: { platform: 'youtube', link: pasted, link_url: pasted } }, page);
    expect(out?.properties).toMatchObject({ platform: 'youtube' });
    expect(wire(out)).not.toContain('dQw4w9WgXcQ');
    expect(wire(out)).not.toContain('SHARE_ID');
    expect(wire(out)).not.toContain('PRIVATE_LIST');
  });

  it('an outbound click carries a bare hostname and nothing else of the link', () => {
    const out = gate(
      { event: 'outbound_click', properties: { link_domain: 'youtube.com', link_url: withLogin('user', 'pw', 'youtube.com/watch?v=abc&token=t0k3n#t=5') } },
      page,
    );
    expect(out?.properties).toMatchObject({ link_domain: 'youtube.com' });
    expect(wire(out)).not.toMatch(/user:pw|t0k3n|watch\?v/);
    // a "hostname" that smuggles a path or query is refused
    expect(sanitize(EVENTS.outbound_click, { link_domain: 'youtube.com/watch?v=abc' })).toEqual({});
    expect(sanitize(EVENTS.outbound_click, { link_domain: `user:pw${AT}youtube.com` })).toEqual({});
    expect(sanitize(EVENTS.outbound_click, { link_domain: 'a'.repeat(90) + '.com' })).toEqual({});
  });
});

describe('privacy contract: addresses', () => {
  it("sends this page's own address without credentials, query or fragment", () => {
    const out = gate(
      {
        event: '$pageview',
        properties: {
          $current_url: withLogin('reader', 'hunter2', 'satranc.example/?utm_source=newsletter&utm_campaign=someone%40example.com&t=SUBSCRIBER_TOKEN&internal=1#move-24'),
          $pathname: '/reset/RESET_TOKEN_123',
          token: 'phc_public',
        },
      },
      page,
    );
    expect(out?.properties?.$current_url).toBe('https://satranc.example/');
    expect(out?.properties?.$pathname).toBe('/');
    expect(wire(out)).not.toMatch(/reader|hunter2|utm_|newsletter|SUBSCRIBER_TOKEN|RESET_TOKEN_123|move-24|%40|internal=1/);
  });

  it('reduces a referrer to its origin: no path, no query, no credentials', () => {
    const referrers = [
      'https://mail.example.com/inbox/message/SECRET_MESSAGE_ID?session=SESSION_SECRET',
      withLogin('user', 'pass', 'intranet.example.org/reset-password/RESET_CODE?email=someone%40example.com'),
      'https://www.google.com/search?q=private+search+terms',
    ];
    for (const ref of referrers) {
      const out = gate({ event: '$pageview', properties: { $referrer: ref, $referring_domain: 'whatever.example/with/path' } }, page);
      expect(out?.properties?.$referrer).toBe(new URL(ref).origin);
      expect(out?.properties?.$referring_domain).toBe(new URL(ref).hostname);
      expect(wire(out)).not.toMatch(/SECRET_MESSAGE_ID|SESSION_SECRET|user:pass|RESET_CODE|%40|private\+search|with\/path/);
    }
  });

  it('treats a missing or non-web referrer as direct', () => {
    for (const ref of [undefined, '', '$direct', 'android-app://com.example/SECRET', 'javascript:alert(1)', 'not a url']) {
      const out = gate({ event: '$pageview', properties: { $referrer: ref } as Record<string, unknown> }, page);
      expect(out?.properties?.$referrer).toBe('$direct');
      expect(out?.properties?.$referring_domain).toBe('$direct');
      expect(wire(out)).not.toContain('SECRET');
    }
  });

  it('originOf and hostOf never return more than an origin or a hostname', () => {
    expect(originOf(withLogin('a', 'b', 'x.example.com:8443/p/q?r=s#t'))).toBe('https://x.example.com:8443');
    expect(originOf(`mailto:someone${AT}example.com`)).toBeUndefined();
    expect(hostOf('https://WWW.YouTube.com/watch?v=abc')).toBe('youtube.com');
    expect(hostOf('x.com/someone/status/1?s=20')).toBe('x.com');
    expect(hostOf('localhost')).toBeUndefined();
    expect(hostOf(`mailto:someone${AT}example.com`)).toBeUndefined();
    expect(hostOf(withLogin('user', 'pw', 'youtube.com/watch'))).toBeUndefined();
    expect(hostOf('ftp://files.example.com/x')).toBeUndefined();
    expect(hostOf('')).toBeUndefined();
  });
});

describe("privacy contract: PostHog's own properties", () => {
  it('removes everything outside the short allowlist, and all person data', () => {
    const noisy: Record<string, unknown> = {
      token: 'phc_public',
      distinct_id: '$posthog_cookieless',
      $cookieless_mode: true,
      $raw_user_agent: 'Mozilla/5.0',
      $host: 'satranc.example',
      $timezone: 'Europe/Istanbul',
      title: '23. Gukesh – Sindarov · CANLI',
      $browser_language: 'tr-TR',
      $screen_height: 844,
      $initial_referrer: 'https://mail.example.com/inbox/SECRET',
      $session_entry_url: 'https://satranc.example/?t=TOKEN',
      $ip: '203.0.113.9',
      $geoip_city_name: 'Istanbul',
      email: `someone${AT}example.com`,
      page_lang: 'tr',
      game_no: 2,
      game_state: 'live',
      referrer_domain: 'x.com',
      embed: 'framed',
    };
    const out = gate({ event: '$pageview', properties: noisy, $set: { email: `someone${AT}example.com` }, $set_once: { $initial_referrer: 'https://mail.example.com/SECRET' } }, page);
    const allowed = new Set([...SYSTEM_KEYS, ...Object.keys(CONTEXT), '$current_url', '$referrer', '$referring_domain']);
    for (const key of Object.keys(out!.properties!)) expect(allowed.has(key), `unexpected property ${key}`).toBe(true);
    expect(out).not.toHaveProperty('$set');
    expect(out).not.toHaveProperty('$set_once');
    expect(wire(out)).not.toMatch(/someone|SECRET|TOKEN|203\.0\.113|CANLI|tr-TR/);
    for (const gone of ['$geoip_city_name', '$ip', 'email', 'title', '$initial_referrer', '$session_entry_url']) expect(out?.properties).not.toHaveProperty(gone);
    expect(out?.properties).toMatchObject({ page_lang: 'tr', game_no: 2, game_state: 'live', referrer_domain: 'x.com', embed: 'framed' });
  });

  it('context properties obey their bounds too', () => {
    expect(sanitize(CONTEXT, { page_lang: 'de', layout: 'phone', game_no: 0, referrer_domain: 'x.com/secret/path', traffic_type: 'internal' })).toEqual({
      layout: 'phone',
      traffic_type: 'internal',
    });
  });

  it('every event in the contract only uses bounded property types', () => {
    for (const [name, schema] of Object.entries({ ...EVENTS, context: CONTEXT })) {
      for (const [prop, rule] of Object.entries(schema)) {
        const kinds = Object.keys(rule);
        expect(kinds.length, `${name}.${prop}`).toBe(1);
        expect(['oneOf', 'int', 'bool', 'hostname'], `${name}.${prop}`).toContain(kinds[0]);
      }
    }
  });
});

describe('privacy contract: sharing', () => {
  it('a shared link is recorded as its kind and whether copying worked, never as the link', () => {
    const out = gate(
      { event: 'share_link', properties: { kind: 'position', copied: true, url: 'https://ozgurakanay.com/satranc/?parti=3&hamle=24', parti: 3, hamle: 24 } },
      page,
    );
    expect(out?.properties).toMatchObject({ kind: 'position', copied: true });
    for (const leaked of ['url', 'parti', 'hamle']) expect(out?.properties).not.toHaveProperty(leaked);
    expect(wire(out)).not.toContain('hamle');
  });
});
