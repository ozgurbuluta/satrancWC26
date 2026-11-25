import { describe, expect, it } from 'vitest';
import { railFits } from '../src/hooks';

describe('whether the game list fits beside the board', () => {
  it('is shown only where the board keeps its full size', () => {
    // wide and not tall: the board is limited by height, so there is room beside it
    expect(railFits(1440, 900)).toBe(true);
    expect(railFits(1366, 700)).toBe(true);
    expect(railFits(1920, 1080)).toBe(true);
    // the same width but taller: the board wants the width for itself
    expect(railFits(1280, 900)).toBe(false);
    expect(railFits(1100, 800)).toBe(false);
  });

  it('never on a phone or a narrow window', () => {
    expect(railFits(390, 844)).toBe(false);
    expect(railFits(900, 500)).toBe(false);
    expect(railFits(820, 1180)).toBe(false);
  });

  it('gives way when the side column has been dragged wide', () => {
    expect(railFits(1440, 900, 0)).toBe(true); // 0: never resized
    expect(railFits(1440, 900, 420)).toBe(true);
    expect(railFits(1440, 900, 760)).toBe(false);
  });
});
