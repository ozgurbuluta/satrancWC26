// Phase 2 of the third version: what the score does to a player's moves,
// learned from World Cup two-game matches. Run by
// scripts/train-predictor.mjs --v3-situation. Plan: docs/PREDICTOR-V3-PROTOCOL.md.
//
// In a World Cup the second classical game is played by one who must win
// (lost the first) and one for whom a draw is enough (won it). A correction
// to the board model's weights is fitted for that: added for the player who
// must win, subtracted for the one who needs a draw,
//
//   score(m) = board(m) + u · (φ · features(m)),   u = +1 must win, −1 a draw is enough.
//
// It enters with opposite signs for the two sides of the same game, so
// whatever merely distinguishes World Cup players from the two finalists
// cancels out of it. The board model itself is not touched.
//
// Fitted on the World Cups of 2021 and 2023, the penalty chosen there by
// leaving one event out, and measured on the World Cup of 2025. It replaces
// the written rule only if it lowers log loss on the 2025 games with the
// interval of the difference by game below zero.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const CACHE = '.cache/predictor-v3';
const OUT = 'data/predictor-v3/situation.json';
const TEST_EVENTS = ['FIDE World Cup 2025', "FIDE Women's World Cup 2025"];
const PENALTIES = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1];

export const runSituation = async ctx => {
  const { K, BOARD, FEATURES, STAKES_MAX, selection, scoresOf, softmaxInto, parseGame, candidates, measure, round, log } = ctx;
  const theta = Float64Array.from(selection.families[selection.chosen].theta);
  const temperature = JSON.parse(readFileSync('data/predictor-v3/selection.json', 'utf8')).chosen.temperature;
  const TRADE = FEATURES.indexOf('trade');
  const games = readFileSync(`${CACHE}/knockout.jsonl`, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));

  // ---------- two-game matches: the same two players, colours changed, in the order of the archive
  const pairs = new Map();
  for (const g of games) {
    const key = `${g.event}|${[g.whiteId || g.white, g.blackId || g.black].sort().join('|')}`;
    (pairs.get(key) ?? pairs.set(key, []).get(key)).push(g);
  }
  const rows = [];
  const counts = {};
  let pairIndex = 0;
  for (const [, two] of pairs) {
    if (two.length !== 2) continue;
    const [first, second] = two;
    if ((first.whiteId || first.white) !== (second.blackId || second.black)) continue;
    const c = (counts[first.event] ??= { matches: 0, firstDecisive: 0, decisions: 0 });
    c.matches++;
    if (first.result === '1/2-1/2') continue;
    c.firstDecisive++;
    pairIndex++;
    // White of the first game is Black in the second: if he won, White of the second game must win
    const whiteMustWin = first.result === '1-0';
    const game = parseGame(`[Event "x"]\n[White "a"]\n[Black "b"]\n[Result "*"]\n\n${second.moves.split(' ').map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' ')} *`, undefined, 0);
    if (!game) continue;
    let fen = game.initialFen;
    game.plies.forEach((ply, i) => {
      const cands = candidates({ fen, lastMove: i > 0 ? game.plies[i - 1].uci : undefined, ownLastMove: i > 1 ? game.plies[i - 2].uci : undefined });
      const chosen = cands.findIndex(x => x.san === ply.san);
      if (chosen >= 0) {
        const n = cands.length;
        const x = new Float64Array(n * K);
        cands.forEach((cand, j) => x.set(cand.f, j * K));
        const whiteMoves = i % 2 === 0;
        const r = { g: pairIndex, event: first.event, n, x, ucis: cands.map(cand => cand.uci), chosen, mover: 0, pressure: 0, ply: i, u: whiteMoves === whiteMustWin ? 1 : -1 };
        // the board model's scores, as the page computes them before any rule about the score
        r.s = scoresOf(theta, r, BOARD);
        for (let j = 0; j < n; j++) r.s[j] /= temperature;
        rows.push(r);
        c.decisions++;
      }
      fen = ply.fen;
    });
  }
  const fitRows = rows.filter(r => !TEST_EVENTS.includes(r.event));
  const testRows = rows.filter(r => TEST_EVENTS.includes(r.event));
  log(`situation: ${pairIndex} second games after a decisive first; ${fitRows.length} decisions to fit on, ${testRows.length} to measure on (the 2025 World Cups)`);

  // ---------- the models
  const plain = r => softmaxInto(Float64Array.from(r.s), r.n);
  const written = r => {
    const p = Float64Array.from(r.s);
    for (let j = 0; j < r.n; j++) p[j] -= r.u * STAKES_MAX * r.x[j * K + TRADE];
    return softmaxInto(p, r.n);
  };
  const learned = phi => r => {
    const p = Float64Array.from(r.s);
    for (let j = 0; j < r.n; j++) {
      let add = 0;
      for (const k of BOARD) add += phi[k] * r.x[j * K + k];
      p[j] += r.u * add;
    }
    return softmaxInto(p, r.n);
  };
  const logLoss = (data, probs) => -data.reduce((sum, r) => sum + Math.log(Math.max(1e-12, probs(r)[r.chosen])), 0) / data.length;
  /**
   * Maximum likelihood for φ with a penalty on its size, by Newton's method:
   * the problem is convex and has 27 unknowns, so a handful of steps is enough.
   */
  const B = BOARD.length;
  for (const r of rows) {
    // only the board features, side by side
    r.xb = new Float64Array(r.n * B);
    for (let j = 0; j < r.n; j++) for (let b = 0; b < B; b++) r.xb[j * B + b] = r.x[j * K + BOARD[b]];
  }
  const solve = (matrix, vector) => {
    const n = vector.length;
    const a = matrix.map((line, i) => [...line, vector[i]]);
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let i = col + 1; i < n; i++) if (Math.abs(a[i][col]) > Math.abs(a[pivot][col])) pivot = i;
      [a[col], a[pivot]] = [a[pivot], a[col]];
      for (let i = col + 1; i < n; i++) {
        const f = a[i][col] / a[col][col];
        for (let k = col; k <= n; k++) a[i][k] -= f * a[col][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = a[i][n];
      for (let k = i + 1; k < n; k++) sum -= a[i][k] * x[k];
      x[i] = sum / a[i][i];
    }
    return x;
  };
  const fit = (data, penalty) => {
    const w = new Float64Array(B);
    const p = new Float64Array(400);
    const mean = new Float64Array(B);
    for (let step = 0; step < 12; step++) {
      const grad = new Float64Array(B);
      const hess = Array.from({ length: B }, () => new Float64Array(B));
      for (const r of data) {
        const n = r.n;
        let max = -Infinity;
        for (let j = 0; j < n; j++) {
          let add = 0;
          for (let b = 0; b < B; b++) add += w[b] * r.xb[j * B + b];
          p[j] = r.s[j] + r.u * add;
          if (p[j] > max) max = p[j];
        }
        let total = 0;
        for (let j = 0; j < n; j++) total += p[j] = Math.exp(p[j] - max);
        mean.fill(0);
        for (let j = 0; j < n; j++) {
          p[j] /= total;
          for (let b = 0; b < B; b++) mean[b] += p[j] * r.xb[j * B + b];
        }
        for (let b = 0; b < B; b++) grad[b] += r.u * (mean[b] - r.xb[r.chosen * B + b]);
        // the spread of the features under the model: second moments minus the product of the means
        for (let j = 0; j < n; j++) {
          for (let b = 0; b < B; b++) {
            const fb = r.xb[j * B + b];
            if (fb === 0) continue;
            const line = hess[b];
            for (let c = 0; c < B; c++) line[c] += p[j] * fb * r.xb[j * B + c];
          }
        }
        for (let b = 0; b < B; b++) for (let c = 0; c < B; c++) hess[b][c] -= mean[b] * mean[c];
      }
      for (let b = 0; b < B; b++) {
        grad[b] = grad[b] / data.length + penalty * w[b];
        for (let c = 0; c < B; c++) hess[b][c] = hess[b][c] / data.length + (b === c ? penalty : 0);
      }
      const move = solve(hess, Array.from(grad));
      let size = 0;
      for (let b = 0; b < B; b++) {
        w[b] -= move[b];
        size += Math.abs(move[b]);
      }
      if (size < 1e-7) break;
    }
    const phi = new Float64Array(K);
    BOARD.forEach((k, b) => (phi[k] = round(w[b])));
    return phi;
  };

  // ---------- the penalty, by leaving one event of 2021 and 2023 out at a time
  const fitEvents = [...new Set(fitRows.map(r => r.event))];
  const byPenalty = PENALTIES.map(penalty => {
    let loss = 0;
    let n = 0;
    for (const event of fitEvents) {
      const held = fitRows.filter(r => r.event === event);
      const phi = fit(fitRows.filter(r => r.event !== event), penalty);
      loss += logLoss(held, learned(phi)) * held.length;
      n += held.length;
    }
    return { penalty, leftOutLoss: loss / n };
  });
  const leftOutPlain = fitEvents.reduce((sum, event) => sum + logLoss(fitRows.filter(r => r.event === event), plain) * fitRows.filter(r => r.event === event).length, 0) / fitRows.length;
  const best = byPenalty.reduce((a, b) => (b.leftOutLoss < a.leftOutLoss ? b : a));
  for (const x of byPenalty) log(`situation: penalty ${x.penalty}: left-out log loss ${x.leftOutLoss.toFixed(4)} (without any correction ${leftOutPlain.toFixed(4)})${x === best ? '  <- chosen' : ''}`);
  const phi = fit(fitRows, best.penalty);

  // ---------- measured on the World Cups of 2025
  const results = {
    learned: measure(testRows, learned(phi), { against: plain }),
    written: measure(testRows, written, { against: plain }),
    plain: measure(testRows, plain),
    learnedAgainstWritten: measure(testRows, learned(phi), { against: written }).difference,
    mustWin: measure(testRows.filter(r => r.u === 1), learned(phi), { against: plain }),
    drawEnough: measure(testRows.filter(r => r.u === -1), learned(phi), { against: plain }),
  };
  const d = results.learned.difference.logLoss;
  const adopted = d.interval[1] < 0 && results.learnedAgainstWritten.logLoss.value < 0;
  log(`situation on the 2025 World Cups (${testRows.length} decisions): no correction ${results.plain.logLoss.toFixed(4)}, written rule ${results.written.logLoss.toFixed(4)}, learned ${results.learned.logLoss.toFixed(4)}; learned minus none ${d.value.toFixed(4)} (${d.interval.map(x => x.toFixed(4)).join(' to ')}); adopted: ${adopted}`);
  const strongest = [...BOARD].map(k => [FEATURES[k], phi[k]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
  log(`situation: largest weights (added for the player who must win): ${strongest.map(([name, x]) => `${name} ${x}`).join(', ')}`);

  const brief = m => ({ n: m.n, games: m.games, logLoss: round(m.logLoss), top1: round(m.top1), top3: round(m.top3), ...(m.difference ? { difference: { logLoss: { value: round(m.difference.logLoss.value), interval: m.difference.logLoss.interval.map(x => round(x)) }, top1: { value: round(m.difference.top1.value), interval: m.difference.top1.interval.map(x => round(x)) } } } : {}) });
  mkdirSync('data/predictor-v3', { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        about: 'What the score does to a player\'s moves, from the second games of World Cup two-game matches. See scripts/predictor-v3-situation.mjs and docs/PREDICTOR-V3-PROTOCOL.md.',
        events: counts,
        fit: { events: fitEvents, decisions: fitRows.length },
        test: { events: TEST_EVENTS, decisions: testRows.length },
        penalties: byPenalty.map(x => ({ penalty: x.penalty, leftOutLoss: round(x.leftOutLoss, 6) })),
        leftOutWithoutCorrection: round(leftOutPlain, 6),
        penalty: best.penalty,
        temperature,
        features: [...FEATURES],
        weights: Array.from(phi),
        on2025: { withoutCorrection: brief(results.plain), writtenRule: brief(results.written), learned: brief(results.learned), learnedMinusWritten: { logLoss: { value: round(results.learnedAgainstWritten.logLoss.value), interval: results.learnedAgainstWritten.logLoss.interval.map(x => round(x)) } }, mustWin: brief(results.mustWin), drawEnough: brief(results.drawEnough) },
        adopted,
      },
      null,
      1,
    ) + '\n',
  );
  log(`wrote ${OUT}`);
};
