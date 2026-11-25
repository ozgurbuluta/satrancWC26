import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/components/Board';
import { squaresChanged } from '../src/lib/position';

// The real Chessground, so that what is checked is the board's own DOM.
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const THREE_PIECES = '8/5k2/8/8/3K4/8/4P3/8 w - - 0 1';

let host: HTMLDivElement;
let root: Root;
const noop = () => undefined;
/** Chessground draws a changed position on the next animation frame. */
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const board = () => host.querySelector('cg-board');
const pieces = () => [...host.querySelectorAll('cg-board piece')];
const kinds = () =>
  pieces()
    .map(p => p.className.replace(/\s*anim\s*/, '').trim())
    .sort();

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});

describe('the board is built once', () => {
  it('shows the position it was given from its first paint, not the initial position', async () => {
    await act(() => root.render(<Board fen={THREE_PIECES} check={false} orientation="white" />));
    expect(kinds()).toEqual(['black king', 'white king', 'white pawn']);
    expect(host.querySelectorAll('cg-board piece.anim')).toHaveLength(0);
  });

  it('keeps the same board and the same pieces when moving is switched on and off', async () => {
    await act(() => root.render(<Board fen={AFTER_E4} check={false} orientation="white" />));
    const boardNode = board();
    const pieceNodes = pieces();
    expect(pieceNodes).toHaveLength(32);

    for (const onMove of [noop, undefined, noop, undefined]) {
      await act(() => root.render(<Board fen={AFTER_E4} check={false} orientation="white" onMove={onMove} />));
      expect(board()).toBe(boardNode);
      expect(boardNode?.isConnected).toBe(true);
      // every piece is the node it was before: nothing was torn down and drawn again
      expect(pieces()).toHaveLength(32);
      for (const node of pieceNodes) expect(node.isConnected).toBe(true);
      expect(host.querySelectorAll('cg-board piece.anim')).toHaveLength(0);
      expect(host.querySelector('.board-wrap')?.classList.contains('is-interactive')).toBe(!!onMove);
    }
  });

  it('keeps the same board across a move, a jump and a snap back', async () => {
    await act(() => root.render(<Board fen={START} check={false} orientation="white" onMove={noop} />));
    const boardNode = board();
    await act(() => root.render(<Board fen={AFTER_E4} check={false} orientation="white" lastMove={['e2', 'e4']} />));
    await frame();
    expect(board()).toBe(boardNode);
    expect(pieces()).toHaveLength(32);
    await act(() => root.render(<Board fen={THREE_PIECES} check={false} orientation="white" onMove={noop} syncToken={1} />));
    await act(() => root.render(<Board fen={THREE_PIECES} check={false} orientation="white" onMove={noop} syncToken={2} />));
    await frame();
    expect(board()).toBe(boardNode);
    expect(kinds()).toEqual(['black king', 'white king', 'white pawn']);
  });

  it('turning the board round redraws it in place with the same position', async () => {
    // Chessground lays the squares out again for the other side; the pieces are placed, not moved.
    await act(() => root.render(<Board fen={THREE_PIECES} check={false} orientation="white" onMove={noop} />));
    await act(() => root.render(<Board fen={THREE_PIECES} check={false} orientation="black" onMove={noop} />));
    await frame();
    expect(kinds()).toEqual(['black king', 'white king', 'white pawn']);
    expect(host.querySelectorAll('cg-board piece.anim')).toHaveLength(0);
    expect(host.querySelectorAll('cg-board')).toHaveLength(1);
  });
});

describe('touches that are not meant for the pieces stay with the page', () => {
  /** Whether a touch that starts on the board gets through to Chessground's own listeners. */
  const reaches = () => {
    let reached = false;
    const listen = () => (reached = true);
    board()!.addEventListener('touchstart', listen);
    board()!.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
    board()!.removeEventListener('touchstart', listen);
    return reached;
  };

  it('a board that cannot be played on never takes a touch', async () => {
    await act(() => root.render(<Board fen={START} check={false} orientation="white" />));
    expect(reaches()).toBe(false);
  });

  it('a board that is dragged on takes it', async () => {
    await act(() => root.render(<Board fen={START} check={false} orientation="white" onMove={noop} />));
    expect(reaches()).toBe(true);
  });

  it('a board that is tapped on leaves it to the page, also while it can be played on', async () => {
    await act(() => root.render(<Board fen={START} check={false} orientation="white" onMove={noop} touch="tap" />));
    expect(reaches()).toBe(false);
  });
});

describe('telling one move from a jump', () => {
  it('counts the squares that differ', () => {
    expect(squaresChanged(START, START)).toBe(0);
    expect(squaresChanged(START, AFTER_E4)).toBe(2);
    // castling: king and rook
    expect(squaresChanged('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1')).toBe(4);
    // en passant: two pawns leave, one arrives
    expect(squaresChanged('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', '4k3/8/3P4/8/8/8/8/4K3 b - - 0 1')).toBe(3);
    // promotion with a capture
    expect(squaresChanged('3r1k2/4P3/8/8/8/8/8/4K3 w - - 0 1', '3Q1k2/8/8/8/8/8/8/4K3 b - - 0 1')).toBe(2);
    expect(squaresChanged(START, THREE_PIECES)).toBeGreaterThan(4);
  });

  it('treats a position it cannot read as far away', () => {
    expect(squaresChanged(START, 'not a position')).toBe(64);
    expect(squaresChanged('', START)).toBe(64);
  });
});
