import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import builtin from '../src/data/puzzles.json';
import { expectedMove } from '../src/lib/puzzle';

const first = builtin.find(p => p.id === 'gdnLv')!;
const second = builtin.find(p => p.id !== first.id)!;
const response = (p: typeof first) => ({ ok: true, json: async () => ({ puzzle: p }) });

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
  vi.doMock('../src/lib/sound', () => ({ playMove: vi.fn() }));
  vi.doMock('../src/lib/analytics', () => ({ track: vi.fn() }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('refuses old-puzzle actions during a delayed fetch and never replaces the new puzzle with an old reply', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(first));
  vi.stubGlobal('fetch', fetcher);
  const { usePuzzles } = await import('../src/puzzleStore');
  await usePuzzles.getState().load();
  const old = usePuzzles.getState().state!;
  let resolve!: (value: ReturnType<typeof response>) => void;
  fetcher.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = usePuzzles.getState().load();
  expect(usePuzzles.getState().loading).toBe(true);
  usePuzzles.getState().play(expectedMove(old)!);
  usePuzzles.getState().hint();
  usePuzzles.getState().reveal();
  usePuzzles.getState().reset();
  expect(usePuzzles.getState().state).toBe(old);
  resolve(response(second));
  await pending;
  await vi.advanceTimersByTimeAsync(5000);
  expect(usePuzzles.getState().state?.puzzle.id).toBe(second.id);
  expect(usePuzzles.getState().state?.step).toBe(0);
  expect(usePuzzles.getState().busy).toBe(false);
});

it('cancels a reply that was already scheduled when the next puzzle starts loading', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response(second)));
  const { usePuzzles } = await import('../src/puzzleStore');
  await usePuzzles.getState().load();
  usePuzzles.getState().play(expectedMove(usePuzzles.getState().state!)!);
  expect(usePuzzles.getState().busy).toBe(true);
  await usePuzzles.getState().load();
  await vi.advanceTimersByTimeAsync(5000);
  expect(usePuzzles.getState().state?.puzzle.id).toBe(second.id);
  expect(usePuzzles.getState().state?.step).toBe(0);
});
