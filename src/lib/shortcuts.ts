// Keyboard shortcuts of the match board, as one rule that can be tested.

export type Shortcut = 'back' | 'forward' | 'start' | 'live' | 'closePreview' | 'flip';

interface KeyPress {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

/** Places where a key is being typed or belongs to a dialog, not to the board. */
const NOT_FOR_THE_BOARD = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], dialog';

/**
 * What a key press means for the board, or undefined when it is not meant
 * for it: with a modifier held, while typing in a field, inside a dialog,
 * or while a pawn is waiting for its promotion piece.
 *
 * ← and → step one move. ↑ returns to the live position, as do End and ↓.
 * Home goes to the first position. F turns the board round.
 */
export const shortcutFor = (e: KeyPress, promotionOpen: boolean): Shortcut | undefined => {
  if (e.metaKey || e.ctrlKey || e.altKey || promotionOpen) return undefined;
  const el = e.target as Element | null;
  if (el && typeof el.closest === 'function' && el.closest(NOT_FOR_THE_BOARD)) return undefined;
  switch (e.key) {
    case 'ArrowLeft':
      return 'back';
    case 'ArrowRight':
      return 'forward';
    case 'Home':
      return 'start';
    case 'ArrowUp':
    case 'End':
    case 'ArrowDown':
      return 'live';
    case 'Escape':
      return 'closePreview';
    case 'f':
    case 'F':
      return 'flip';
    default:
      return undefined;
  }
};
