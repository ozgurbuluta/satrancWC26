import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PUBLIC = 'https://ozgurakanay.com/satranc/';
let host: HTMLDivElement;
let root: Root;

/** Mounts the button with a fresh module graph, so the public address is read from the environment as at build time. */
const mount = async (target: { view: 'live' | 'puzzles'; gameNo?: number; ply?: number }) => {
  vi.resetModules();
  const { ShareButton } = await import('../src/components/ShareButton');
  await act(() => root.render(<ShareButton target={target} describe="Bu pozisyonun bağlantısı" />));
  return host.querySelector<HTMLButtonElement>('.share-btn')!;
};
const clipboard = (writeText: (text: string) => Promise<void>) => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
const field = () => host.querySelector<HTMLInputElement>('.share-panel input');
const status = () => host.querySelector('.share-panel [role="status"]')?.textContent ?? '';

beforeEach(() => {
  vi.stubEnv('VITE_PUBLIC_URL', PUBLIC);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', '/');
});

describe('share button', () => {
  it('copies the public link to the position and shows it', async () => {
    const copied: string[] = [];
    clipboard(async text => void copied.push(text));
    const button = await mount({ view: 'live', gameNo: 2, ply: 31 });
    expect(button.getAttribute('aria-expanded')).toBe('false');

    await act(async () => button.click());
    expect(copied).toEqual(['https://ozgurakanay.com/satranc/?parti=2&hamle=31']);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(status()).toBe('Bağlantı kopyalandı.');
    expect(field()!.value).toBe('https://ozgurakanay.com/satranc/?parti=2&hamle=31');
    expect(field()!.readOnly).toBe(true);
  });

  it('nothing from the address in the browser ends up in the link', async () => {
    window.history.replaceState(null, '', '/?internal=1&posthog=test&ref=x.com&tour=abc&round=xyz&utm_source=newsletter&parti=9&hamle=99#bulmaca');
    const copied: string[] = [];
    clipboard(async text => void copied.push(text));
    const button = await mount({ view: 'live', gameNo: 2, ply: 31 });
    await act(async () => button.click());
    expect(copied[0]).toBe('https://ozgurakanay.com/satranc/?parti=2&hamle=31');
    expect(copied[0]).not.toMatch(/internal|posthog|ref=|tour|round|utm_|parti=9|hamle=99|bulmaca|localhost/);
  });

  it('the puzzle corner is shared as its fragment only', async () => {
    const copied: string[] = [];
    clipboard(async text => void copied.push(text));
    const button = await mount({ view: 'puzzles' });
    await act(async () => button.click());
    expect(copied).toEqual(['https://ozgurakanay.com/satranc/#bulmaca']);
  });

  it('when copying is refused, the link is shown selected and focused, and says so', async () => {
    // refused as inside a frame without clipboard permission; the older copy command is unavailable too
    clipboard(async () => {
      throw new DOMException('Write permission denied.', 'NotAllowedError');
    });
    const button = await mount({ view: 'live', gameNo: 2, ply: 31 });
    await act(async () => button.click());

    expect(status()).toMatch(/kopyalanamadı/);
    const input = field()!;
    expect(input.value).toBe('https://ozgurakanay.com/satranc/?parti=2&hamle=31');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    // the field has a visible label and the outcome is announced
    expect(host.querySelector(`label[for="${input.id}"]`)?.textContent).toBe('Bu pozisyonun bağlantısı');
    expect(host.querySelector('.share-panel [role="status"]')?.getAttribute('aria-live')).toBe('polite');
  });

  it('works when the browser has no clipboard interface at all', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const button = await mount({ view: 'live', gameNo: 1, ply: 0 });
    await act(async () => button.click());
    expect(status()).toMatch(/kopyalanamadı/);
    expect(field()!.value).toBe('https://ozgurakanay.com/satranc/?parti=1&hamle=0');
  });

  it('Escape closes the panel and returns focus to the button', async () => {
    clipboard(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    const button = await mount({ view: 'live', gameNo: 2, ply: 31 });
    await act(async () => button.click());
    await act(async () => void field()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(field()).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('after the board moves on, the panel keeps what was copied until the next press, which shares the new position', async () => {
    const copied: string[] = [];
    clipboard(async text => void copied.push(text));
    vi.resetModules();
    const { ShareButton } = await import('../src/components/ShareButton');
    await act(() => root.render(<ShareButton target={{ view: 'live', gameNo: 2, ply: 31 }} describe="2. parti, 16. hamle" />));
    const button = host.querySelector<HTMLButtonElement>('.share-btn')!;
    await act(async () => button.click());

    // a new move arrives while the panel is open
    await act(() => root.render(<ShareButton target={{ view: 'live', gameNo: 2, ply: 32 }} describe="2. parti, 16. hamle (siyah)" />));
    expect(field()!.value).toBe('https://ozgurakanay.com/satranc/?parti=2&hamle=31');
    expect(host.querySelector('.share-panel label')?.textContent).toBe('2. parti, 16. hamle');

    await act(async () => button.click());
    expect(copied).toEqual(['https://ozgurakanay.com/satranc/?parti=2&hamle=31', 'https://ozgurakanay.com/satranc/?parti=2&hamle=32']);
    expect(field()!.value).toBe('https://ozgurakanay.com/satranc/?parti=2&hamle=32');
    expect(host.querySelector('.share-panel label')?.textContent).toBe('2. parti, 16. hamle (siyah)');

    // the same position again: the press closes the panel
    await act(async () => button.click());
    expect(field()).toBeNull();
    expect(copied).toHaveLength(2);
  });

  it('when the copy command throws, nothing is left in the page and the link is still shown selected', async () => {
    clipboard(async () => {
      throw new DOMException('Write permission denied.', 'NotAllowedError');
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    try {
      const button = await mount({ view: 'live', gameNo: 2, ply: 31 });
      await act(async () => button.click());
      expect(document.querySelectorAll('textarea')).toHaveLength(0);
      expect(status()).toMatch(/kopyalanamadı/);
      const input = field()!;
      expect(input.value).toBe('https://ozgurakanay.com/satranc/?parti=2&hamle=31');
      expect(document.activeElement).toBe(input);
      expect(input.selectionEnd).toBe(input.value.length);
    } finally {
      Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: undefined });
    }
  });

  it('when the share action goes away, its open panel goes with it', async () => {
    // the panel is shown in a slot elsewhere on the page, as under the board controls
    const slot = document.createElement('div');
    document.body.append(slot);
    clipboard(async () => undefined);
    vi.resetModules();
    const { ShareButton } = await import('../src/components/ShareButton');
    const Controls = ({ shareable, gameId }: { shareable: boolean; gameId: string }) => (
      <div>{shareable && <ShareButton key={gameId} panelHost={slot} target={{ view: 'live', gameNo: 15, ply: 10 }} describe="15. parti, 5. hamle" />}</div>
    );
    await act(() => root.render(<Controls shareable gameId="tb1" />));
    await act(async () => host.querySelector<HTMLButtonElement>('.share-btn')!.click());
    expect(slot.querySelector('.share-panel input')).not.toBeNull();

    // another game of the same round: the button stays, the old link does not
    await act(() => root.render(<Controls shareable gameId="tb2" />));
    expect(host.querySelector('.share-btn')).not.toBeNull();
    expect(slot.querySelector('.share-panel')).toBeNull();

    // a second board appears, so the position can no longer be linked
    await act(async () => host.querySelector<HTMLButtonElement>('.share-btn')!.click());
    expect(slot.querySelector('.share-panel')).not.toBeNull();
    await act(() => root.render(<Controls shareable={false} gameId="tb2" />));
    expect(host.querySelector('.share-btn')).toBeNull();
    expect(slot.querySelector('.share-panel')).toBeNull();
    slot.remove();
  });

  it('the copy button in the panel tries again', async () => {
    let allow = false;
    const copied: string[] = [];
    clipboard(async text => {
      if (!allow) throw new DOMException('denied', 'NotAllowedError');
      copied.push(text);
    });
    const button = await mount({ view: 'live', gameNo: 2, ply: 31 });
    await act(async () => button.click());
    expect(status()).toMatch(/kopyalanamadı/);
    allow = true;
    await act(async () => host.querySelector<HTMLButtonElement>('.share-row .btn')!.click());
    expect(copied).toEqual(['https://ozgurakanay.com/satranc/?parti=2&hamle=31']);
    expect(status()).toBe('Bağlantı kopyalandı.');
  });
});
