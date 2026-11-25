import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawShape } from 'chessground/draw';
import type { Dests, Key } from 'chessground/types';
import { useEffect, useRef } from 'react';
import { legalDests } from '../lib/position';

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
  /** Extra arrows and circles: a hint, the viewer's guess. */
  shapes?: BoardShape[];
  /**
   * When given, the side to move can be played by click, tap or drag. Only
   * legal moves are offered; the caller decides what the move means.
   */
  onMove?: (from: string, to: string) => void;
  /** Change it to snap the pieces back to `fen` after a move that is not kept. */
  syncToken?: number;
}

/** The board. Read-only unless `onMove` is given. Chessground handles animation, highlights and arrows. */
export function Board({ fen, lastMove, check, orientation, arrow, shapes, onMove, syncToken }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const interactive = !!onMove;

  // Chessground only listens for pointer input when it is created interactive,
  // so the board is rebuilt when that changes.
  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, {
      viewOnly: !interactive,
      coordinates: true,
      animation: { enabled: true, duration: 220 },
      highlight: { lastMove: true, check: true },
      drawable: { enabled: false, visible: true },
      draggable: { enabled: interactive, showGhost: true },
      selectable: { enabled: interactive },
      premovable: { enabled: false },
    });
    return () => {
      api.current?.destroy();
      api.current = null;
    };
  }, [interactive]);

  useEffect(() => {
    const turn = fen.split(' ')[1] === 'b' ? 'black' : 'white';
    api.current?.set({
      fen,
      orientation,
      turnColor: turn,
      check: check ? turn : false,
      lastMove: lastMove ? (lastMove as Key[]) : undefined,
      movable: interactive
        ? {
            free: false,
            color: turn,
            dests: legalDests(fen) as Dests,
            showDests: true,
            events: { after: (orig, dest) => onMoveRef.current?.(orig, dest) },
          }
        : { free: false, color: undefined, dests: new Map() },
    });
  }, [fen, lastMove, check, orientation, interactive, syncToken]);

  useEffect(() => {
    const all: DrawShape[] = [];
    if (arrow) all.push({ orig: arrow[0] as Key, dest: arrow[1] as Key, brush: 'paleBlue' });
    for (const s of shapes ?? []) all.push({ orig: s.from as Key, dest: s.to as Key | undefined, brush: s.brush });
    api.current?.setAutoShapes(all);
  }, [arrow, shapes, fen, interactive, syncToken]);

  return (
    <div className={`board-wrap ${interactive ? 'is-interactive' : ''}`}>
      <div ref={el} className="cg-host" />
    </div>
  );
}
