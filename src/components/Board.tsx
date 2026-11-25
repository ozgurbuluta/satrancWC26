import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { DrawShape } from 'chessground/draw';
import type { Dests, Key } from 'chessground/types';
import { useEffect, useRef } from 'react';
import { legalDests, squaresChanged } from '../lib/position';

export interface BoardShape {
  from: string;
  /** Without a destination the square is circled. */
  to?: string;
  brush: 'green' | 'red' | 'blue' | 'yellow' | 'paleBlue';
}

interface Props {
  fen: string;
  lastMove?: [string, string];
  check: boolean;
  orientation: 'white' | 'black';
  /** Best-move arrow. */
  arrow?: [string, string];
  /** Extra arrows and circles: a hint, a line being looked at. */
  shapes?: BoardShape[];
  /**
   * When given, the side to move can be played by click, tap or drag. Only
   * legal moves are offered; the caller decides what the move means.
   */
  onMove?: (from: string, to: string) => void;
  /** Change it to snap the pieces back to `fen` after a move that is not kept. */
  syncToken?: number;
  /**
   * How a finger moves pieces. `drag`: touch a piece and drag it, which also
   * stops the page scrolling from that piece. `tap`: tap a piece, then a
   * square; every swipe scrolls the page. Mouse input is the same in both.
   */
  touch?: 'drag' | 'tap';
}

const ANIMATION_MS = 220;
/** A single move changes two squares, three when taking en passant and four when castling. */
const ONE_MOVE_SQUARES = 4;

/**
 * The board. Read-only unless `onMove` is given.
 *
 * There is one Chessground instance for the life of the component, created
 * on the position it is first given. Whether pieces can be moved is switched
 * on that instance; it is never rebuilt, because a rebuilt board starts from
 * the initial position and every piece would fly to its square.
 */
export function Board({ fen, lastMove, check, orientation, arrow, shapes, onMove, syncToken, touch = 'drag' }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const interactive = !!onMove;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const touchRef = useRef(touch);
  touchRef.current = touch;
  /** The position the board was last given, to tell a single move from a jump. */
  const shownFen = useRef<string | null>(null);

  const position = (animate: boolean): Config => {
    const turn = fen.split(' ')[1] === 'b' ? 'black' : 'white';
    return {
      fen,
      orientation,
      turnColor: turn,
      check: check ? turn : false,
      lastMove: lastMove ? (lastMove as Key[]) : undefined,
      animation: { enabled: animate, duration: ANIMATION_MS },
      draggable: { enabled: interactive, showGhost: true },
      selectable: { enabled: interactive },
      movable: interactive
        ? {
            free: false,
            color: turn,
            dests: legalDests(fen) as Dests,
            showDests: true,
            events: { after: (orig, dest) => onMoveRef.current?.(orig, dest) },
          }
        : { free: false, color: undefined, dests: new Map() },
    };
  };

  useEffect(() => {
    const host = el.current;
    if (!host) return;
    // Chessground takes over a touch that starts on a piece, which stops the
    // page scrolling. While pieces cannot be moved, and on a board meant to be
    // tapped, the touch is kept from it: the page scrolls, and a tap still
    // arrives as the click the browser makes of it.
    const keepTouch = (e: TouchEvent) => {
      if (!interactiveRef.current || touchRef.current === 'tap') e.stopPropagation();
    };
    host.addEventListener('touchstart', keepTouch, { capture: true, passive: true });
    api.current = Chessground(host, {
      ...position(false),
      // Pointer input is bound once, here. It cannot be switched on later.
      viewOnly: false,
      coordinates: true,
      highlight: { lastMove: true, check: true },
      drawable: { enabled: false, visible: true },
      premovable: { enabled: false },
    });
    shownFen.current = fen;
    return () => {
      host.removeEventListener('touchstart', keepTouch, { capture: true });
      api.current?.destroy();
      api.current = null;
      shownFen.current = null;
    };
    // Created once, on the position of the first render. Later positions go through `set` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cg = api.current;
    if (!cg) return;
    // One move forward or back is animated. Anything further apart (a jump in
    // the move list, another game, a new puzzle) is shown at once.
    const animate = shownFen.current !== null && squaresChanged(shownFen.current, fen) <= ONE_MOVE_SQUARES;
    cg.set(position(animate));
    if (!interactive) cg.selectSquare(null);
    shownFen.current = fen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, lastMove, check, orientation, interactive, syncToken]);

  useEffect(() => {
    const all: DrawShape[] = [];
    if (arrow) all.push({ orig: arrow[0] as Key, dest: arrow[1] as Key, brush: 'green' });
    for (const s of shapes ?? []) all.push({ orig: s.from as Key, dest: s.to as Key | undefined, brush: s.brush });
    api.current?.setAutoShapes(all);
  }, [arrow, shapes, fen, syncToken]);

  return (
    <div className={`board-wrap ${interactive ? 'is-interactive' : ''}`}>
      <div ref={el} className="cg-host" />
    </div>
  );
}
