// Fits and measures the move predictor from data/player-history/games.pgn.
//
//   node scripts/train-predictor.mjs
//
// Writes src/data/predictor.json (weights, tables of earlier moves, the
// measured results) and docs/PREDICTOR-REPORT.md (the same results, to
// read). Running it again on the same corpus gives the same files.
//
// The steps, in order, with nothing chosen by looking at the test games:
//   1. Select classical games in standard chess, by what the clocks show.
//   2. Split whole events by date: fitting, calibration, test.
//   3. For every position, list the legal moves and their features. "Played
//      here before" never includes the game the position is from: in the
//      fitting games it counts fitting games of earlier days only, and in
//      the calibration and test games it counts the fitting games and
//      nothing else.
//   4. Fit the weights on the fitting games.
//   5. Choose the strength of the penalties and the temperature on the
//      calibration games.
//   6. Measure once on the test games, next to simple baselines.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { parseGame, splitGames } = await vite.ssrLoadModule('/src/lib/pgn.ts');
const { candidates, FEATURES, positionKey } = await vite.ssrLoadModule('/src/lib/predictor/features.ts');
const { clockPressure, softmax } = await vite.ssrLoadModule('/src/lib/predictor/model.ts');

const CORPUS = 'data/player-history/games.pgn';
const PLAYERS = { 46616543: 'gukesh', 14205483: 'sindarov' };
const NAMES = { gukesh: 'Gukesh D', sindarov: 'Sindarov, Javokhir' };
/** Classical: the larger of the first two clock readings is at least this. Tags are not trusted over the clocks. */
const CLASSICAL_SECONDS = 45 * 60;
/** Whole events by the month of their first game: up to July fitting, August calibration, September on test. */
const splitOf = month => (month <= 7 ? 'fit' : month === 8 ? 'calibration' : 'test');
/** Tables of earlier moves cover the first this many half-moves of a game. */
const PRIOR_PLIES = 40;
const CLOCK_FULL_SECONDS = 600;
const STAKES_MAX = 0.35;
const K = FEATURES.length;

// ---------- 1. selection
const raw = readFileSync(CORPUS, 'utf8');
const corpusSha256 = createHash('sha256').update(readFileSync(CORPUS)).digest('hex');
const excluded = {};
const drop = reason => (excluded[reason] = (excluded[reason] ?? 0) + 1);
const seen = new Set();
const games = [];
for (const chunk of splitGames(raw)) {
  const tag = name => new RegExp(`^\\[${name} "(.*)"\\]$`, 'm').exec(chunk)?.[1];
  const variant = tag('Variant') ?? 'Standard';
  if (variant !== 'Standard' || tag('FEN') || tag('SetUp') === '1') {
    drop('another variant or a set-up starting position');
    continue;
  }
  const game = parseGame(chunk, undefined, 0);
  if (!game || game.plies.length < 2) {
    drop('could not be read, or shorter than two half-moves');
    continue;
  }
  const first = [game.plies[0].clk, game.plies[1].clk].filter(c => c !== undefined);
  if (first.length === 0) {
    drop('no clock readings');
    continue;
  }
  if (Math.max(...first) < CLASSICAL_SECONDS) {
    drop('faster than classical by its first clock readings');
    continue;
  }
  const key = `${game.white.fideId}|${game.black.fideId}|${game.plies.map(p => p.uci).join(' ')}`;
  if (seen.has(key)) {
    drop('the same game twice');
    continue;
  }
  seen.add(key);
  games.push({ game, event: tag('Event') ?? '?', date: tag('Date') ?? '', white: PLAYERS[game.white.fideId], black: PLAYERS[game.black.fideId] });
}
const firstDate = {};
for (const g of games) firstDate[g.event] = !firstDate[g.event] || g.date < firstDate[g.event] ? g.date : firstDate[g.event];
for (const g of games) g.split = splitOf(Number(firstDate[g.event].slice(5, 7)));
games.sort((a, b) => a.date.localeCompare(b.date) || a.event.localeCompare(b.event) || a.game.id.localeCompare(b.game.id));
console.log(`selected ${games.length} of ${splitGames(raw).length} games;`, JSON.stringify(excluded));

// ---------- 3. rows
// "Played here before" comes from the fitting games only. A fitting game sees
// the fitting games of earlier days; calibration and test games see all the
// fitting games and never each other.
const tables = { gukesh: new Map(), sindarov: new Map(), any: new Map() };
const count = (table, key, uci) => {
  let moves = table.get(key);
  if (!moves) table.set(key, (moves = {}));
  moves[uci] = (moves[uci] ?? 0) + 1;
};
const rows = [];
const startedAt = Date.now();
for (let d = 0; d < games.length; ) {
  let e = d;
  while (e < games.length && games[e].date === games[d].date) e++;
  for (let gi = d; gi < e; gi++) {
    const { game, white, black, split } = games[gi];
    let fen = game.initialFen;
    for (let i = 0; i < game.plies.length; i++) {
      const whiteMoves = (i % 2 === 0) === (game.initialFen.split(' ')[1] !== 'b');
      const mover = (whiteMoves ? white : black) ?? 'other';
      const key = positionKey(fen);
      const cands = candidates({
        fen,
        lastMove: i > 0 ? game.plies[i - 1].uci : undefined,
        ownLastMove: i > 1 ? game.plies[i - 2].uci : undefined,
        repPlayer: mover === 'other' ? undefined : tables[mover].get(key),
        repAny: tables.any.get(key),
      });
      const chosen = cands.findIndex(c => c.san === game.plies[i].san);
      if (chosen < 0) throw new Error(`move not among the legal ones: ${game.id} ply ${i + 1} ${game.plies[i].san}`);
      rows.push({ g: gi, split, mover, key, ply: i, cands, chosen, pressure: clockPressure(i > 1 ? game.plies[i - 2].clk : undefined, CLOCK_FULL_SECONDS) });
      fen = game.plies[i].fen;
    }
  }
  // the day is over: its fitting games now count as earlier games
  for (let gi = d; gi < e; gi++) {
    const { game, white, black, split } = games[gi];
    if (split !== 'fit') continue;
    let fen = game.initialFen;
    for (let i = 0; i < Math.min(PRIOR_PLIES, game.plies.length); i++) {
      const whiteMoves = (i % 2 === 0) === (game.initialFen.split(' ')[1] !== 'b');
      const mover = whiteMoves ? white : black;
      const key = positionKey(fen);
      // the same canonical move text the candidates use
      const uci = candidates({ fen }).find(c => c.san === game.plies[i].san).uci;
      if (mover) count(tables[mover], key, uci);
      count(tables.any, key, uci);
      fen = game.plies[i].fen;
    }
  }
  d = e;
}
console.log(`${rows.length} positions with their legal moves in ${((Date.now() - startedAt) / 1000).toFixed(0)} s`);

// ---------- 4. fitting
const own = r => r.mover !== 'other';
const bySplit = split => rows.filter(r => r.split === split);
const OFFSET = { shared: 0, gukesh: K, sindarov: 2 * K, clock: 3 * K };
const scoresOf = (theta, r) =>
  r.cands.map(c => {
    let s = 0;
    for (let k = 0; k < K; k++) {
      const f = c.f[k];
      if (f === 0) continue;
      s += f * (theta[k] + (own(r) ? theta[OFFSET[r.mover] + k] : 0) + r.pressure * theta[OFFSET.clock + k]);
    }
    return s;
  });
const fit = (data, penaltyShared, penaltyOwn) => {
  const theta = new Float64Array(4 * K);
  const m = new Float64Array(4 * K);
  const v = new Float64Array(4 * K);
  const rate = 0.05;
  for (let step = 1; step <= 500; step++) {
    const grad = new Float64Array(4 * K);
    for (const r of data) {
      const p = softmax(scoresOf(theta, r));
      for (let j = 0; j < r.cands.length; j++) {
        const err = p[j] - (j === r.chosen ? 1 : 0);
        const f = r.cands[j].f;
        for (let k = 0; k < K; k++) {
          if (f[k] === 0) continue;
          const x = err * f[k];
          grad[k] += x;
          if (own(r)) grad[OFFSET[r.mover] + k] += x;
          grad[OFFSET.clock + k] += x * r.pressure;
        }
      }
    }
    for (let i = 0; i < 4 * K; i++) {
      const g = grad[i] / data.length + (i < K ? penaltyShared : penaltyOwn) * theta[i];
      m[i] = 0.9 * m[i] + 0.1 * g;
      v[i] = 0.999 * v[i] + 0.001 * g * g;
      theta[i] -= (rate * (m[i] / (1 - 0.9 ** step))) / (Math.sqrt(v[i] / (1 - 0.999 ** step)) + 1e-8);
    }
  }
  return theta;
};
const logLoss = (data, probs) => -data.reduce((sum, r) => sum + Math.log(Math.max(1e-12, probs(r)[r.chosen])), 0) / data.length;
const modelProbs = (theta, temperature) => r => softmax(scoresOf(theta, r).map(s => s / temperature));

// ---------- 5. penalties and temperature, on the calibration games only
const fitRows = bySplit('fit');
const calRows = bySplit('calibration');
const testRows = bySplit('test');
let best;
for (const penaltyShared of [0.001, 0.01]) {
  for (const penaltyOwn of [0.01, 0.05, 0.2]) {
    const theta = fit(fitRows, penaltyShared, penaltyOwn);
    const loss = logLoss(calRows, modelProbs(theta, 1));
    console.log(`penalties ${penaltyShared} / ${penaltyOwn}: calibration log loss ${loss.toFixed(4)}`);
    if (!best || loss < best.loss) best = { theta, loss, penaltyShared, penaltyOwn };
  }
}
let lo = 0.5;
let hi = 2.5;
for (let i = 0; i < 40; i++) {
  const a = lo + (hi - lo) / 3;
  const b = hi - (hi - lo) / 3;
  if (logLoss(calRows, modelProbs(best.theta, a)) < logLoss(calRows, modelProbs(best.theta, b))) hi = b;
  else lo = a;
}
const temperature = Math.round(((lo + hi) / 2) * 1000) / 1000;
const theta = best.theta;
console.log(`chosen penalties ${best.penaltyShared} / ${best.penaltyOwn}, temperature ${temperature}`);

// ---------- 6. measuring, once
const mulberry = seed => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const measure = (data, probs) => {
  if (data.length === 0) return { n: 0 };
  let top1 = 0;
  let top3 = 0;
  let loss = 0;
  let brier = 0;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, confidence: 0, correct: 0 }));
  for (const r of data) {
    const p = probs(r);
    const order = p.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]);
    const hit = order[0][1] === r.chosen;
    if (hit) top1++;
    if (order.slice(0, 3).some(o => o[1] === r.chosen)) top3++;
    loss -= Math.log(Math.max(1e-12, p[r.chosen]));
    brier += p.reduce((sum, x, i) => sum + (x - (i === r.chosen ? 1 : 0)) ** 2, 0);
    const bin = bins[Math.min(9, Math.floor(order[0][0] * 10))];
    bin.n++;
    bin.confidence += order[0][0];
    bin.correct += hit ? 1 : 0;
  }
  const n = data.length;
  const ece = bins.reduce((sum, b) => sum + (b.n ? (b.n / n) * Math.abs(b.correct / b.n - b.confidence / b.n) : 0), 0);
  return {
    n,
    top1: top1 / n,
    top3: top3 / n,
    logLoss: loss / n,
    brier: brier / n,
    ece,
    bins: bins.map(b => ({ n: b.n, confidence: b.n ? b.confidence / b.n : 0, correct: b.n ? b.correct / b.n : 0 })),
  };
};
/** A 95 % interval for top-1 and top-3 by drawing whole games again and again. */
const interval = (data, probs) => {
  const byGame = new Map();
  for (const r of data) (byGame.get(r.g) ?? byGame.set(r.g, []).get(r.g)).push(r);
  const groups = [...byGame.values()].map(group => {
    let top1 = 0;
    let top3 = 0;
    for (const r of group) {
      const order = probs(r).map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]);
      if (order[0][1] === r.chosen) top1++;
      if (order.slice(0, 3).some(o => o[1] === r.chosen)) top3++;
    }
    return { n: group.length, top1, top3 };
  });
  const random = mulberry(20261101);
  const draws = [];
  for (let b = 0; b < 2000; b++) {
    let n = 0;
    let top1 = 0;
    let top3 = 0;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[Math.floor(random() * groups.length)];
      n += g.n;
      top1 += g.top1;
      top3 += g.top3;
    }
    draws.push([top1 / n, top3 / n]);
  }
  const range = i => {
    const sorted = draws.map(d => d[i]).sort((a, b) => a - b);
    return [sorted[Math.floor(0.025 * sorted.length)], sorted[Math.floor(0.975 * sorted.length)]];
  };
  return { top1: range(0), top3: range(1) };
};
const uniform = r => r.cands.map(() => 1 / r.cands.length);
const REP = FEATURES.indexOf('repPlayer');
// "What this player played here before", and nothing else: counts with one extra game spread over all legal moves.
const repertoire = r => {
  const c = r.cands.map(x => Math.expm1(x.f[REP]) + 1 / r.cands.length);
  const sum = c.reduce((a, b) => a + b, 0);
  return c.map(x => x / sum);
};
const sharedOnly = (() => {
  const t = Float64Array.from(theta);
  for (let i = K; i < 3 * K; i++) t[i] = 0;
  return modelProbs(t, temperature);
})();
const model = modelProbs(theta, temperature);
const fitKeys = new Set(fitRows.map(r => r.key));
const testOwn = testRows.filter(own);
const sets = {
  all: testOwn,
  gukesh: testOwn.filter(r => r.mover === 'gukesh'),
  sindarov: testOwn.filter(r => r.mover === 'sindarov'),
  seenInFitting: testOwn.filter(r => fitKeys.has(r.key)),
  notSeenInFitting: testOwn.filter(r => !fitKeys.has(r.key)),
};
const results = {};
for (const [name, data] of Object.entries(sets)) results[name] = { ...measure(data, model), interval: data.length ? interval(data, model) : undefined };
const baselines = {
  uniform: measure(testOwn, uniform),
  repertoireOnly: measure(testOwn, repertoire),
  withoutPlayerCorrections: measure(testOwn, sharedOnly),
};
const countOf = (split, pick = () => true) => ({
  games: games.filter(g => g.split === split).length,
  decisions: rows.filter(r => r.split === split && own(r) && pick(r)).length,
  positions: rows.filter(r => r.split === split).length,
});
const sample = {
  fit: { ...countOf('fit'), gukesh: countOf('fit', r => r.mover === 'gukesh').decisions, sindarov: countOf('fit', r => r.mover === 'sindarov').decisions },
  calibration: { ...countOf('calibration'), gukesh: countOf('calibration', r => r.mover === 'gukesh').decisions, sindarov: countOf('calibration', r => r.mover === 'sindarov').decisions },
  test: { ...countOf('test'), gukesh: countOf('test', r => r.mover === 'gukesh').decisions, sindarov: countOf('test', r => r.mover === 'sindarov').decisions },
};
const events = {};
for (const g of games) (events[g.event] ??= { split: g.split, first: firstDate[g.event], games: 0, gukesh: 0, sindarov: 0 }).games++;
for (const g of games) for (const p of [g.white, g.black]) if (p) events[g.event][p]++;

// ---------- the files
// For the match itself every selected game is an earlier game, so the tables
// that are shipped count all of them. The measurements above never saw these
// larger tables.
const shipped = { gukesh: new Map(), sindarov: new Map(), any: new Map() };
for (const { game, white, black } of games) {
  let fen = game.initialFen;
  for (let i = 0; i < Math.min(PRIOR_PLIES, game.plies.length); i++) {
    const whiteMoves = (i % 2 === 0) === (game.initialFen.split(' ')[1] !== 'b');
    const mover = whiteMoves ? white : black;
    const key = positionKey(fen);
    const uci = candidates({ fen }).find(c => c.san === game.plies[i].san).uci;
    if (mover) count(shipped[mover], key, uci);
    count(shipped.any, key, uci);
    fen = game.plies[i].fen;
  }
}
const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
const weights = offset => Array.from(theta.slice(offset, offset + K), x => round(x));
const table = map => Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
const out = {
  version: 1,
  features: [...FEATURES],
  weights: { shared: weights(0), players: { gukesh: weights(K), sindarov: weights(2 * K) }, clock: weights(3 * K) },
  temperature,
  players: Object.fromEntries(Object.entries(PLAYERS).map(([id, key]) => [id, key])),
  // every selected game counts as an earlier game for the match
  priors: { players: { gukesh: table(shipped.gukesh), sindarov: table(shipped.sindarov) }, any: table(shipped.any) },
  stakesMax: STAKES_MAX,
  clockFullSeconds: CLOCK_FULL_SECONDS,
  report: {
    corpus: { path: CORPUS, sha256: corpusSha256, source: 'Lichess official broadcasts, January to October 2026', licence: 'CC BY-SA 4.0' },
    selection: { rule: `standard chess from the initial position; the larger of the first two clock readings at least ${CLASSICAL_SECONDS / 60} minutes`, selected: games.length, of: splitGames(raw).length, excluded },
    split: sample,
    penalties: { shared: best.penaltyShared, own: best.penaltyOwn },
    test: Object.fromEntries(Object.entries(results).map(([k, r]) => [k, r.n ? { n: r.n, top1: round(r.top1), top3: round(r.top3), logLoss: round(r.logLoss), brier: round(r.brier), ece: round(r.ece), top1Interval: r.interval.top1.map(x => round(x)), top3Interval: r.interval.top3.map(x => round(x)) } : { n: 0 }])),
    baselines: Object.fromEntries(Object.entries(baselines).map(([k, r]) => [k, { n: r.n, top1: round(r.top1), top3: round(r.top3), logLoss: round(r.logLoss), brier: round(r.brier), ece: round(r.ece) }])),
    calibration: results.all.bins.map(b => ({ n: b.n, said: round(b.confidence, 3), happened: round(b.correct, 3) })),
  },
};
writeFileSync('src/data/predictor.json', JSON.stringify(out) + '\n');

const pct = x => `${(100 * x).toFixed(1)} %`;
const line = (name, r) => `| ${name} | ${r.n} | ${pct(r.top1)} | ${pct(r.top3)} | ${r.logLoss.toFixed(3)} | ${r.brier.toFixed(3)} | ${pct(r.ece)} |`;
const report = `# Move predictor: what was measured

Written by \`scripts/train-predictor.mjs\`. Do not edit by hand; run the script.

Corpus: \`${CORPUS}\` (SHA-256 \`${corpusSha256}\`), from the Lichess broadcast database, CC BY-SA 4.0.

## Games

Selected ${games.length} of ${splitGames(raw).length} games: standard chess from the initial position, with the larger of the first two clock readings at least ${CLASSICAL_SECONDS / 60} minutes. Tags were not trusted over the clocks.

| Left out | Games |
|---|---|
${Object.entries(excluded).map(([k, n]) => `| ${k} | ${n} |`).join('\n')}

| Event | First game | Set | Games | Gukesh | Sindarov |
|---|---|---|---|---|---|
${Object.entries(events).sort((a, b) => a[1].first.localeCompare(b[1].first)).map(([e, v]) => `| ${e} | ${v.first} | ${v.split} | ${v.games} | ${v.gukesh} | ${v.sindarov} |`).join('\n')}

| Set | Games | Decisions by the two players | Gukesh | Sindarov | All positions (both sides) |
|---|---|---|---|---|---|
${['fit', 'calibration', 'test'].map(s => `| ${s} | ${sample[s].games} | ${sample[s].decisions} | ${sample[s].gukesh} | ${sample[s].sindarov} | ${sample[s].positions} |`).join('\n')}

The weights were fitted on the fitting games (both sides' moves; the two players' corrections on their own moves). "Played here before" never includes the game a position is from: a fitting game counts the fitting games of earlier days, and the calibration and test games count the fitting games only. The tables shipped with the site count all selected games, since for the match all of them are earlier games; no measurement here used those. The penalties (${best.penaltyShared} shared, ${best.penaltyOwn} corrections) and the temperature (${temperature}) were chosen on the calibration games, which are games of one player only. The test games were used once, for the tables below.

## Test games: the two players' own moves

| | Decisions | First choice right | In the first three | Log loss | Brier | Calibration error |
|---|---|---|---|---|---|---|
${line('**The model**', results.all)}
${line('Without the per-player corrections', baselines.withoutPlayerCorrections)}
${line('Only "played here before"', baselines.repertoireOnly)}
${line('Every legal move equally likely', baselines.uniform)}

95 % intervals for the model, from drawing whole games again: first choice ${pct(results.all.interval.top1[0])} to ${pct(results.all.interval.top1[1])}, first three ${pct(results.all.interval.top3[0])} to ${pct(results.all.interval.top3[1])}.

| The model on | Decisions | First choice right | In the first three | Log loss |
|---|---|---|---|---|
${['gukesh', 'sindarov', 'seenInFitting', 'notSeenInFitting'].map(k => `| ${{ gukesh: 'Gukesh', sindarov: 'Sindarov', seenInFitting: 'positions that also occur in the fitting games', notSeenInFitting: 'positions that do not' }[k]} | ${results[k].n} | ${results[k].n ? pct(results[k].top1) : ''} | ${results[k].n ? pct(results[k].top3) : ''} | ${results[k].n ? results[k].logLoss.toFixed(3) : ''} |`).join('\n')}

## Calibration on the test games

When the model gave its first choice a probability in the range on the left, how often that move was played.

| Said | Decisions | Average said | Played |
|---|---|---|---|
${results.all.bins.map((b, i) => (b.n ? `| ${i * 10} to ${i * 10 + 10} % | ${b.n} | ${pct(b.confidence)} | ${pct(b.correct)} |` : '')).filter(Boolean).join('\n')}

## Weights

| Feature | Shared | Gukesh | Sindarov | Under clock pressure |
|---|---|---|---|---|
${FEATURES.map((f, k) => `| ${f} | ${theta[k].toFixed(2)} | ${theta[K + k].toFixed(2)} | ${theta[2 * K + k].toFixed(2)} | ${theta[3 * K + k].toFixed(2)} |`).join('\n')}
`;
writeFileSync('docs/PREDICTOR-REPORT.md', report);
console.log(JSON.stringify({ sample, test: out.report.test.all, baselines: out.report.baselines }, null, 1));
await vite.close();
