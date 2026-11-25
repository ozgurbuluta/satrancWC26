import { describe, expect, it } from 'vitest';
import { moveChoice, winningChances } from '../src/lib/engine';

const lines = (...cps: number[]) => cps.map(cp => ({ cp, moves: ['e2e4'] }));

describe('how narrow the choice of move is', () => {
  it('is nothing to remark on while every line is good', () => {
    expect(moveChoice(lines(20, 18, 15), true)).toBeUndefined();
    expect(moveChoice(lines(0, 0, 0, 0, 0), true)).toBeUndefined();
    // a little under an inaccuracy is still good
    expect(winningChances({ cp: 50 }) - winningChances({ cp: 0 })).toBeLessThan(0.1);
    expect(moveChoice(lines(50, 0), true)).toBeUndefined();
  });

  it('needs at least two lines', () => {
    expect(moveChoice([], true)).toBeUndefined();
    expect(moveChoice(lines(300), true)).toBeUndefined();
  });

  it('is one move when the second line costs an inaccuracy or more, by the thresholds used for played moves', () => {
    expect(moveChoice(lines(90, 30, 20), true)).toEqual({ kind: 'best', next: 1, quality: 'inaccuracy' });
    expect(moveChoice(lines(150, 20, 10), true)).toEqual({ kind: 'only', next: 1, quality: 'mistake' });
    expect(moveChoice(lines(300, 0, 0), true)).toEqual({ kind: 'only', next: 1, quality: 'blunder' });
    expect(moveChoice([{ mate: 3, moves: ['a'] }, { cp: 100, moves: ['b'] }], true)).toEqual({ kind: 'only', next: 1, quality: 'blunder' });
  });

  it('is two moves when the first two are good and the third is not', () => {
    expect(moveChoice(lines(200, 195, 20), true)).toEqual({ kind: 'two', next: 2, quality: 'blunder' });
    expect(moveChoice(lines(60, 55, 0), true)).toEqual({ kind: 'two', next: 2, quality: 'inaccuracy' });
    // with two lines only, there is no third to fall short
    expect(moveChoice(lines(200, 195), true)).toBeUndefined();
  });

  it('reads the scores from the side that is to move', () => {
    // scores are from White's side: for Black the best line is the lowest
    expect(moveChoice(lines(-150, -20, -10), false)).toEqual({ kind: 'only', next: 1, quality: 'mistake' });
    expect(moveChoice(lines(-20, -18, -15), false)).toBeUndefined();
  });
});
