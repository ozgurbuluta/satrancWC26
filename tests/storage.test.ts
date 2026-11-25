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
  it('remembers the statistics choice for the next visit', async () => {
    const first = await import('../src/lib/analytics');
    expect(first.setOptedOut(true).persisted).toBe(true);
    vi.resetModules();
    const second = await import('../src/lib/analytics');
    expect(second.isOptedOut()).toBe(true);
    expect(second.gate({ event: 'tab_open', properties: { tab: 'match' } }, { origin: 'https://x.example', pathname: '/' })).toBeNull();
  });
});
