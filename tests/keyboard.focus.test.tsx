import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { useKeyboardBackFromFrames } from '../src/hooks';

// jsdom does not move the focus out of a frame when asked to, so these tests check that the page asks at the right
// moments. That the keyboard really comes back is checked in a browser (tests/e2e/board.cjs).
let host: HTMLDivElement;
let root: Root;
let windowFocus: MockInstance;
const Page = () => {
  useKeyboardBackFromFrames();
  return (
    <>
      <iframe title="video" />
      {/* like the board: it cancels the press it receives and keeps it to itself */}
      <div className="board" onMouseDown={e => e.preventDefault()} onPointerDown={e => e.stopPropagation()} />
      <button type="button">Düğme</button>
      <input aria-label="alan" />
    </>
  );
};
const pressOn = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));

beforeEach(async () => {
  windowFocus = vi.spyOn(window, 'focus').mockImplementation(() => {});
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(() => root.render(<Page />));
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('the keyboard after a click in the video', () => {
  it('is taken back from the frame by a press on the board, though the board keeps that press to itself', () => {
    const frame = host.querySelector('iframe')!;
    const blur = vi.spyOn(frame, 'blur');
    frame.focus();
    expect(document.activeElement).toBe(frame);
    // the board stops the event on its way up; the page has acted before that, on the way down
    pressOn(host.querySelector('.board')!);
    expect(blur).toHaveBeenCalledTimes(1);
    expect(windowFocus).toHaveBeenCalledTimes(1);
  });

  it('is taken back by a press anywhere else on the page', () => {
    const frame = host.querySelector('iframe')!;
    const blur = vi.spyOn(frame, 'blur');
    frame.focus();
    const places = [document.body, host, host.querySelector('button')!];
    for (const target of places) pressOn(target);
    expect(blur).toHaveBeenCalledTimes(places.length);
    expect(windowFocus).toHaveBeenCalledTimes(places.length);
  });

  it('leaves the focus alone when it is not in a frame', () => {
    const blur = vi.spyOn(host.querySelector('iframe')!, 'blur');
    const field = host.querySelector('input')!;
    field.focus();
    pressOn(host.querySelector('.board')!);
    expect(document.activeElement).toBe(field);
    const button = host.querySelector('button')!;
    button.focus();
    pressOn(document.body);
    expect(document.activeElement).toBe(button);
    expect(blur).not.toHaveBeenCalled();
    expect(windowFocus).not.toHaveBeenCalled();
  });

  it('stops listening when the page it belongs to is gone', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const blur = vi.spyOn(frame, 'blur');
    await act(() => root.render(<></>));
    frame.focus();
    pressOn(document.body);
    expect(blur).not.toHaveBeenCalled();
    frame.remove();
  });
});
