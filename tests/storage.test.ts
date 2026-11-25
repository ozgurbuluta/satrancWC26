import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, game, HOUR, ITALIAN, push, R1, resetWorld, round, world } from './helpers';

/** A browser that refuses to keep data, as Safari can inside a frame on another site. */
const denyStorage = () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
};

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('when the browser refuses storage', () => {
  it('keeps values in memory for the life of the page and reports that they will not last', async () => {
    denyStorage();
    const { readJson, writeJson, storagePersistent } = await import('../src/lib/storage');
    expect(storagePersistent()).toBe(false);
    expect(writeJson('k', { a: 1 })).toBe(false);
    expect(readJson('k', null)).toEqual({ a: 1 });
    expect(readJson('missing', 'fallback')).toBe('fallback');
  });

  it('settings and the pause keep working', async () => {
    denyStorage();
    vi.useFakeTimers();
    const T0 = Date.UTC(2026, 10, 25, 15);
    vi.setSystemTime(T0);
    resetWorld();
    world.rounds = [round(R1, 1, T0 - HOUR, { ongoing: true })];
    world.defaultRoundId = R1;
    const { useStore } = await boot();
    push(R1, game({ round: 1, id: 'g1', sans: ITALIAN.slice(0, 6) }));

    useStore.getState().setSetting('lang', 'en');
    expect(useStore.getState().settings.lang).toBe('en');

    useStore.getState().pause();
    push(R1, game({ round: 1, id: 'g1', sans: ITALIAN, result: '1-0' }));
    expect(useStore.getState().revealed).toBe(6);
    expect(useStore.getState().resultVisible).toBe(false);
    useStore.getState().revealNext();
    expect(useStore.getState().revealed).toBe(7);
  });

  it('turning statistics off stops capture at once, even though the choice cannot be saved', async () => {
    denyStorage();
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_only');
    const { gate, isOptedOut, setOptedOut } = await import('../src/lib/analytics');
    const page = { origin: 'https://satranc.example', pathname: '/' };
    const event = () => ({ event: 'tab_open', properties: { tab: 'analysis' } });
    expect(gate(event(), page)).not.toBeNull();

    const result = setOptedOut(true);
    expect(result.persisted).toBe(false);
    expect(isOptedOut()).toBe(true);
    // nothing leaves any more: not a feature event, not the page-leave PostHog sends by itself
    expect(gate(event(), page)).toBeNull();
    expect(gate({ event: '$pageleave', properties: {} }, page)).toBeNull();
    expect(gate({ event: '$pageview', properties: {} }, page)).toBeNull();

    setOptedOut(false);
    expect(gate(event(), page)).not.toBeNull();
  });
});

describe('when storage works', () => {
  it('loads the line count and migrates missing or invalid values to three', async () => {
    const { loadStore } = await import('./helpers');
    for (const value of [undefined, 0, 9, '5', 2.5, 1, 5]) {
      localStorage.setItem('wcc26:settings', JSON.stringify({ engineLines: value, sound: false }));
      const { useStore } = await loadStore();
      expect(useStore.getState().settings.engineLines).toBe(value === 1 || value === 5 ? value : 3);
      expect(useStore.getState().settings.sound).toBe(false);
    }
  });

  it('remembers the statistics choice for the next visit', async () => {
    const first = await import('../src/lib/analytics');
    expect(first.setOptedOut(true).persisted).toBe(true);
    vi.resetModules();
    const second = await import('../src/lib/analytics');
    expect(second.isOptedOut()).toBe(true);
    expect(second.gate({ event: 'tab_open', properties: { tab: 'match' } }, { origin: 'https://x.example', pathname: '/' })).toBeNull();
  });
});

/** A stand-in for the PostHog library that records what the site asks of it. */
const fakePostHog = () => {
  const calls = { init: 0, captured: [] as string[], beforeSend: undefined as undefined | ((e: unknown) => unknown) };
  vi.doMock('posthog-js/dist/module.slim', () => ({
    default: {
      init: (_key: string, config: { before_send?: (e: unknown) => unknown }) => {
        calls.init++;
        calls.beforeSend = config.before_send;
      },
      register: () => undefined,
      capture: (name: string) => {
        calls.captured.push(name);
      },
    },
  }));
  return calls;
};

describe('the statistics switch and the delayed start of PostHog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_only');
  });

  it('turning statistics off before PostHog has started means it never starts', async () => {
    denyStorage();
    const posthog = fakePostHog();
    const analytics = await import('../src/lib/analytics');
    analytics.initAnalytics();
    analytics.track('tab_open', { tab: 'match' }); // waits in the queue for the library
    analytics.setOptedOut(true); // within the two seconds before loading begins
    await vi.advanceTimersByTimeAsync(10_000);
    expect(posthog.init).toBe(0);
    expect(posthog.captured).toEqual([]);
  });

  it('turning statistics off after it started stops custom events and the page-leave PostHog sends itself', async () => {
    denyStorage();
    const posthog = fakePostHog();
    const analytics = await import('../src/lib/analytics');
    analytics.initAnalytics();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(posthog.init).toBe(1);
    expect(posthog.captured).toEqual(['$pageview']);
    analytics.track('tab_open', { tab: 'match' });
    expect(posthog.captured).toEqual(['$pageview', 'tab_open']);

    expect(analytics.setOptedOut(true).persisted).toBe(false);
    analytics.track('tab_open', { tab: 'charts' });
    expect(posthog.captured).toEqual(['$pageview', 'tab_open']); // nothing new was handed to the library
    // and whatever the library tries on its own is stopped at the gate
    expect(posthog.beforeSend!({ event: '$pageleave', properties: {} })).toBeNull();
    expect(posthog.beforeSend!({ event: 'tab_open', properties: { tab: 'charts' } })).toBeNull();
  });

  it('turning statistics back on starts PostHog if it had never started', async () => {
    localStorage.setItem('satranc:analytics-off', '1');
    const posthog = fakePostHog();
    const analytics = await import('../src/lib/analytics');
    analytics.initAnalytics();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(posthog.init).toBe(0);

    analytics.setOptedOut(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(posthog.init).toBe(1);
    expect(posthog.captured).toEqual(['$pageview']);
  });
});
