import { useEffect, useId, useMemo, useState } from 'react';
import { useT } from '../hooks';
import { localizeSan } from '../lib/format';
import { isPromotion, legalSans, moveBySquares, moveByText, type PlayedMove, type Promotion } from '../lib/position';
import { useStore } from '../store';

const PIECES: { role: Promotion; glyph: string; tr: string; en: string }[] = [
  { role: 'queen', glyph: '♛', tr: 'Vezir', en: 'Queen' },
  { role: 'rook', glyph: '♜', tr: 'Kale', en: 'Rook' },
  { role: 'bishop', glyph: '♝', tr: 'Fil', en: 'Bishop' },
  { role: 'knight', glyph: '♞', tr: 'At', en: 'Knight' },
];

/**
 * Turns two squares from the board into a legal move, asking which piece a
 * pawn becomes when it reaches the last rank. `pending` is the promotion
 * waiting for that answer.
 */
export const usePromotion = (fen: string, onMove: (move: PlayedMove) => void, onRejected: () => void, contextKey: string = fen) => {
  const [request, setPending] = useState<{ from: string; to: string; fen: string; contextKey: string } | null>(null);
  // A promotion belongs to the exact board on which it was started.
  const pending = request?.fen === fen && request.contextKey === contextKey ? request : null;
  useEffect(() => setPending(null), [fen, contextKey]);
  const squares = (from: string, to: string) => {
    if (isPromotion(fen, from, to) && moveBySquares(fen, from, to, 'queen')) {
      setPending({ from, to, fen, contextKey });
      return;
    }
    const move = moveBySquares(fen, from, to);
    if (move) onMove(move);
    else onRejected();
  };
  const choose = (role: Promotion | null) => {
    const p = pending;
    setPending(null);
    const move = p && role ? moveBySquares(fen, p.from, p.to, role) : undefined;
    if (move) onMove(move);
    else onRejected();
  };
  return { pending, squares, choose };
};

export function PromotionPicker({ onChoose }: { onChoose: (role: Promotion | null) => void }) {
  const t = useT();
  const lang = useStore(s => s.settings.lang);
  return (
    <div className="promo" role="dialog" aria-modal="true" aria-label={t.promoteTo}>
      <p>{t.promoteTo}</p>
      <div className="promo-row">
        {PIECES.map((p, i) => (
          <button key={p.role} autoFocus={i === 0} onClick={() => onChoose(p.role)}>
            <span aria-hidden="true">{p.glyph}︎</span>
            {lang === 'tr' ? p.tr : p.en}
          </button>
        ))}
      </div>
      <button className="link" onClick={() => onChoose(null)}>
        {t.cancel}
      </button>
    </div>
  );
}

interface Props {
  fen: string;
  label: string;
  disabled?: boolean;
  onMove: (move: PlayedMove) => void;
}

/**
 * Typing a move instead of dragging a piece: for keyboards, screen readers
 * and small screens. The suggestions are the legal moves of the position.
 */
export function MoveInput({ fen, label, disabled, onMove }: Props) {
  const t = useT();
  const notation = useStore(s => s.settings.notation);
  const id = useId();
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const options = useMemo(() => legalSans(fen).map(san => localizeSan(san, notation)), [fen, notation]);

  const submit = () => {
    if (!text.trim()) return;
    const move = moveByText(fen, text, notation);
    if (!move) {
      setBad(true);
      return;
    }
    setText('');
    setBad(false);
    onMove(move);
  };

  return (
    <div className="move-input">
      <label htmlFor={id}>{label}</label>
      <div className="move-input-row">
        <input
          id={id}
          value={text}
          list={`${id}-moves`}
          disabled={disabled}
          onChange={e => {
            setText(e.target.value);
            setBad(false);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={notation === 'tr' ? 'Af3' : 'Nf3'}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={bad}
          aria-describedby={bad ? `${id}-error` : undefined}
        />
        <datalist id={`${id}-moves`}>
          {options.map(o => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <button type="button" className="btn" disabled={disabled} onClick={submit}>
          {t.playMove}
        </button>
      </div>
      {bad && (
        <p className="error" id={`${id}-error`} role="alert">
          {t.notLegal}
        </p>
      )}
    </div>
  );
}
