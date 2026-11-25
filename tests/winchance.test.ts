import { describe, expect, it } from 'vitest';
import table from '../src/data/winchance.json';
import { wdl, wdlPercents } from '../src/lib/engine';

describe('win, draw and loss from how real games ended', () => {
  it('does not call a won position certain: games are drawn, and now and then lost, from four pawns up', () => {
    // the position of the report: −4.56, Black to move
    const split = wdl({ cp: -456 });
    expect(split.loss).toBeGreaterThan(0.9);
    expect(split.loss).toBeLessThan(0.95);
    expect(split.draw).toBeGreaterThan(0.05);
    expect(split.win).toBeGreaterThan(0);
    expect(split.win).toBeLessThan(0.01);
    expect(split.win + split.draw + split.loss).toBeCloseTo(1, 9);
    expect(wdlPercents(split)).toEqual({ win: '1', draw: '6', loss: '93' });
  });

  it('gives a side more wins, never fewer, as its evaluation gets better', () => {
    let before = wdl({ cp: -1500 });
    for (let cp = -1495; cp <= 1500; cp += 5) {
      const now = wdl({ cp });
      expect(now.win, String(cp)).toBeGreaterThanOrEqual(before.win - 1e-12);
      expect(now.loss, String(cp)).toBeLessThanOrEqual(before.loss + 1e-12);
      for (const x of [now.win, now.draw, now.loss]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(1);
      }
      expect(now.win + now.draw + now.loss).toBeCloseTo(1, 9);
      before = now;
    }
  });

  it('reads between two entries of the table on a straight line, and stops at ten pawns', () => {
    const a = wdl({ cp: 100 });
    const b = wdl({ cp: 125 });
    expect(wdl({ cp: 110 }).win).toBeCloseTo(a.win + 0.4 * (b.win - a.win), 12);
    expect(wdl({ cp: 2500 })).toEqual(wdl({ cp: 1000 }));
    expect(wdl({ cp: -2500 })).toEqual(wdl({ cp: -1000 }));
  });

  it('finds an even position most often drawn, with White a little ahead of Black', () => {
    const even = wdl({ cp: 0 });
    expect(even.draw).toBeGreaterThan(0.7);
    expect(even.win).toBeGreaterThan(even.loss);
    expect(wdl(undefined)).toEqual({ win: 0, draw: 1, loss: 0 });
  });

  it('counts a forced mate as all but certain, from the games where one was on the board', () => {
    const white = wdl({ mate: 3 });
    expect(white.win).toBeGreaterThan(0.98);
    expect(white.win).toBeLessThan(1);
    const black = wdl({ mate: -2 });
    expect(black.loss).toBeGreaterThan(0.97);
    expect(black.loss).toBeLessThan(1);
    // 99.5 % and half a percent of draws: the point lost to rounding goes to the draw, and nothing reads 100
    expect(wdlPercents(white)).toEqual({ win: '99', draw: '1', loss: '0' });
  });

  it('comes from the counted table, whole and in order', () => {
    expect(table.stepCentipawns).toBe(25);
    expect(table.limitCentipawns).toBe(1000);
    expect(table.white).toHaveLength(81);
    expect(table.black).toHaveLength(81);
    expect(table.games).toBe(8754);
    expect(table.positions).toBe(815873);
    for (let i = 1; i < 81; i++) {
      expect(table.white[i]).toBeGreaterThanOrEqual(table.white[i - 1]);
      expect(table.black[i]).toBeLessThanOrEqual(table.black[i - 1]);
    }
  });
});

describe('the three percentages as they are shown', () => {
  it('add up to 100 as whole numbers', () => {
    for (let cp = -900; cp <= 900; cp += 37) {
      const shown = wdlPercents(wdl({ cp }));
      // "<1" stands for a share that rounds to nothing, ">99" for one that rounds to everything
      const numbers = Object.values(shown).map(x => (x === '<1' ? 0 : x === '>99' ? 100 : Number(x)));
      expect(numbers.reduce((a, b) => a + b, 0), String(cp)).toBe(100);
    }
    expect(wdlPercents({ win: 0.3333, draw: 0.3333, loss: 0.3334 })).toEqual({ win: '33', draw: '33', loss: '34' });
  });

  it('never say 0 of something that can happen, nor 100 of something that may not', () => {
    expect(wdlPercents({ win: 0.0004, draw: 0.0026, loss: 0.997 })).toEqual({ win: '<1', draw: '<1', loss: '>99' });
    expect(wdlPercents({ win: 0, draw: 0.004, loss: 0.996 })).toEqual({ win: '0', draw: '<1', loss: '>99' });
    // a finished certainty is said plainly
    expect(wdlPercents({ win: 0, draw: 0, loss: 1 })).toEqual({ win: '0', draw: '0', loss: '100' });
    expect(wdlPercents({ win: 0, draw: 1, loss: 0 })).toEqual({ win: '0', draw: '100', loss: '0' });
  });
});
