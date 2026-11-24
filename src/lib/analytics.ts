/* ============================================================
   analytics.ts — PostHog, cookieless.

   Same approach as ozgurakanay.com, writing to this site's OWN PostHog
   project (the key comes from VITE_POSTHOG_KEY, never from another site):
   - PostHog Cloud EU, reached through /olay on this site (vercel.json
     rewrites it to PostHog's EU ingestion host).
   - No analytics cookies and no PostHog persistence in the browser:
     cookieless_mode 'always' counts visitors with a daily hash on PostHog's
     servers (the project setting "cookieless tracking" must be on), and no
     person profiles are made.
   - Only the named events below leave the page. Autocapture, rage and dead
     clicks, heatmaps, exceptions, web vitals, session replay, surveys,
     product tours, feature flags and any script from PostHog are off.
   - The library is the slim build, bundled with this site and loaded after
     the page is interactive, so it never delays the board.

   Whether a page counts:
   - no key (local dev, previews without the variable): nothing is sent;
   - VITE_ANALYTICS_HOST set: only that host counts, unless the tab was
     opened with ?posthog=test (events then carry traffic_type=test);
   - a visitor who turned statistics off in Settings sends nothing;
   - ?internal=1 marks this browser's events traffic_type=internal.
   ============================================================ */

export type EventProps = Record<string, string | number | boolean | null | undefined>;

const KEY = (import.meta.env.VITE_POSTHOG_KEY as string | undefined)?.trim();
const API_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined)?.trim() || '/olay';
const PROD_HOST = (import.meta.env.VITE_ANALYTICS_HOST as string | undefined)?.trim();

const OFF_KEY = 'analytics-off';
const INTERNAL_KEY = 'analytics-internal';
const TEST_KEY = 'posthog-test';

const local = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      // storage blocked: the choice simply does not stick
    }
  },
};

/** True when this build has a PostHog project to write to. */
export const analyticsConfigured = !!KEY;

export const isOptedOut = (): boolean => local.get(OFF_KEY) === '1';

/** The visitor's statistics switch. The page reloads so what it says and does stay the same. */
export const setOptedOut = (off: boolean) => {
  local.set(OFF_KEY, off ? '1' : null);
  window.location.reload();
};

// ---- what leaves the page ----

const OWN = [window.location.hostname];
// query parameters kept on this site's own URLs: campaign tags and the broadcast being viewed
const KEEP = /^(utm_(source|medium|campaign|content|term)|tour|round)$/;
// removed from links to other sites: credentials, ad-click and share ids
const SECRET = /^(token|access_token|id_token|auth|key|api_key|apikey|sig|signature|password|secret|sessionid|email|si|gclid|gbraid|wbraid|dclid|fbclid|msclkid|ttclid|twclid|li_fat_id|igshid|mc_eid|_hsenc|_hsmi)$/i;
const EMAIL = /[^\s@/?#&=:;,]+@[^\s@/?#&=:;,]+\.[a-z]{2,}/i;
const REDACTED = '[redacted]';
const decoded = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
const hasEmail = (s: string) => EMAIL.test(decoded(s));

/** kind: 'page' for this site's own URLs, 'referrer', or 'link' for a link to another site. */
const cleanUrl = (value: string, kind: 'page' | 'referrer' | 'link'): string => {
  let u: URL;
  try {
    u = new URL(value, window.location.href);
  } catch {
    return hasEmail(value) ? REDACTED : value;
  }
  if (!/^https?:$/.test(u.protocol)) return hasEmail(value) ? REDACTED : value; // "$direct", mailto:
  const before = u.href;
  u.username = '';
  u.password = '';
  if (OWN.includes(u.hostname)) {
    for (const k of [...u.searchParams.keys()]) {
      if (!KEEP.test(k)) u.searchParams.delete(k);
      else if (hasEmail(u.searchParams.get(k) ?? '')) u.searchParams.set(k, REDACTED);
    }
    u.hash = '';
  } else if (kind === 'link') {
    for (const k of [...u.searchParams.keys()]) {
      if (SECRET.test(k)) u.searchParams.delete(k);
      else if (hasEmail(u.searchParams.get(k) ?? '')) u.searchParams.set(k, REDACTED);
    }
    u.hash = '';
  } else {
    // a referrer from another site keeps only its address and path
    u.search = '';
    u.hash = '';
  }
  return u.href === before ? value : u.href;
};

const clean = (key: string, v: unknown, depth: number): unknown => {
  if (typeof v === 'string') {
    if (/referrer$/i.test(key)) return cleanUrl(v, 'referrer');
    if (key.startsWith('$') && /^https?:\/\//i.test(v)) return cleanUrl(v, 'page');
    if (key === 'link_url' || /^https?:\/\//i.test(v)) return cleanUrl(v, 'link');
    return hasEmail(v) ? REDACTED : v;
  }
  if (v && typeof v === 'object' && depth < 5) {
    const bag = v as Record<string, unknown>;
    for (const k in bag) bag[k] = clean(Array.isArray(v) ? key : k, bag[k], depth + 1);
  }
  return v;
};

/** Cleans every property of an event, nested ones included, before it is sent. */
const scrub = <T>(event: T): T => {
  if (!event) return event;
  const e = event as unknown as Record<string, unknown>;
  for (const bag of ['properties', '$set', '$set_once']) {
    if (e[bag]) clean(bag, e[bag], 0);
  }
  return event;
};

// ---- loading ----

let enabled = false;
let started = false;
let send: ((name: string, props?: EventProps) => void) | undefined;
let register: ((props: EventProps) => void) | undefined;
const queue: [string, EventProps | undefined][] = [];
const context: EventProps = {};

/** Records one named event. A no-op when analytics is off for this page. */
export const track = (name: string, props?: EventProps) => {
  if (!enabled) return;
  if (send) send(name, props);
  else if (queue.length < 200) queue.push([name, props]);
};

/** Properties that ride on every later event (game number, language, layout…). */
export const setContext = (props: EventProps) => {
  let changed = false;
  for (const k in props) {
    if (context[k] !== props[k]) {
      context[k] = props[k];
      changed = true;
    }
  }
  if (changed && register) register({ ...context });
};

export const initAnalytics = () => {
  if (started) return;
  started = true;

  // own-visit and preview markers, set once by opening the site with the parameter
  const params = new URLSearchParams(window.location.search);
  if (params.get('internal') === '1') local.set(INTERNAL_KEY, '1');
  if (params.get('internal') === '0') local.set(INTERNAL_KEY, null);
  let test = false;
  try {
    if (params.get('posthog') === 'test') sessionStorage.setItem(TEST_KEY, '1');
    if (params.get('posthog') === 'off') sessionStorage.removeItem(TEST_KEY);
    test = sessionStorage.getItem(TEST_KEY) === '1';
  } catch {
    test = false;
  }

  const onProdHost = !PROD_HOST || window.location.hostname === PROD_HOST;
  if (!KEY || isOptedOut() || !(onProdHost || test)) return;
  enabled = true;
  if (test) context.traffic_type = 'test';
  else if (local.get(INTERNAL_KEY) === '1') context.traffic_type = 'internal';

  const load = async () => {
    try {
      const { default: posthog } = await import('posthog-js/dist/module.slim');
      posthog.init(KEY, {
        api_host: API_HOST,
        ui_host: 'https://eu.posthog.com',
        cookieless_mode: 'always',
        person_profiles: 'never',
        capture_pageview: false, // sent below, once the page's properties are registered
        capture_pageleave: true, // carries time on page
        autocapture: false,
        rageclick: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_exceptions: false,
        capture_performance: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_product_tours: true,
        disable_conversations: true,
        disable_web_experiments: true,
        advanced_disable_flags: true,
        disable_external_dependency_loading: true,
        mask_personal_data_properties: true,
        before_send: scrub,
      });
      posthog.register({ ...context });
      posthog.capture('$pageview');
      register = props => posthog.register(props);
      send = (name, props) => posthog.capture(name, props);
      queue.splice(0).forEach(([name, props]) => send!(name, props));
    } catch {
      enabled = false; // blocked or offline: the site works the same without it
      queue.length = 0;
    }
  };

  // After the board is up and the game is known, so analytics never competes
  // with the first paint and the page view already carries game_no.
  window.setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => void load(), { timeout: 3000 });
    else void load();
  }, 2000);
};

/** A link to another site: keeps the destination, drops tracking ids. */
export const trackOutbound = (href: string) => {
  try {
    const u = new URL(href);
    track('outbound_click', { link_url: href, link_domain: u.hostname.replace(/^www\./, ''), outbound: true });
  } catch {
    // not a URL
  }
};
