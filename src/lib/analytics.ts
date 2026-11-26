/* ============================================================
   analytics.ts — PostHog, cookieless, with a narrow privacy contract.

   Writes to this site's OWN PostHog project (the key comes from
   VITE_POSTHOG_KEY; the personal site's project and key are never used).

   The contract, enforced twice (when an event is recorded and again in
   before_send, the last step before anything leaves the page):
   - Only the events in EVENTS exist. Each lists the properties it may
     carry, and every property has a bounded type: one of a fixed set of
     words, a whole number in a range, true/false, or a bare hostname.
     Anything else is dropped: unknown events, unknown properties, values
     outside their bounds.
   - No URL ever leaves except this page's own address without its query
     string and fragment. A referrer and a clicked link are reduced to
     their origin; paths and query values (campaign tags included) go nowhere.
   - Nothing a visitor types or pastes is sent: no stream link, no move
     text, no position, no game notation.
   - PostHog's own properties are an explicit short list (SYSTEM_KEYS).
     The page title, language list, screen size and the rest are removed.
   - No person data: $set and $set_once are deleted.

   Loading:
   - no key: nothing is loaded or sent (the library is not in the build);
   - VITE_ANALYTICS_HOST set: only that host counts, unless the tab was
     opened with ?posthog=test (events then carry traffic_type=test);
   - a visitor who turned statistics off sends nothing;
   - ?internal=1 marks this browser's events traffic_type=internal.
   Cookieless mode, no person profiles, and autocapture, replay, heatmaps,
   exceptions, web vitals, surveys and flags are all off.
   ============================================================ */

import { STREAM_PRESETS } from '../config';
import { readText, writeText } from './storage';

export type EventProps = Record<string, string | number | boolean | null | undefined>;

type Rule = { oneOf: readonly string[] } | { int: readonly [number, number] } | { bool: true } | { hostname: true };
type Schema = Record<string, Rule>;

const oneOf = (...values: string[]): Rule => ({ oneOf: values });
const int = (min: number, max: number): Rule => ({ int: [min, max] });
const bool: Rule = { bool: true };
const hostname: Rule = { hostname: true };

/** Every event this site can record, with every property it may carry. */
export const EVENTS: Record<string, Schema> = {
  view_open: { view: oneOf('live', 'puzzles') },
  tab_open: { tab: oneOf('analysis', 'predict', 'similar', 'charts', 'match', 'settings') },
  game_select: { how: oneOf('manual', 'auto'), game_no: int(1, 40), board: int(1, 20) },
  next_game_dismiss: {},
  move_browse: {},
  stream_select: { stream: oneOf(...STREAM_PRESETS.map(p => p.id)) },
  stream_toggle: { hidden: bool },
  stream_uncover: {},
  sync_delay_set: { seconds: int(0, 90) },
  pause_start: { at_move: int(0, 400), game_over: bool },
  pause_autoplay: { interval_ms: int(0, 60000) },
  pause_restart: {},
  pause_end: { reason: oneOf('go_live', 'caught_up'), moves_revealed: int(0, 1000) },
  similar_game_open: { year: int(1800, 2100) },
  similar_preview: {},
  chart_jump: {
    chart: oneOf('eval', 'time', 'key_moment', 'longest_think'),
    quality: oneOf('best', 'good', 'inaccuracy', 'mistake', 'blunder'),
  },
  setting_change: {
    setting: oneOf('lang', 'notation', 'sound', 'engine', 'arrow', 'spoilerShield'),
    value: oneOf('tr', 'en', 'true', 'false'),
  },
  outbound_click: { link_domain: hostname },
  share_link: { kind: oneOf('position', 'puzzles'), copied: bool },
  feed_fallback: {},
  analysis_start: { from: oneOf('newest', 'earlier') },
  guess_mode: { on: bool },
  guess_result: { hit: bool, quality: oneOf('best', 'good', 'inaccuracy', 'mistake', 'blunder', 'unknown') },
  puzzle_start: { source: oneOf('daily', 'lichess', 'builtin'), theme: oneOf('mix', 'mateIn1', 'mateIn2', 'short', 'endgame') },
  puzzle_end: {
    result: oneOf('first_try', 'solved', 'revealed', 'skipped'),
    rating_band: oneOf('under_1200', '1200_1599', '1600_1999', '2000_plus', 'unknown'),
    hint_used: bool,
  },
};

/** Properties that ride on every event. */
export const CONTEXT: Schema = {
  page_lang: oneOf('tr', 'en'),
  layout: oneOf('phone', 'desktop'),
  view: oneOf('live', 'puzzles'),
  game_no: int(1, 40),
  game_state: oneOf('upcoming', 'live', 'finished', 'paused'),
  traffic_type: oneOf('internal', 'test'),
  embed: oneOf('framed', 'direct'),
  referrer_domain: hostname,
};

/**
 * The only PostHog properties that are sent. $raw_user_agent, $host and
 * $timezone stay because PostHog's cookieless counting is computed from them
 * on its servers; without them it cannot count visitors.
 */
export const SYSTEM_KEYS: readonly string[] = [
  'token',
  'distinct_id',
  '$device_id',
  '$insert_id',
  '$time',
  '$lib',
  '$lib_version',
  '$cookieless_mode',
  '$process_person_profile',
  '$is_identified',
  '$pageview_id',
  '$host',
  '$pathname',
  '$raw_user_agent',
  '$timezone',
  '$os',
  '$os_version',
  '$browser',
  '$browser_version',
  '$device_type',
  '$viewport_height',
  '$viewport_width',
  '$prev_pageview_id',
  '$prev_pageview_pathname',
  '$prev_pageview_duration',
];

const HOSTNAME = /^(?=.{1,80}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const pass = (rule: Rule, value: unknown): string | number | boolean | undefined => {
  if ('oneOf' in rule) return typeof value === 'string' && rule.oneOf.includes(value) ? value : undefined;
  if ('int' in rule) return typeof value === 'number' && Number.isInteger(value) && value >= rule.int[0] && value <= rule.int[1] ? value : undefined;
  if ('bool' in rule) return typeof value === 'boolean' ? value : undefined;
  return typeof value === 'string' && HOSTNAME.test(value) ? value : undefined;
};

/** Keeps only the properties a schema names, and only values inside their bounds. */
export const sanitize = (schema: Schema, props: Record<string, unknown> | undefined): EventProps => {
  const out: EventProps = {};
  if (!props) return out;
  for (const key of Object.keys(schema)) {
    const v = pass(schema[key], props[key]);
    if (v !== undefined) out[key] = v;
  }
  return out;
};

/** Reduces a web address to its origin: credentials, path, query string and fragment are dropped. Not a web address: undefined. */
export const originOf = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) ? u.origin : undefined;
  } catch {
    return undefined;
  }
};

/** The bare, lower-case host of a web address ("www." removed), or undefined. */
export const hostOf = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || /[\s@]/.test(value)) return undefined; // no credentials, no mail addresses
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') return undefined;
  try {
    const u = new URL(scheme ? value : `https://${value}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return HOSTNAME.test(host) ? host : undefined;
  } catch {
    return undefined;
  }
};

interface OutgoingEvent {
  event?: string;
  properties?: Record<string, unknown>;
  $set?: unknown;
  $set_once?: unknown;
}

/**
 * The last gate before an event leaves the page. Rebuilds the property bag
 * from the allowlists, so nothing PostHog or a future code change adds can
 * slip through. Returns null to drop an event that is not in the contract.
 */
export const gate = <T extends OutgoingEvent | null | undefined>(event: T, page: { origin: string; pathname: string } = window.location): T | null => {
  if (optedOut || !event || typeof event.event !== 'string') return null;
  const name = event.event;
  const pageEvent = name === '$pageview' || name === '$pageleave';
  if (!pageEvent && !Object.hasOwn(EVENTS, name)) return null;

  const before = event.properties ?? {};
  const props: Record<string, unknown> = {};
  for (const key of SYSTEM_KEYS) if (before[key] !== undefined) props[key] = before[key];

  // This page's own address, never its query string or fragment.
  props.$current_url = page.origin + page.pathname;
  props.$pathname = page.pathname;
  if (typeof props.$prev_pageview_pathname === 'string') props.$prev_pageview_pathname = page.pathname;
  // A referrer is reduced to its origin: paths and queries can hold what someone searched for or a token.
  const referrer = originOf(before.$referrer);
  props.$referrer = referrer ?? '$direct';
  props.$referring_domain = referrer ? new URL(referrer).hostname : '$direct';

  Object.assign(props, sanitize(CONTEXT, before), pageEvent ? {} : sanitize(EVENTS[name], before));

  event.properties = props;
  delete event.$set;
  delete event.$set_once;
  return event;
};

// ---- whether this page counts ----

const KEY = (import.meta.env.VITE_POSTHOG_KEY as string | undefined)?.trim();
const API_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined)?.trim() || '/olay';
const PROD_HOST = (import.meta.env.VITE_ANALYTICS_HOST as string | undefined)?.trim();

// Namespaced, so nothing here collides with another site's keys if both are
// ever served from one origin.
const OFF_KEY = 'satranc:analytics-off';
const INTERNAL_KEY = 'satranc:analytics-internal';
const TEST_KEY = 'satranc:posthog-test';

/** True when this build has a PostHog project to write to. */
export const analyticsConfigured = !!KEY;

// The visitor's choice lives in memory first. Storage only makes it last
// beyond this page, and a browser that refuses storage must not undo it.
let optedOut = readText(OFF_KEY) === '1';

export const isOptedOut = (): boolean => optedOut;

/**
 * The visitor's statistics switch. Takes effect immediately: nothing is
 * recorded from this moment, and events already on their way out are dropped
 * at the gate. Returns whether the browser will remember the choice.
 */
export const setOptedOut = (off: boolean): { persisted: boolean } => {
  optedOut = off;
  const persisted = writeText(OFF_KEY, off ? '1' : null);
  if (off) {
    enabled = false;
    queue.length = 0;
  } else if (countsHere) {
    enabled = true;
    startLoading();
  }
  return { persisted };
};

// ---- recording ----

let enabled = false;
let started = false;
/** This page is one that counts (key present, right host or a marked test tab). */
let countsHere = false;
let loading = false;
let send: ((name: string, props: EventProps) => void) | undefined;
let register: ((props: EventProps) => void) | undefined;
const queue: [string, EventProps][] = [];
let context: EventProps = {};

/** Records one event from the contract. Unknown events and out-of-bounds values are dropped here already. */
export const track = (name: string, props?: Record<string, unknown>) => {
  if (!enabled) return;
  if (!Object.hasOwn(EVENTS, name)) {
    if (import.meta.env.DEV) console.warn(`[analytics] "${name}" is not in the contract and was not recorded`);
    return;
  }
  const clean = sanitize(EVENTS[name], props);
  if (send) send(name, clean);
  else if (queue.length < 200) queue.push([name, clean]);
};

/** Properties that ride on every later event (game number, language, layout…). */
export const setContext = (props: Record<string, unknown>) => {
  const next = { ...context, ...sanitize(CONTEXT, props) };
  // a property set back to nothing (game number before the schedule loads) is removed
  for (const key of Object.keys(props)) if (props[key] === undefined) delete next[key];
  const changed = JSON.stringify(next) !== JSON.stringify(context);
  context = next;
  if (changed && register) register({ ...context });
};

const load = async () => {
  // The visitor may have turned statistics off while this was waiting to run.
  if (!KEY || optedOut) {
    loading = false;
    return;
  }
  try {
    const { default: posthog } = await import('posthog-js/dist/module.slim');
    if (optedOut) {
      loading = false; // turned off while the library was downloading: do not start it
      return;
    }
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
      before_send: event => gate(event),
    });
    posthog.register({ ...context });
    posthog.capture('$pageview');
    register = props => posthog.register(props);
    // Checked again at the moment of sending, besides the gate in before_send.
    send = (name, props) => {
      if (!optedOut) posthog.capture(name, props);
    };
    queue.splice(0).forEach(([name, props]) => send!(name, props));
  } catch {
    enabled = false; // blocked or offline: the site works the same without it
    queue.length = 0;
  }
};

/** Loads PostHog once, after the board is up and the game is known. */
const startLoading = () => {
  if (loading) return;
  loading = true;
  // Late enough that analytics never competes with the first paint and the
  // page view already carries game_no.
  window.setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => void load(), { timeout: 3000 });
    else void load();
  }, 2000);
};

export const initAnalytics = () => {
  if (started) return;
  started = true;

  // own-visit and preview markers, set once by opening the site with the parameter
  const params = new URLSearchParams(window.location.search);
  if (params.get('internal') === '1') writeText(INTERNAL_KEY, '1');
  if (params.get('internal') === '0') writeText(INTERNAL_KEY, null);
  let test = false;
  try {
    if (params.get('posthog') === 'test') sessionStorage.setItem(TEST_KEY, '1');
    if (params.get('posthog') === 'off') sessionStorage.removeItem(TEST_KEY);
    test = sessionStorage.getItem(TEST_KEY) === '1';
  } catch {
    test = params.get('posthog') === 'test';
  }

  const onProdHost = !PROD_HOST || window.location.hostname === PROD_HOST;
  countsHere = !!KEY && (onProdHost || test);

  let framed = false;
  try {
    framed = window.top !== window.self;
  } catch {
    framed = true;
  }
  setContext({
    embed: framed ? 'framed' : 'direct',
    // When the site is shown inside a page of another site, that page can pass on where the visitor came from (host only).
    referrer_domain: hostOf(params.get('ref') ?? ''),
    traffic_type: test ? 'test' : readText(INTERNAL_KEY) === '1' ? 'internal' : undefined,
  });

  if (!countsHere || optedOut) return;
  enabled = true;
  startLoading();
};

/** A link to another site: only its host is recorded. */
export const trackOutbound = (href: string) => {
  const link_domain = hostOf(href);
  if (link_domain) track('outbound_click', { link_domain });
};
