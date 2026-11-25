// Fits and measures the move predictor from data/player-history/games.pgn.
//
//   node scripts/train-predictor.mjs
//
// Writes src/data/predictor.json (weights, tables of earlier moves, the
// measured results) and docs/PREDICTOR-REPORT.md (the same results, to
// read). Running it again on the same corpus gives the same files.
//
// The steps, in order:
//   1. Select classical games in standard chess, by what the clocks show.
//   2. Split whole events by date: fitting, calibration, test.
//   3. For every position, list the legal moves and their features.
//   4. Fit the weights on the fitting games.
//   5. Choose the strength of the penalties and the temperature on the
//      calibration games.
//   6. Measure on the test games, next to simple baselines.
//
// Two protocols are run, and both are reported.
//
// The first is the one that was planned and measured first. In it, "played
// here before" in a fitting game counts the fitting games of earlier days,
// which includes earlier rounds of the same event.
//
// The second differs in that one thing: a fitting game counts only games
// played before its own event began. That is how the tables are used in the
// match, whose own games are never in them. This change was made after the
// first measurement had been seen, because that measurement showed the model
// to be overconfident where lines repeat inside one event. No number of the
// second protocol is chosen on the test games, but its measurement is not a
// blind one, and it is reported as an exploratory revision. The weights that
// are shipped are the second protocol's.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { parseGame, splitGames } = await vite.ssrLoadModule('/src/lib/pgn.ts');
const { candidates, FEATURES, positionKey } = await vite.ssrLoadModule('/src/lib/predictor/features.ts');
const { clockPressure, softmax } = await vite.ssrLoadModule('/src/lib/predictor/model.ts');

const CORPUS = 'data/player-history/games.pgn';
const PLAYERS = { 46616543: 'gukesh', 14205483: 'sindarov' };
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
// "Played here before" comes from the fitting games only, and never from the
// game a position is from. A fitting game sees the fitting games played
// before its cut-off: its own day in the first protocol, the first day of its
// event in the second. Calibration and test games see all the fitting games
// and never each other.
const count = (table, key, uci) => {
  let moves = table.get(key);
  if (!moves) table.set(key, (moves = {}));
  moves[uci] = (moves[uci] ?? 0) + 1;
};
const addTo = (tables, { game, white, black }) => {
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
};
const buildRows = protocol => {
  const cutoff = g => (g.split !== 'fit' ? '9999' : protocol === 'events' ? firstDate[g.event] : g.date);
  const order = games.map((g, index) => ({ g, index })).sort((a, b) => cutoff(a.g).localeCompare(cutoff(b.g)) || a.index - b.index);
  const fitGames = games.filter(g => g.split === 'fit');
  const tables = { gukesh: new Map(), sindarov: new Map(), any: new Map() };
  let added = 0;
  const rows = [];
  for (const { g, index } of order) {
    // every fitting game played before this game's cut-off is now an earlier game
    while (added < fitGames.length && fitGames[added].date < cutoff(g)) addTo(tables, fitGames[added++]);
    const { game, white, black, split } = g;
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
      rows.push({ g: index, split, mover, key, ply: i, cands, chosen, pressure: clockPressure(i > 1 ? game.plies[i - 2].clk : undefined, CLOCK_FULL_SECONDS) });
      fen = game.plies[i].fen;
    }
  }
  return rows.sort((a, b) => a.g - b.g || a.ply - b.ply);
};

// ---------- 4. fitting
const own = r => r.mover !== 'other';
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

// ---------- 6. measuring
const mulberry = seed => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
/**
 * The moves in the order the site shows them: by probability, and where two
 * are exactly equal, by their UCI text. The same rule as predict() in
 * src/lib/predictor/model.ts.
 */
const ranked = (p, r) => p.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0] || r.cands[a[1]].uci.localeCompare(r.cands[b[1]].uci));
/**
 * Whether the played move is the first choice, and among the first three.
 * For the model this follows the site's ranking. For a baseline that gives
 * many moves exactly the same probability, any order among them would be
 * arbitrary, so the expected value over all such orders is used instead
 * (`expected`): the first choice of "every move equally likely" among n moves
 * is right 1/n of the time, and among the first three min(3, n)/n.
 */
const hits = (p, r, expected) => {
  if (!expected) {
    const order = ranked(p, r);
    return { top1: order[0][1] === r.chosen ? 1 : 0, top3: order.slice(0, 3).some(o => o[1] === r.chosen) ? 1 : 0, confidence: order[0][0] };
  }
  const mine = p[r.chosen];
  const above = p.filter(x => x > mine).length;
  const tied = p.filter(x => x === mine).length;
  return { top1: above === 0 ? 1 / tied : 0, top3: above >= 3 ? 0 : Math.min(1, (3 - above) / tied), confidence: Math.max(...p) };
};
const measure = (data, probs, expected = false) => {
  if (data.length === 0) return { n: 0 };
  let top1 = 0;
  let top3 = 0;
  let loss = 0;
  let brier = 0;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, confidence: 0, correct: 0 }));
  for (const r of data) {
    const p = probs(r);
    const h = hits(p, r, expected);
    top1 += h.top1;
    top3 += h.top3;
    loss -= Math.log(Math.max(1e-12, p[r.chosen]));
    brier += p.reduce((sum, x, i) => sum + (x - (i === r.chosen ? 1 : 0)) ** 2, 0);
    const bin = bins[Math.min(9, Math.floor(h.confidence * 10))];
    bin.n++;
    bin.confidence += h.confidence;
    bin.correct += h.top1;
  }
  const n = data.length;
  const ece = bins.reduce((sum, b) => sum + (b.n ? (b.n / n) * Math.abs(b.correct / b.n - b.confidence / b.n) : 0), 0);
  return { n, top1: top1 / n, top3: top3 / n, logLoss: loss / n, brier: brier / n, ece, bins: bins.map(b => ({ n: b.n, confidence: b.n ? b.confidence / b.n : 0, correct: b.n ? b.correct / b.n : 0 })) };
};
/** A 95 % interval for top-1 and top-3 by drawing whole games again and again. */
const interval = (data, probs) => {
  const byGame = new Map();
  for (const r of data) (byGame.get(r.g) ?? byGame.set(r.g, []).get(r.g)).push(r);
  const groups = [...byGame.values()].map(group => {
    let top1 = 0;
    let top3 = 0;
    for (const r of group) {
      const h = hits(probs(r), r, false);
      top1 += h.top1;
      top3 += h.top3;
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

/** One protocol from start to finish: fit, choose penalties and temperature on the calibration games, measure on the test games. */
const run = (name, rows) => {
  const fitRows = rows.filter(r => r.split === 'fit');
  const calRows = rows.filter(r => r.split === 'calibration');
  const testOwn = rows.filter(r => r.split === 'test' && own(r));
  // ---------- 5. penalties and temperature, on the calibration games only
  let best;
  for (const penaltyShared of [0.001, 0.01]) {
    for (const penaltyOwn of [0.01, 0.05, 0.2]) {
      const theta = fit(fitRows, penaltyShared, penaltyOwn);
      const loss = logLoss(calRows, modelProbs(theta, 1));
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
  const model = modelProbs(theta, temperature);
  const sharedOnly = (() => {
    const t = Float64Array.from(theta);
    for (let i = K; i < 3 * K; i++) t[i] = 0;
    return modelProbs(t, temperature);
  })();
  const fitKeys = new Set(fitRows.map(r => r.key));
  const sets = {
    all: testOwn,
    gukesh: testOwn.filter(r => r.mover === 'gukesh'),
    sindarov: testOwn.filter(r => r.mover === 'sindarov'),
    seenInFitting: testOwn.filter(r => fitKeys.has(r.key)),
    notSeenInFitting: testOwn.filter(r => !fitKeys.has(r.key)),
  };
  const results = {};
  for (const [set, data] of Object.entries(sets)) results[set] = { ...measure(data, model), interval: data.length ? interval(data, model) : undefined };
  // the two simple baselines tie a great deal, so they are scored by expectation over ties
  const baselines = { uniform: measure(testOwn, uniform, true), repertoireOnly: measure(testOwn, repertoire, true), withoutPlayerCorrections: measure(testOwn, sharedOnly) };
  console.log(`${name}: penalties ${best.penaltyShared} / ${best.penaltyOwn}, temperature ${temperature}; test first choice ${(100 * results.all.top1).toFixed(1)} %, first three ${(100 * results.all.top3).toFixed(1)} %, log loss ${results.all.logLoss.toFixed(3)}, calibration error ${(100 * results.all.ece).toFixed(1)} %`);
  return { theta, temperature, penalties: { shared: best.penaltyShared, own: best.penaltyOwn }, results, baselines };
};

const startedAt = Date.now();
const firstRows = buildRows('days');
const first = run('first protocol', firstRows);
const revised = run('revision', buildRows('events'));
console.log(`both protocols in ${((Date.now() - startedAt) / 1000).toFixed(0)} s`);

const decisions = (split, mover) => firstRows.filter(r => r.split === split && own(r) && (!mover || r.mover === mover)).length;
const sample = Object.fromEntries(
  ['fit', 'calibration', 'test'].map(split => [
    split,
    { games: games.filter(g => g.split === split).length, decisions: decisions(split), gukesh: decisions(split, 'gukesh'), sindarov: decisions(split, 'sindarov'), positions: firstRows.filter(r => r.split === split).length },
  ]),
);
const events = {};
for (const g of games) (events[g.event] ??= { split: g.split, first: firstDate[g.event], games: 0, gukesh: 0, sindarov: 0 }).games++;
for (const g of games) for (const p of [g.white, g.black]) if (p) events[g.event][p]++;

// ---------- the files
// For the match itself every selected game is an earlier game, so the tables
// that are shipped count all of them. No measurement used these larger tables.
const shipped = { gukesh: new Map(), sindarov: new Map(), any: new Map() };
for (const g of games) addTo(shipped, g);
const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
const weights = (theta, offset) => Array.from(theta.slice(offset, offset + K), x => round(x));
const table = map => Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
const summary = r => (r.n ? { n: r.n, top1: round(r.top1), top3: round(r.top3), logLoss: round(r.logLoss), brier: round(r.brier), ece: round(r.ece), ...(r.interval ? { top1Interval: r.interval.top1.map(x => round(x)), top3Interval: r.interval.top3.map(x => round(x)) } : {}) } : { n: 0 });
const protocolReport = p => ({
  penalties: p.penalties,
  temperature: p.temperature,
  test: Object.fromEntries(Object.entries(p.results).map(([k, r]) => [k, summary(r)])),
  baselines: Object.fromEntries(Object.entries(p.baselines).map(([k, r]) => [k, summary(r)])),
  calibration: p.results.all.bins.map(b => ({ n: b.n, said: round(b.confidence, 3), happened: round(b.correct, 3) })),
});
/** Of the first choices given at least 70 %, how many were played: the plainest sign of overconfidence. */
const whenSure = p => {
  const bins = p.results.all.bins.slice(7);
  const n = bins.reduce((sum, b) => sum + b.n, 0);
  return { n, said: n ? bins.reduce((sum, b) => sum + b.n * b.confidence, 0) / n : 0, happened: n ? bins.reduce((sum, b) => sum + b.n * b.correct, 0) / n : 0 };
};
const out = {
  version: 2,
  features: [...FEATURES],
  // the weights of the revised protocol
  weights: { shared: weights(revised.theta, 0), players: { gukesh: weights(revised.theta, K), sindarov: weights(revised.theta, 2 * K) }, clock: weights(revised.theta, 3 * K) },
  temperature: revised.temperature,
  players: Object.fromEntries(Object.entries(PLAYERS).map(([id, key]) => [id, key])),
  priors: { players: { gukesh: table(shipped.gukesh), sindarov: table(shipped.sindarov) }, any: table(shipped.any) },
  stakesMax: STAKES_MAX,
  clockFullSeconds: CLOCK_FULL_SECONDS,
  report: {
    corpus: { path: CORPUS, sha256: corpusSha256, source: 'Lichess official broadcasts, January to October 2026', licence: 'CC BY-SA 4.0' },
    selection: { rule: `standard chess from the initial position; the larger of the first two clock readings at least ${CLASSICAL_SECONDS / 60} minutes`, selected: games.length, of: splitGames(raw).length, excluded },
    split: sample,
    // what the panel quotes: the revised protocol on the test games, which is an exploratory measurement
    shown: { ...summary(revised.results.all), whenSure: (({ n, said, happened }) => ({ n, said: round(said, 3), happened: round(happened, 3) }))(whenSure(revised)), blind: false },
    firstProtocol: protocolReport(first),
    revision: protocolReport(revised),
  },
};
writeFileSync('src/data/predictor.json', JSON.stringify(out) + '\n');

const pct = x => `${(100 * x).toFixed(1)} %`;
const line = (name, r) => `| ${name} | ${r.n} | ${pct(r.top1)} | ${pct(r.top3)} | ${r.logLoss.toFixed(3)} | ${r.brier.toFixed(3)} | ${pct(r.ece)} |`;
const NAMES = { gukesh: 'Gukesh', sindarov: 'Sindarov', seenInFitting: 'positions that also occur in the fitting games', notSeenInFitting: 'positions that do not' };
const section = p => `Penalties ${p.penalties.shared} (shared) and ${p.penalties.own} (corrections), temperature ${p.temperature}, all chosen on the calibration games.

| | Decisions | First choice right | In the first three | Log loss | Brier | Calibration error |
|---|---|---|---|---|---|---|
${line('**The model**', p.results.all)}
${line('Without the per-player corrections', p.baselines.withoutPlayerCorrections)}
${line('Only "played here before" (ties averaged)', p.baselines.repertoireOnly)}
${line('Every legal move equally likely (ties averaged)', p.baselines.uniform)}

The model's moves are ranked as the site ranks them: by probability, and exactly equal ones by their UCI text. The two simple baselines give many moves exactly the same probability, so their two accuracy columns are the average over every order of the tied moves: 1/n and min(3, n)/n for n equally likely moves.

95 % intervals for the model, from drawing whole games again: first choice ${pct(p.results.all.interval.top1[0])} to ${pct(p.results.all.interval.top1[1])}, first three ${pct(p.results.all.interval.top3[0])} to ${pct(p.results.all.interval.top3[1])}.

| The model on | Decisions | First choice right | In the first three | Log loss |
|---|---|---|---|---|
${Object.keys(NAMES).map(k => `| ${NAMES[k]} | ${p.results[k].n} | ${p.results[k].n ? pct(p.results[k].top1) : ''} | ${p.results[k].n ? pct(p.results[k].top3) : ''} | ${p.results[k].n ? p.results[k].logLoss.toFixed(3) : ''} |`).join('\n')}

When the model gave its first choice a probability in the range on the left, how often that move was played:

| Said | Decisions | Average said | Played |
|---|---|---|---|
${p.results.all.bins.map((b, i) => (b.n ? `| ${i * 10} to ${i * 10 + 10} % | ${b.n} | ${pct(b.confidence)} | ${pct(b.correct)} |` : '')).filter(Boolean).join('\n')}
`;
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
${Object.entries(events).sort((a, b) => a[1].first.localeCompare(b[1].first)).map(([e, v]) => `| ${e.replaceAll('|', '\\|')} | ${v.first} | ${v.split} | ${v.games} | ${v.gukesh} | ${v.sindarov} |`).join('\n')}

| Set | Games | Decisions by the two players | Gukesh | Sindarov | All positions (both sides) |
|---|---|---|---|---|---|
${['fit', 'calibration', 'test'].map(s => `| ${s} | ${sample[s].games} | ${sample[s].decisions} | ${sample[s].gukesh} | ${sample[s].sindarov} | ${sample[s].positions} |`).join('\n')}

The weights are fitted on the fitting games (both sides' moves; the two players' corrections on their own moves). The calibration games are games of one player only. "Played here before" never includes the game a position is from, and the calibration and test games count the fitting games only. The tables shipped with the site count all selected games, since for the match all of them are earlier games; no measurement here used those.

All results below are for the two players' own moves in the test games.

## First protocol: as planned, measured first

In a fitting game, "played here before" counts the fitting games of earlier days, which includes earlier rounds of the same event.

${section(first)}
## Revision: exploratory, made after the first measurement

In a fitting game, "played here before" counts only games played before that game's event began. This is how the tables are used in the match, whose own games are never in them. Nothing else differs.

**This is not a blind measurement.** The change was made because the first measurement showed the model to be overconfident where lines repeat inside one event. No number of the revision was chosen on the test games, but the decision to revise was informed by them, so these results are likely to flatter the model somewhat. The probabilities are not claimed to be calibrated: the table below shows where they are not. The weights shipped with the site are the revision's.

${section(revised)}
## Weights of the revision

| Feature | Shared | Gukesh | Sindarov | Under clock pressure |
|---|---|---|---|---|
${FEATURES.map((f, k) => `| ${f} | ${revised.theta[k].toFixed(2)} | ${revised.theta[K + k].toFixed(2)} | ${revised.theta[2 * K + k].toFixed(2)} | ${revised.theta[3 * K + k].toFixed(2)} |`).join('\n')}
`;
writeFileSync('docs/PREDICTOR-REPORT.md', report);
await vite.close();
