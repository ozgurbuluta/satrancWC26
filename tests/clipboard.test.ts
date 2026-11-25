import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '../src/lib/clipboard';

const LINK = 'https://ozgurakanay.com/satranc/?parti=2&hamle=31';
let button: HTMLButtonElement;

const clipboard = (value: unknown) => Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
const copyCommand = (fn: ((command: string) => boolean) | undefined) => Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: fn });
const refused = () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'));
/** No helper field may be left in the page, and focus must be back where it was. */
const expectCleanedUp = () => {
  expect(document.querySelectorAll('textarea')).toHaveLength(0);
  expect(document.activeElement).toBe(button);
};

beforeEach(() => {
  button = document.createElement('button');
  document.body.append(button);
  button.focus();
});

afterEach(() => {
  button.remove();
  copyCommand(undefined);
  clipboard(undefined);
});

describe('copying text', () => {
  it('uses the clipboard interface when it is allowed, with no helper field', async () => {
    const writeText = vi.fn(async () => undefined);
    const command = vi.fn(() => true);
    clipboard({ writeText });
    copyCommand(command);
    expect(await copyText(LINK)).toBe(true);
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(command).not.toHaveBeenCalled();
    expectCleanedUp();
  });

  it('falls back to the copy command when the clipboard interface is refused', async () => {
    let copied = '';
    clipboard({ writeText: refused });
    let focused = false;
    copyCommand(command => {
      const area = document.querySelector('textarea')!;
      focused = document.activeElement === area;
      copied = command === 'copy' ? area.value.slice(area.selectionStart ?? 0, area.selectionEnd ?? 0) : '';
      return true;
    });
    expect(await copyText(LINK)).toBe(true);
    expect(copied).toBe(LINK); // the whole link was selected in the helper field
    expect(focused).toBe(true);
    expectCleanedUp();
  });

  it('reports failure and cleans up when the copy command says no', async () => {
    clipboard({ writeText: refused });
    copyCommand(() => false);
    expect(await copyText(LINK)).toBe(false);
    expectCleanedUp();
  });

  it('reports failure and still cleans up when the copy command throws', async () => {
    clipboard({ writeText: refused });
    // what the page looked like at the moment the command threw
    const seen = { fields: 0, focused: '' };
    copyCommand(() => {
      seen.fields = document.querySelectorAll('textarea').length;
      seen.focused = document.activeElement?.tagName ?? '';
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    await expect(copyText(LINK)).resolves.toBe(false);
    expect(seen).toEqual({ fields: 1, focused: 'TEXTAREA' });
    expectCleanedUp();
  });

  it('reports failure and cleans up when there is no copy command and no clipboard interface', async () => {
    clipboard(undefined);
    copyCommand(undefined);
    await expect(copyText(LINK)).resolves.toBe(false);
    expectCleanedUp();
  });

  it('does not fail when the element that had focus is gone by the time it finishes', async () => {
    clipboard({ writeText: refused });
    copyCommand(() => {
      button.remove();
      throw new Error('copy failed');
    });
    await expect(copyText(LINK)).resolves.toBe(false);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});
