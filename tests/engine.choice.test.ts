import { describe, expect, it } from 'vitest';
import { moveChoice, standing, winningChances } from '../src/lib/engine';

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

describe('whether one side is winning', () => {
  it('is not said below two and a half pawns', () => {
    expect(standing(lines(249, 240), true)).toBeUndefined();
    expect(standing(lines(-249), false)).toBeUndefined();
    expect(standing(lines(0, 0, 0), true)).toBeUndefined();
    expect(standing([], true)).toBeUndefined();
  });

  it('names the side that is winning, whoever is to move', () => {
    // the position of the report: Black to move, −4.56, −3.65 and −2.98
    expect(standing(lines(-456, -365, -298), false)).toEqual({ winner: 'black', mate: undefined, onlyMove: false });
    expect(standing(lines(456, 365, 298), true)).toEqual({ winner: 'white', mate: undefined, onlyMove: false });
    // the losing side is to move: its choice does not decide who is winning
    expect(standing(lines(-456, -700, -900), true)).toEqual({ winner: 'black', mate: undefined, onlyMove: false });
  });

  it('says so when only one move keeps the win', () => {
    expect(standing(lines(456, 100, 50), true)).toEqual({ winner: 'white', mate: undefined, onlyMove: true });
    expect(standing(lines(-456, -100), false)).toEqual({ winner: 'black', mate: undefined, onlyMove: true });
    // with one line there is no second move to fall short
    expect(standing(lines(456), true)).toEqual({ winner: 'white', mate: undefined, onlyMove: false });
  });

  it('counts a forced mate as winning, and gives its length', () => {
    expect(standing([{ mate: 3, moves: ['a'] }, { cp: 900, moves: ['b'] }], true)).toEqual({ winner: 'white', mate: 3, onlyMove: false });
    expect(standing([{ mate: -2, moves: ['a'] }, { cp: 0, moves: ['b'] }], false)).toEqual({ winner: 'black', mate: 2, onlyMove: true });
    // a mate against the side to move is a win for the other side
    expect(standing([{ mate: -4, moves: ['a'] }], true)).toEqual({ winner: 'black', mate: 4, onlyMove: false });
  });
});
