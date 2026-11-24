import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { useEffect, useRef } from 'react';

interface Props {
  fen: string;
  lastMove?: [string, string];
  check: boolean;
  orientation: 'white' | 'black';
  /** Best-move arrow. */
  arrow?: [string, string];
}

/** Read-only board. Chessground handles animation, highlights and arrows. */
export function Board({ fen, lastMove, check, orientation, arrow }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, {
      viewOnly: true,
      coordinates: true,
      animation: { enabled: true, duration: 220 },
      highlight: { lastMove: true, check: true },
      drawable: { enabled: false, visible: true },
    });
    return () => {
      api.current?.destroy();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    const turn = fen.split(' ')[1] === 'b' ? 'black' : 'white';
    api.current?.set({
      fen,
      orientation,
      turnColor: turn,
      check: check ? turn : false,
      lastMove: lastMove ? (lastMove as Key[]) : undefined,
    });
  }, [fen, lastMove, check, orientation]);

  useEffect(() => {
    const shapes: DrawShape[] = arrow ? [{ orig: arrow[0] as Key, dest: arrow[1] as Key, brush: 'paleBlue' }] : [];
    api.current?.setAutoShapes(shapes);
  }, [arrow, fen]);

  return (
    <div className="board-wrap">
      <div ref={el} className="cg-host" />
    </div>
  );
}
