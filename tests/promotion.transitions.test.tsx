import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { usePromotion } from '../src/components/MoveEntry';

const FEN = '7k/4P2p/6pK/8/8/8/8/8 w - - 0 1';

it('dismisses a pending promotion when the puzzle changes or resets, even at the same position', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onMove = vi.fn();
  const onRejected = vi.fn();
  function Entry({ context }: { context: string }) {
    const promotion = usePromotion(FEN, onMove, onRejected, context);
    return <><button onClick={() => promotion.squares('e7', 'e8')}>Promote</button>
      {promotion.pending && <button onClick={() => promotion.choose('queen')}>Choose queen</button>}</>;
  }
  try {
    await act(() => root.render(<Entry context="first" />));
    await act(() => host.querySelector('button')!.click());
    expect(host.textContent).toContain('Choose queen');
    await act(() => root.render(<Entry context="second" />));
    expect(host.textContent).not.toContain('Choose queen');
    expect(onMove).not.toHaveBeenCalled();
    await act(() => host.querySelector('button')!.click());
    await act(() => root.render(<Entry context="second-reset" />));
    expect(host.textContent).not.toContain('Choose queen');
    expect(onMove).not.toHaveBeenCalled();
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});
