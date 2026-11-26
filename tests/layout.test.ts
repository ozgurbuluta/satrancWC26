import { describe, expect, it } from 'vitest';
import { automaticVideoHeight } from '../src/lib/layout';

const three = { engine: true, lines: 3, winChance: false };

describe('the video\u2019s height when nobody has set it', () => {
  it('is what its width allows where the column has room for the engine\u2019s lines and the moves too', () => {
    // 480 px wide in a 916 px column (1728 x 1000): 16:9 is 270
    expect(automaticVideoHeight({ width: 480, height: 916 }, three)).toBe(270);
    expect(automaticVideoHeight({ width: 340, height: 2000 }, three)).toBe(Math.round((340 * 9) / 16));
  });

  it('is lower where the moves would otherwise get less than four rows', () => {
    // the right side dragged to 640 px in a 846 px column: 360 would leave the moves two rows
    const h = automaticVideoHeight({ width: 640, height: 846 }, three);
    expect(h).toBeLessThan(360);
    // what is left for the panel holds the engine card (92 + 3 x 45 + 40), the opening (36) and four rows (140)
    expect(846 - (40 + 48 + 44) - h).toBe(92 + 135 + 40 + 36 + 140);
  });

  it('never goes below 200 px, or below what the width allows when that is less', () => {
    expect(automaticVideoHeight({ width: 432, height: 500 }, three)).toBe(200);
    expect(automaticVideoHeight({ width: 320, height: 500 }, three)).toBe(180);
  });

  it('gives more to the video with fewer engine lines, and less with more or with the win chance in the tab', () => {
    const column = { width: 640, height: 846 };
    const base = automaticVideoHeight(column, three);
    expect(automaticVideoHeight(column, { ...three, lines: 1 })).toBeGreaterThan(base);
    expect(automaticVideoHeight(column, { ...three, lines: 5 })).toBeLessThan(base);
    expect(automaticVideoHeight(column, { ...three, winChance: true })).toBeLessThan(base);
    // a line takes two rows in a narrow column, so the same three lines ask for more there
    expect(automaticVideoHeight({ width: 590, height: 846 }, three)).toBeLessThan(automaticVideoHeight({ width: 600, height: 846 }, three));
  });

  it('depends on nothing but the column and the settings, and is a whole number', () => {
    const a = automaticVideoHeight({ width: 611.5, height: 846.3 }, three);
    expect(Number.isInteger(a)).toBe(true);
    expect(automaticVideoHeight({ width: 611.5, height: 846.3 }, three)).toBe(a);
  });
});
