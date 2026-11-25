import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Chessground replaced by a recorder, to see exactly what the board asks of it.
const cg = vi.hoisted(() => {
  const api = { set: vi.fn(), setAutoShapes: vi.fn(), selectSquare: vi.fn(), destroy: vi.fn() };
  return { api, create: vi.fn((_el: HTMLElement, _config: Record<string, unknown>) => api) };
});
vi.mock('chessground', () => ({ Chessground: cg.create }));

import { Board } from '../src/components/Board';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const THREE_PIECES = '8/5k2/8/8/3K4/8/4P3/8 w - - 0 1';

type Sent = { fen?: string; viewOnly?: boolean; animation?: { enabled: boolean }; movable?: { color?: string }; draggable?: { enabled: boolean }; selectable?: { enabled: boolean } };
let host: HTMLDivElement;
let root: Root;
const noop = () => undefined;
const lastSet = () => cg.api.set.mock.calls.at(-1)![0] as Sent;
const show = (props: Partial<Parameters<typeof Board>[0]> & { fen: string }) => act(() => root.render(<Board check={false} orientation="white" {...props} />));

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});

describe('how the board uses Chessground', () => {
  it('creates it once, on the real position and able to take input', async () => {
    await show({ fen: THREE_PIECES });
    expect(cg.create).toHaveBeenCalledTimes(1);
    const config = cg.create.mock.calls[0][1] as Sent;
    expect(config.fen).toBe(THREE_PIECES);
    expect(config.viewOnly).toBe(false);
    expect(config.animation?.enabled).toBe(false);
  });

  it('never rebuilds it and never switches viewOnly, whatever changes', async () => {
    await show({ fen: START });
    await show({ fen: START, onMove: noop });
    await show({ fen: AFTER_E4, onMove: noop });
    await show({ fen: AFTER_E4 });
    await show({ fen: THREE_PIECES, onMove: noop, orientation: 'black' });
    await show({ fen: THREE_PIECES, onMove: noop, orientation: 'black', syncToken: 3 });
    expect(cg.create).toHaveBeenCalledTimes(1);
    expect(cg.api.destroy).not.toHaveBeenCalled();
    for (const [config] of cg.api.set.mock.calls) expect(config).not.toHaveProperty('viewOnly');
  });

  it('switches moving on and off through the same instance', async () => {
    await show({ fen: START });
    expect(lastSet()).toMatchObject({ movable: { color: undefined }, draggable: { enabled: false }, selectable: { enabled: false } });
    await show({ fen: START, onMove: noop });
    expect(lastSet()).toMatchObject({ movable: { color: 'white' }, draggable: { enabled: true }, selectable: { enabled: true } });
    await show({ fen: AFTER_E4, onMove: noop });
    expect(lastSet()).toMatchObject({ movable: { color: 'black' } });
    await show({ fen: AFTER_E4 });
    expect(lastSet()).toMatchObject({ movable: { color: undefined }, draggable: { enabled: false } });
    // a piece left selected would otherwise stay marked on a board that no longer moves
    expect(cg.api.selectSquare).toHaveBeenLastCalledWith(null);
  });

  it('animates one move, forward or back, and shows a jump at once', async () => {
    await show({ fen: START });
    await show({ fen: AFTER_E4 });
    expect(lastSet().animation?.enabled).toBe(true);
    await show({ fen: START });
    expect(lastSet().animation?.enabled).toBe(true);
    await show({ fen: THREE_PIECES });
    expect(lastSet()).toMatchObject({ fen: THREE_PIECES, animation: { enabled: false } });
    await show({ fen: START });
    expect(lastSet().animation?.enabled).toBe(false);
  });

  it('puts a piece back with an animation when a move is not kept', async () => {
    await show({ fen: START, onMove: noop, syncToken: 0 });
    const before = cg.api.set.mock.calls.length;
    await show({ fen: START, onMove: noop, syncToken: 1 });
    expect(cg.api.set.mock.calls.length).toBe(before + 1);
    expect(lastSet()).toMatchObject({ fen: START, animation: { enabled: true } });
  });

  it('does nothing when it is drawn again with nothing changed', async () => {
    await show({ fen: START, onMove: noop });
    const before = cg.api.set.mock.calls.length;
    await show({ fen: START, onMove: noop });
    await show({ fen: START, onMove: () => undefined }); // another function, same meaning
    expect(cg.api.set.mock.calls.length).toBe(before);
  });

  it('is destroyed once, when it leaves the page', async () => {
    await show({ fen: START });
    await act(() => root.render(<div />));
    expect(cg.api.destroy).toHaveBeenCalledTimes(1);
  });
});
