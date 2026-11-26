// Fits, selects and measures the move predictor, second version.
//
//   node scripts/train-predictor.mjs                       the selection stage
//   node scripts/train-predictor.mjs --final               the selection stage again, then the final measurement
//   node scripts/train-predictor.mjs --measure-frozen      the final measurement from the committed selection, without fitting
//   node scripts/train-predictor.mjs --calibration-check   one more calibration step, tried on the selection games and not adopted
//   node scripts/train-predictor.mjs --v3                  the third version's choices, on the selection games (add --final to measure)
//   node scripts/train-predictor.mjs --v3-situation        what the score does to a player's moves, from World Cup two-game matches
//   node scripts/train-predictor.mjs --v3-title            whether a title match changes what a player opens with
//
// The protocol this follows was written down before any fitting:
// docs/PREDICTOR-V2-PROTOCOL.md. In short:
//
//   1. Select classical games in standard chess, by what the clocks show,
//      from both corpora (2023 to 2025, and 2026).
//   2. Group them into tournaments and split whole tournaments by the date
//      they ended: fit, selection, untouched holdout, reused benchmark.
//   3. For every position list the legal moves and their features, and what
//      was played there in tournaments that ended before this one started.
//   4. Fit weights on the fit games.
//   5. Make every choice on the selection games: which family of model, its
//      penalties, temperature and how counts of earlier moves are blended.
//   6. Only with --final: measure once on the untouched holdout and on the
//      reused benchmark, next to the published first version.
//
// The selection stage never scores a holdout decision, and no model of this
// version ever scores a benchmark decision in it. The one thing it does on
// the benchmark is to run the published first version there and stop unless
// that gives the numbers already published: a check that games, features and
// scoring are what they were. It writes data/predictor-v2/selection.json, which is
// committed before the final measurement is run. --final repeats the
// selection, stops if it does not come out identical to that file, and then
// writes src/data/predictor.json and docs/PREDICTOR-REPORT.md.
// --measure-frozen writes the same two files without fitting anything: it
// reads the committed selection, checks that the corpora, the split and the
// tournaments are the ones it was made on and that its settings give its
// recorded losses on the selection games, and then measures. Both use the
// committed file and nothing else for the measurement, so they write the
// same bytes.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const FINAL = process.argv.includes('--final');
/** Measure with the committed selection as it is: nothing is fitted and nothing is chosen in such a run. */
const FROZEN = process.argv.includes('--measure-frozen');
/** The third version: theory, the same tournament's earlier rounds and faster games on top of the second version's frozen base. See scripts/predictor-v3.mjs. */
const V3 = process.argv.includes('--v3');
/** The two studies of the third version: they read the committed selection and write a file of their own. */
const STUDY = process.argv.includes('--v3-situation') || process.argv.includes('--v3-title');
const vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false }, logLevel: 'error' });
const { parseGame, splitGames } = await vite.ssrLoadModule('/src/lib/pgn.ts');
const { candidates, FEATURES, positionKey } = await vite.ssrLoadModule('/src/lib/predictor/features.ts');
const { clockPressure } = await vite.ssrLoadModule('/src/lib/predictor/model.ts');

const EARLIER = 'data/player-history/earlier/games.pgn';
const CORPUS_2026 = 'data/player-history/games.pgn';
const MONTHS_2026 = 'data/player-history/archive-months.json';
const V1 = 'data/predictor-v1/predictor.json';
const SELECTION = 'data/predictor-v2/selection.json';
const PLAYERS = { 46616543: 'gukesh', 14205483: 'sindarov' };
const MOVER = { other: 0, gukesh: 1, sindarov: 2 };
/** Classical: the larger of the first two clock readings is at least this. Tags are not trusted over the clocks. */
const CLASSICAL_SECONDS = 45 * 60;
/** Whole tournaments by the day they ended. */
const SETS = [
  ['fit', '2024-12-31'],
  ['selection', '2025-12-31'],
  ['holdout', '2026-08-31'],
  ['benchmark', '9999-12-31'],
];
/** A broadcast name becomes a new tournament after this many months without a game. */
const GAP_MONTHS = 3;
/** Tables of earlier moves cover the first this many half-moves of a game. */
const PRIOR_PLIES = 40;
const CLOCK_FULL_SECONDS = 600;
const STAKES_MAX = 0.35;
/** The shipped tables are aged as of this day: the day after the corpus ends. */
const AS_OF = '2026-11-01';
const K = FEATURES.length;
const REP_PLAYER = FEATURES.indexOf('repPlayer');
const REP_ANY = FEATURES.indexOf('repAny');
const YEAR_MS = 365.25 * 86400e3;
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
/** Order by the text itself, character code by character code. localeCompare would order by the machine's language settings, and the files this writes have to come out the same everywhere. */
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const log = (...a) => console.log(`[${((Date.now() - startedAt) / 1000).toFixed(0).padStart(4)} s]`, ...a);
const startedAt = Date.now();

// ---------- 1. selection of games
const tagOf = (chunk, name) => new RegExp(`^\\[${name} "(.*)"\\]$`, 'm').exec(chunk)?.[1];
const months2026 = JSON.parse(readFileSync(MONTHS_2026, 'utf8')).months;
const corpora = [
  { name: 'earlier', path: EARLIER, archiveOf: chunk => tagOf(chunk, 'Archive') },
  { name: '2026', path: CORPUS_2026, archiveOf: chunk => months2026[tagOf(chunk, 'GameURL')] },
];
const monthIndex = month => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
const lastDayOf = month => `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;
/** A game's date, if it has one that can be believed: in its archive month or the two months before it. */
const usableDate = (chunk, archive) => {
  const text = tagOf(chunk, 'Date') ?? tagOf(chunk, 'UTCDate');
  if (!text || !/^\d{4}[.-]\d{2}[.-]\d{2}$/.test(text)) return undefined;
  const date = text.replaceAll('.', '-');
  const m = monthIndex(date.slice(0, 7));
  return m <= monthIndex(archive) && m >= monthIndex(archive) - 2 ? date : undefined;
};
const selectionCounts = {};
const seenGames = new Set();
const games = [];
for (const corpus of corpora) {
  const counts = (selectionCounts[corpus.name] = { path: corpus.path, sha256: sha256(corpus.path), games: 0, selected: 0, excluded: {} });
  const drop = reason => (counts.excluded[reason] = (counts.excluded[reason] ?? 0) + 1);
  for (const chunk of splitGames(readFileSync(corpus.path, 'utf8'))) {
    counts.games++;
    const variant = tagOf(chunk, 'Variant') ?? 'Standard';
    if (variant !== 'Standard' || tagOf(chunk, 'FEN') || tagOf(chunk, 'SetUp') === '1') {
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
    if (seenGames.has(key)) {
      drop('the same game twice');
      continue;
    }
    seenGames.add(key);
    const archive = corpus.archiveOf(chunk);
    if (!archive || !/^\d{4}-\d{2}$/.test(archive)) throw new Error(`no archive month for a game of ${corpus.path}: ${tagOf(chunk, 'GameURL')}`);
    counts.selected++;
    games.push({
      game,
      corpus: corpus.name,
      archive,
      date: usableDate(chunk, archive),
      name: (tagOf(chunk, 'BroadcastName') ?? tagOf(chunk, 'Event') ?? '?').split(' | ')[0].trim(),
      // what the first version went by, to rebuild its tables
      v1Event: tagOf(chunk, 'Event') ?? '?',
      v1Date: tagOf(chunk, 'Date') ?? '',
      white: PLAYERS[game.white.fideId],
      black: PLAYERS[game.black.fideId],
      // the round inside its tournament, from a tag like "11.3"; 0 where it cannot be read
      round: Math.floor(Number((tagOf(chunk, 'Round') ?? '').split('.')[0])) || 0,
    });
  }
}

// ---------- 2. tournaments and sets
const tournaments = [];
{
  const byName = new Map();
  for (const g of games) (byName.get(g.name) ?? byName.set(g.name, []).get(g.name)).push(g);
  for (const [name, list] of byName) {
    list.sort((a, b) => byText(a.archive, b.archive));
    let current = [];
    const close = () => {
      const dates = current.map(g => g.date).filter(Boolean).sort();
      const months = current.map(g => g.archive).sort();
      // A lower bound for the start, an upper bound for the end. The start is the earliest usable date, unless that
      // date is in a later month than the earliest archive month: then an early round has no date of its own, and
      // the first day of that archive month is taken, so that an undated round cannot let in a tournament that
      // ended after it was played.
      const start = dates[0] && dates[0].slice(0, 7) <= months[0] ? dates[0] : `${months[0]}-01`;
      const t = { name, start, end: lastDayOf(months.at(-1)), games: current.length, gukesh: 0, sindarov: 0, months: [...new Set(months)] };
      for (const g of current) {
        g.tournament = t;
        for (const p of [g.white, g.black]) if (p) t[p]++;
      }
      t.set = SETS.find(([, until]) => t.end <= until)[0];
      tournaments.push(t);
    };
    for (const g of list) {
      if (current.length && monthIndex(g.archive) - monthIndex(current.at(-1).archive) > GAP_MONTHS) {
        close();
        current = [];
      }
      current.push(g);
    }
    close();
  }
  tournaments.sort((a, b) => byText(a.start, b.start) || byText(a.name, b.name));
  tournaments.forEach((t, i) => (t.index = i));
}
games.sort((a, b) => a.tournament.index - b.tournament.index || byText(a.archive, b.archive) || byText(a.game.id, b.game.id));
games.forEach((g, i) => (g.index = i));
/** Tournament X is over before tournament E starts. Where that cannot be shown from the data, it is not. */
const earlier = (x, e) => x.end < e.start;
const yearsBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / YEAR_MS;
log(`selected ${games.length} games in ${tournaments.length} tournaments:`, SETS.map(([s]) => `${s} ${games.filter(g => g.tournament.set === s).length}`).join(', '));

// ---------- 3. rows: legal moves, features, and what was played before
// The fit games keep every position (both sides fit the shared weights).
// The other sets keep the two players' own decisions, which is all that is
// ever scored there.
const rows = [];
/** Position key to the moves played there in the first PRIOR_PLIES half-moves of every selected game. */
const history = new Map();
/** The same for the first version's fitting games only, as it counted them. */
const v1Tables = { gukesh: new Map(), sindarov: new Map(), any: new Map() };
const v1FirstDate = {};
for (const g of games) if (g.corpus === '2026') v1FirstDate[g.v1Event] = !v1FirstDate[g.v1Event] || g.v1Date < v1FirstDate[g.v1Event] ? g.v1Date : v1FirstDate[g.v1Event];
const v1Fitting = g => g.corpus === '2026' && Number(v1FirstDate[g.v1Event].slice(5, 7)) <= 7;
const bump = (table, key, uci) => {
  let moves = table.get(key);
  if (!moves) table.set(key, (moves = {}));
  moves[uci] = (moves[uci] ?? 0) + 1;
};
for (const g of games) {
  const { game, white, black } = g;
  const set = g.tournament.set;
  let fen = game.initialFen;
  for (let i = 0; i < game.plies.length; i++) {
    const whiteMoves = (i % 2 === 0) === (game.initialFen.split(' ')[1] !== 'b');
    const mover = (whiteMoves ? white : black) ?? 'other';
    const key = positionKey(fen);
    const cands = candidates({ fen, lastMove: i > 0 ? game.plies[i - 1].uci : undefined, ownLastMove: i > 1 ? game.plies[i - 2].uci : undefined });
    const chosen = cands.findIndex(c => c.san === game.plies[i].san);
    if (chosen < 0) throw new Error(`move not among the legal ones: ${game.id} ply ${i + 1} ${game.plies[i].san}`);
    if (i < PRIOR_PLIES) {
      (history.get(key) ?? history.set(key, []).get(key)).push({ uci: cands[chosen].uci, mover: MOVER[mover], t: g.tournament, round: g.round });
      if (v1Fitting(g)) {
        if (mover !== 'other') bump(v1Tables[mover], key, cands[chosen].uci);
        bump(v1Tables.any, key, cands[chosen].uci);
      }
    }
    if (set === 'fit' || mover !== 'other') {
      const n = cands.length;
      const x = new Float64Array(n * K);
      for (let j = 0; j < n; j++) x.set(cands[j].f, j * K);
      rows.push({ g: g.index, t: g.tournament, round: g.round, set, mover: MOVER[mover], ply: i, key, n, x, ucis: cands.map(c => c.uci), chosen, pressure: clockPressure(i > 1 ? game.plies[i - 2].clk : undefined, CLOCK_FULL_SECONDS) });
    }
    fen = game.plies[i].fen;
  }
}
// What was played before, for every row: the moves of tournaments that were
// over before the row's tournament started. Never its own tournament.
let withHistory = 0;
for (const r of rows) {
  const entries = (history.get(r.key) ?? []).filter(e => earlier(e.t, r.t));
  const at = uci => r.ucis.indexOf(uci);
  const own = new Float64Array(r.n);
  const any = new Float64Array(r.n);
  r.hj = new Int32Array(entries.length);
  r.hage = new Float64Array(entries.length);
  r.hown = new Uint8Array(entries.length);
  entries.forEach((e, i) => {
    const j = at(e.uci);
    if (j < 0) throw new Error(`an earlier move that is not legal here: ${e.uci} in ${r.key}`);
    const mine = r.mover !== 0 && e.mover === r.mover;
    if (mine) own[j]++;
    any[j]++;
    r.hj[i] = j;
    r.hage[i] = yearsBetween(e.t.end, r.t.start);
    r.hown[i] = mine ? 1 : 0;
  });
  // the first version's two features, for the family that fits its recipe again
  for (let j = 0; j < r.n; j++) {
    r.x[j * K + REP_PLAYER] = Math.log1p(own[j]);
    r.x[j * K + REP_ANY] = Math.log1p(any[j]);
  }
  r.known = r.hown.some(Boolean);
  if (entries.length) withHistory++;
  if (r.set === 'benchmark') {
    // and the same two features as the published first version saw them: its 74 fitting games, nothing else
    const mover = r.mover === 1 ? 'gukesh' : 'sindarov';
    const p = v1Tables[mover].get(r.key) ?? {};
    const a = v1Tables.any.get(r.key) ?? {};
    r.v1 = { player: r.ucis.map(u => Math.log1p(p[u] ?? 0)), any: r.ucis.map(u => Math.log1p(a[u] ?? 0)) };
  }
}
const bySet = Object.fromEntries(SETS.map(([s]) => [s, rows.filter(r => r.set === s)]));
const ownOf = set => bySet[set].filter(r => r.mover !== 0);
const sample = Object.fromEntries(
  SETS.map(([s]) => [
    s,
    {
      tournaments: tournaments.filter(t => t.set === s).length,
      games: games.filter(g => g.tournament.set === s).length,
      decisions: ownOf(s).length,
      gukesh: ownOf(s).filter(r => r.mover === 1).length,
      sindarov: ownOf(s).filter(r => r.mover === 2).length,
      withEarlierGames: ownOf(s).filter(r => r.known).length,
    },
  ]),
);
log(`rows ${rows.length} (${withHistory} with earlier moves);`, SETS.map(([s]) => `${s} ${sample[s].decisions} decisions`).join(', '));
// the reused benchmark has to be the very decisions the first version was measured on
if (sample.benchmark.games !== 21 || sample.benchmark.decisions !== 963) throw new Error(`the benchmark is not the 21 games and 963 decisions of the first report: ${JSON.stringify(sample.benchmark)}`);
if ([...games].filter(g => v1Fitting(g)).length !== 74) throw new Error('the first version\'s fitting games are not the 74 of its report');

// ---------- 4. fitting
const softmaxInto = (scores, n) => {
  let max = -Infinity;
  for (let j = 0; j < n; j++) if (scores[j] > max) max = scores[j];
  let sum = 0;
  for (let j = 0; j < n; j++) sum += scores[j] = Math.exp(scores[j] - max);
  for (let j = 0; j < n; j++) scores[j] /= sum;
  return scores;
};
const ALL = Int32Array.from(FEATURES.map((_, k) => k));
const BOARD = ALL.filter(k => k !== REP_PLAYER && k !== REP_ANY);
const MAX_N = rows.reduce((m, r) => Math.max(m, r.n), 0);
/** The scores of a row's moves under weights theta (shared, gukesh, sindarov, clock), before any temperature. */
const scoresOf = (theta, r, active, out = new Float64Array(r.n), x = r.x) => {
  const own = r.mover === 0 ? -1 : r.mover * K;
  for (let j = 0; j < r.n; j++) {
    let s = 0;
    const base = j * K;
    for (let a = 0; a < active.length; a++) {
      const k = active[a];
      const f = x[base + k];
      if (f !== 0) s += f * (theta[k] + (own < 0 ? 0 : theta[own + k]) + r.pressure * theta[3 * K + k]);
    }
    out[j] = s;
  }
  return out;
};
/**
 * Maximum likelihood with penalties, by Adam, as in the first version:
 * 500 full passes, rate 0.05. `active` are the features in use, `players`
 * whether each player has corrections of their own.
 */
const fit = (data, { active, penaltyShared, penaltyPlayers, penaltyClock, players = true }) => {
  const theta = new Float64Array(4 * K);
  const m = new Float64Array(4 * K);
  const v = new Float64Array(4 * K);
  const grad = new Float64Array(4 * K);
  const w = new Float64Array(K);
  const gr = new Float64Array(K);
  const p = new Float64Array(MAX_N);
  const fitted = new Uint8Array(4 * K);
  for (const k of active) {
    fitted[k] = 1;
    if (players) fitted[K + k] = fitted[2 * K + k] = 1;
    fitted[3 * K + k] = 1;
  }
  const penalty = i => (i < K ? penaltyShared : i < 3 * K ? penaltyPlayers : penaltyClock);
  const rate = 0.05;
  for (let step = 1; step <= 500; step++) {
    grad.fill(0);
    for (const r of data) {
      const own = players && r.mover !== 0 ? r.mover * K : -1;
      const x = r.x;
      for (let a = 0; a < active.length; a++) {
        const k = active[a];
        w[k] = theta[k] + (own < 0 ? 0 : theta[own + k]) + r.pressure * theta[3 * K + k];
        gr[k] = 0;
      }
      for (let j = 0; j < r.n; j++) {
        let s = 0;
        const base = j * K;
        for (let a = 0; a < active.length; a++) s += x[base + active[a]] * w[active[a]];
        p[j] = s;
      }
      softmaxInto(p, r.n);
      for (let j = 0; j < r.n; j++) {
        const err = p[j] - (j === r.chosen ? 1 : 0);
        const base = j * K;
        for (let a = 0; a < active.length; a++) gr[active[a]] += err * x[base + active[a]];
      }
      for (let a = 0; a < active.length; a++) {
        const k = active[a];
        grad[k] += gr[k];
        if (own >= 0) grad[own + k] += gr[k];
        grad[3 * K + k] += gr[k] * r.pressure;
      }
    }
    for (let i = 0; i < 4 * K; i++) {
      if (!fitted[i]) continue;
      const g = grad[i] / data.length + penalty(i) * theta[i];
      m[i] = 0.9 * m[i] + 0.1 * g;
      v[i] = 0.999 * v[i] + 0.001 * g * g;
      theta[i] -= (rate * (m[i] / (1 - 0.9 ** step))) / (Math.sqrt(v[i] / (1 - 0.999 ** step)) + 1e-8);
    }
  }
  // Four decimals, as the weights are shipped: every choice and every measurement below uses exactly these numbers.
  return theta.map(x => round(x));
};

// ---------- the models as functions from a row to probabilities
/** Family A, the first version's recipe: everything in one weighted sum, one temperature. */
const familyA = (theta, temperature) => r => {
  const s = scoresOf(theta, r, ALL);
  for (let j = 0; j < r.n; j++) s[j] /= temperature;
  return softmaxInto(s, r.n);
};
/** The base model of family B: the board features only. Where no per-player corrections were fitted, they are zero in theta. */
const baseOf = (theta, temperature) => r => {
  const s = scoresOf(theta, r, BOARD);
  for (let j = 0; j < r.n; j++) s[j] /= temperature;
  return softmaxInto(s, r.n);
};
/**
 * Family B: counts of earlier moves blended with the base model,
 *   p(m) = (own(m) + w·others(m) + κ·q(m)) / (own + w·others + κ),
 * each count aged by half-life h (years; null for no ageing), and then a
 * small share ε spread over all legal moves.
 */
const familyB = ({ theta, temperature, kappa, others, halfLife, epsilon }) => {
  const base = baseOf(theta, temperature);
  return r => {
    const p = base(r);
    let total = kappa;
    for (let j = 0; j < r.n; j++) p[j] *= kappa;
    for (let i = 0; i < r.hj.length; i++) {
      const weight = (r.hown[i] ? 1 : others) * (halfLife === null ? 1 : 0.5 ** (r.hage[i] / halfLife));
      p[r.hj[i]] += weight;
      total += weight;
    }
    for (let j = 0; j < r.n; j++) p[j] = (1 - epsilon) * (p[j] / total) + epsilon / r.n;
    return p;
  };
};
const uniform = r => new Float64Array(r.n).fill(1 / r.n);
const logLoss = (data, probs) => -data.reduce((sum, r) => sum + Math.log(Math.max(1e-12, probs(r)[r.chosen])), 0) / data.length;
/** The value between lo and hi that gives the lowest loss, to three decimals. */
const searchTemperature = (loss, lo = 0.5, hi = 3) => {
  for (let i = 0; i < 40; i++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (loss(a) < loss(b)) hi = b;
    else lo = a;
  }
  return Math.round(((lo + hi) / 2) * 1000) / 1000;
};

// ---------- the published first version on the reused benchmark: it must give its published numbers
const v1 = JSON.parse(readFileSync(V1, 'utf8'));
if (JSON.stringify(v1.features) !== JSON.stringify([...FEATURES])) throw new Error('the features are not those of the first version');
const v1Theta = Float64Array.from([...v1.weights.shared, ...v1.weights.players.gukesh, ...v1.weights.players.sindarov, ...v1.weights.clock]);
/** Frozen weights and temperature, with the tables its numbers were measured with: its 74 fitting games. Never the tables of the released file. */
const publishedV1 = r => {
  const x = Float64Array.from(r.x);
  for (let j = 0; j < r.n; j++) {
    x[j * K + REP_PLAYER] = r.v1.player[j];
    x[j * K + REP_ANY] = r.v1.any[j];
  }
  const s = scoresOf(v1Theta, r, ALL, new Float64Array(r.n), x);
  for (let j = 0; j < r.n; j++) s[j] /= v1.temperature;
  return softmaxInto(s, r.n);
};

// ---------- measuring
const BINS = 10;
const STATS = 5 + 6 * BINS;
/**
 * The moves in the order the site shows them: by probability, and exactly
 * equal ones by their UCI text, as predict() does in the browser.
 */
const ranked = (p, r) => Array.from(p, (x, i) => [x, i]).sort((a, b) => b[0] - a[0] || byText(r.ucis[a[1]], r.ucis[b[1]]));
/**
 * What a model did on each game, as sums that can be added up over any set
 * of games: decisions, log loss, Brier, first choice right, in the first
 * three, and two reliability tables in ten bins (the first choice; and the
 * three rows the page shows). With `expected`, ties are scored by their
 * expected value, for a baseline that gives many moves the same probability.
 */
const statsByGame = (data, probs, expected = false) => {
  const by = new Map();
  for (const r of data) {
    const s = by.get(r.g) ?? by.set(r.g, new Float64Array(STATS)).get(r.g);
    const p = probs(r);
    s[0]++;
    s[1] -= Math.log(Math.max(1e-12, p[r.chosen]));
    for (let j = 0; j < r.n; j++) s[2] += (p[j] - (j === r.chosen ? 1 : 0)) ** 2;
    let top1;
    let confidence;
    if (expected) {
      const mine = p[r.chosen];
      let above = 0;
      let tied = 0;
      for (let j = 0; j < r.n; j++) {
        if (p[j] > mine) above++;
        else if (p[j] === mine) tied++;
      }
      top1 = above === 0 ? 1 / tied : 0;
      s[4] += above >= 3 ? 0 : Math.min(1, (3 - above) / tied);
      confidence = Math.max(...p);
    } else {
      const order = ranked(p, r);
      top1 = order[0][1] === r.chosen ? 1 : 0;
      confidence = order[0][0];
      const shown = order.slice(0, 3);
      if (shown.some(o => o[1] === r.chosen)) s[4]++;
      for (const [x, j] of shown) {
        const b = 5 + 3 * BINS + 3 * Math.min(BINS - 1, Math.floor(x * BINS));
        s[b]++;
        s[b + 1] += x;
        s[b + 2] += j === r.chosen ? 1 : 0;
      }
    }
    s[3] += top1;
    const b = 5 + 3 * Math.min(BINS - 1, Math.floor(confidence * BINS));
    s[b]++;
    s[b + 1] += confidence;
    s[b + 2] += top1;
  }
  return by;
};
const sumOf = list => {
  const total = new Float64Array(STATS);
  for (const s of list) for (let i = 0; i < STATS; i++) total[i] += s[i];
  return total;
};
const reliability = (s, offset) => {
  const bins = [];
  let n = 0;
  for (let b = 0; b < BINS; b++) {
    const i = offset + 3 * b;
    bins.push({ n: s[i], said: s[i] ? s[i + 1] / s[i] : 0, happened: s[i] ? s[i + 2] / s[i] : 0 });
    n += s[i];
  }
  const from = lowest => {
    const part = bins.slice(lowest);
    const count = part.reduce((sum, b) => sum + b.n, 0);
    return { n: count, said: count ? part.reduce((sum, b) => sum + b.n * b.said, 0) / count : 0, happened: count ? part.reduce((sum, b) => sum + b.n * b.happened, 0) / count : 0 };
  };
  return { bins, error: n ? bins.reduce((sum, b) => sum + (b.n / n) * Math.abs(b.happened - b.said), 0) : 0, sure70: from(7), sure90: from(9) };
};
/** The numbers of the report from the sums. */
const derive = s => {
  const n = s[0];
  const first = reliability(s, 5);
  const shown = reliability(s, 5 + 3 * BINS);
  return { n, logLoss: s[1] / n, brier: s[2] / n, top1: s[3] / n, top3: s[4] / n, ece: first.error, bins: first.bins, sure70: first.sure70, sure90: first.sure90, shownEce: shown.error, shownBins: shown.bins };
};
const METRICS = {
  logLoss: d => d.logLoss,
  brier: d => d.brier,
  top1: d => d.top1,
  top3: d => d.top3,
  ece: d => d.ece,
  shownEce: d => d.shownEce,
  gap70: d => d.sure70.said - d.sure70.happened,
  gap90: d => d.sure90.said - d.sure90.happened,
};
const mulberry = seed => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
/**
 * A model on a set of decisions: its numbers, and 95 % intervals from
 * drawing whole games again (2,000 draws, fixed seed). With `against`, also
 * the interval of each difference (this model minus that one) on the same
 * draws, which is what a comparison on identical decisions needs.
 */
const measure = (data, probs, { expected = false, against } = {}) => {
  const mine = statsByGame(data, probs, expected);
  const ids = [...mine.keys()];
  const theirs = against ? statsByGame(data, against) : undefined;
  const result = derive(sumOf(mine.values()));
  const random = mulberry(20261101);
  const draws = Object.fromEntries(Object.keys(METRICS).map(k => [k, []]));
  const diffs = Object.fromEntries(Object.keys(METRICS).map(k => [k, []]));
  for (let b = 0; b < 2000; b++) {
    const picked = ids.map(() => ids[Math.floor(random() * ids.length)]);
    const a = derive(sumOf(picked.map(id => mine.get(id))));
    const t = theirs ? derive(sumOf(picked.map(id => theirs.get(id)))) : undefined;
    for (const [k, f] of Object.entries(METRICS)) {
      draws[k].push(f(a));
      if (t) diffs[k].push(f(a) - f(t));
    }
  }
  const range = list => {
    const sorted = list.filter(Number.isFinite).sort((x, y) => x - y);
    return sorted.length ? [sorted[Math.floor(0.025 * sorted.length)], sorted[Math.min(sorted.length - 1, Math.floor(0.975 * sorted.length))]] : undefined;
  };
  result.games = ids.length;
  result.intervals = Object.fromEntries(Object.keys(METRICS).map(k => [k, range(draws[k])]));
  if (theirs) {
    const other = derive(sumOf(theirs.values()));
    result.difference = Object.fromEntries(Object.entries(METRICS).map(([k, f]) => [k, { value: f(result) - f(other), interval: range(diffs[k]) }]));
  }
  return result;
};

{
  const again = derive(sumOf(statsByGame(ownOf('benchmark'), publishedV1).values()));
  const published = v1.report.shown;
  for (const k of ['top1', 'top3', 'logLoss', 'brier', 'ece']) {
    if (round(again[k]) !== published[k]) throw new Error(`the published first version is not reproduced on the benchmark: ${k} ${round(again[k])} here, ${published[k]} published`);
  }
  if (again.n !== published.n) throw new Error('the benchmark is not the decisions of the first report');
  log(`published first version reproduced on the benchmark: first ${(100 * again.top1).toFixed(1)} %, three ${(100 * again.top3).toFixed(1)} %, log loss ${again.logLoss.toFixed(3)}`);
}

// ---------- an extra calibration step that was tried on the selection games and not adopted: to reproduce that decision
if (process.argv.includes('--calibration-check')) {
  const { calibrationCheck } = await import('./predictor-calibration-check.mjs');
  const frozen = JSON.parse(readFileSync(SELECTION, 'utf8')).families.B;
  calibrationCheck({ rows: ownOf('selection'), theta: Float64Array.from(frozen.theta), chosen: frozen, grid: frozen.grid, scoresOf, softmaxInto, logLoss, searchTemperature, measure, BOARD, round, log });
  await vite.close();
  process.exit(0);
}

// ---------- 5. every choice, on the selection games only
const selRows = ownOf('selection');
/** The models a selection describes: both families, the base model of family B, and the chosen one as v2. */
const modelsOf = sel => {
  const A = sel.families.A;
  const B = sel.families.B;
  const models = {
    A: familyA(Float64Array.from(A.theta), A.temperature),
    B: familyB({ ...B, theta: Float64Array.from(B.theta) }),
    base: baseOf(Float64Array.from(B.theta), B.temperature),
  };
  models.v2 = models[sel.chosen];
  return models;
};
/** What the selection was made on: the corpora, the sets, the tournaments, and the pairs the safe end bound costs. */
const dataOf = () => ({
  corpora: selectionCounts,
  sample,
  tournaments: tournaments.map(t => ({ name: t.name, set: t.set, start: t.start, end: t.end, months: t.months, games: t.games, gukesh: t.gukesh, sindarov: t.sindarov })),
  // X began before E and shares a player with it, but ends in the month E starts, so it is not counted for E
  pairsLeftOut: tournaments.flatMap(x =>
    tournaments.filter(e => e !== x && x.start < e.start && !earlier(x, e) && x.end.slice(0, 7) === e.start.slice(0, 7) && ((x.gukesh && e.gukesh) || (x.sindarov && e.sindarov))).map(e => ({ earlier: x.name, ends: x.end, later: e.name, starts: e.start })),
  ),
});
/** The whole selection stage: ten fits, every choice on the selection games. Returns the text of the selection file. */
const select = () => {
  const fitRows = bySet.fit;
  const selection = { families: { A: { candidates: [] }, B: { candidates: [] } } };
  {
    // Family A as the first version did it: penalties by the loss at temperature 1, then the temperature.
    let best;
    for (const penaltyShared of [0.001, 0.01]) {
      for (const penaltyOwn of [0.01, 0.05, 0.2]) {
        const theta = fit(fitRows, { active: ALL, penaltyShared, penaltyPlayers: penaltyOwn, penaltyClock: penaltyOwn });
        const loss = logLoss(selRows, familyA(theta, 1));
        selection.families.A.candidates.push({ penaltyShared, penaltyOwn, lossAtTemperature1: loss });
        log(`family A, penalties ${penaltyShared} / ${penaltyOwn}: selection log loss ${loss.toFixed(4)} at temperature 1`);
        if (!best || loss < best.loss) best = { theta, loss, penaltyShared, penaltyOwn };
      }
    }
    const temperature = searchTemperature(t => logLoss(selRows, familyA(best.theta, t)), 0.5, 2.5);
    Object.assign(selection.families.A, { penaltyShared: best.penaltyShared, penaltyOwn: best.penaltyOwn, temperature, theta: Array.from(best.theta), loss: logLoss(selRows, familyA(best.theta, temperature)) });
    log(`family A chosen: penalties ${best.penaltyShared} / ${best.penaltyOwn}, temperature ${temperature}, selection log loss ${selection.families.A.loss.toFixed(4)}`);
  }
  {
    // Family B: four fits of the base model; for each, the blend is searched one setting at a time until nothing changes.
    const GRID = { kappa: [0.25, 0.5, 1, 2, 4, 8, 16], others: [0, 0.05, 0.1, 0.25, 0.5, 1], halfLife: [0.5, 1, 2, 4, null], epsilon: [0, 0.002, 0.005, 0.01, 0.02, 0.05] };
    const variants = [
      { label: 'corrections 0.01', players: true, penaltyPlayers: 0.01, penaltyClock: 0.01 },
      { label: 'corrections 0.2', players: true, penaltyPlayers: 0.2, penaltyClock: 0.2 },
      { label: 'no per-player corrections, clock 0.01', players: false, penaltyPlayers: 0, penaltyClock: 0.01 },
      { label: 'no per-player corrections, clock 0.2', players: false, penaltyPlayers: 0, penaltyClock: 0.2 },
    ];
    let best;
    for (const variant of variants) {
      const theta = fit(fitRows, { active: BOARD, penaltyShared: 0.001, penaltyPlayers: variant.penaltyPlayers, penaltyClock: variant.penaltyClock, players: variant.players });
      const cfg = { theta, players: variant.players, temperature: 1, kappa: 1, others: 0.25, halfLife: null, epsilon: 0 };
      const lossOf = change => logLoss(selRows, familyB({ ...cfg, ...change }));
      let loss = lossOf({});
      for (let round = 1; round <= 10; round++) {
        const before = JSON.stringify([cfg.temperature, cfg.kappa, cfg.others, cfg.halfLife, cfg.epsilon]);
        cfg.temperature = searchTemperature(t => lossOf({ temperature: t }));
        for (const name of Object.keys(GRID)) {
          for (const value of GRID[name]) {
            const candidate = lossOf({ [name]: value });
            if (candidate < lossOf({})) cfg[name] = value;
          }
        }
        loss = lossOf({});
        if (JSON.stringify([cfg.temperature, cfg.kappa, cfg.others, cfg.halfLife, cfg.epsilon]) === before) break;
      }
      const baseAlone = logLoss(selRows, baseOf(theta, searchTemperature(t => logLoss(selRows, baseOf(theta, t)))));
      selection.families.B.candidates.push({ label: variant.label, temperature: cfg.temperature, kappa: cfg.kappa, others: cfg.others, halfLife: cfg.halfLife, epsilon: cfg.epsilon, loss, baseModelAlone: baseAlone });
      log(`family B, ${variant.label}: T ${cfg.temperature}, κ ${cfg.kappa}, w ${cfg.others}, half-life ${cfg.halfLife ?? 'none'}, ε ${cfg.epsilon}: selection log loss ${loss.toFixed(4)} (base model alone ${baseAlone.toFixed(4)})`);
      if (!best || loss < best.loss) best = { ...cfg, loss, label: variant.label, penaltyPlayers: variant.penaltyPlayers, penaltyClock: variant.penaltyClock };
    }
    Object.assign(selection.families.B, { ...best, theta: Array.from(best.theta), grid: GRID });
    log(`family B chosen: ${best.label}, selection log loss ${best.loss.toFixed(4)}`);
  }
  selection.chosen = selection.families.B.loss < selection.families.A.loss ? 'B' : 'A';
  log(`chosen on the selection games: family ${selection.chosen}`);

  const models = modelsOf(selection);

  // What the selection games show, which may be read: the chosen model, the other family and the base model.
  selection.onSelection = {
    v2: measure(selRows, models.v2, { against: selection.chosen === 'B' ? models.A : models.B }),
    A: measure(selRows, models.A),
    B: measure(selRows, models.B),
    base: measure(selRows, models.base),
    uniform: measure(selRows, uniform, { expected: true }),
  };
  for (const [name, m] of Object.entries(selection.onSelection)) {
    log(`selection games, ${name}: log loss ${m.logLoss.toFixed(4)}, Brier ${m.brier.toFixed(4)}, first ${(100 * m.top1).toFixed(1)} %, three ${(100 * m.top3).toFixed(1)} %, calibration error ${(100 * m.ece).toFixed(1)} %, at 70 % and above: ${m.sure70.n} said ${(100 * m.sure70.said).toFixed(1)} % played ${(100 * m.sure70.happened).toFixed(1)} %`);
  }
  selection.protocol = 'docs/PREDICTOR-V2-PROTOCOL.md';
  Object.assign(selection, dataOf());
  // Six decimals in the file, so that it comes out the same on another machine.
  return JSON.stringify(selection, (key, value) => (typeof value === 'number' && !Number.isInteger(value) ? round(value, 6) : value), 1) + '\n';
};

if (!FROZEN && !V3 && !STUDY) {
  const selectionText = select();
  if (!FINAL) {
    mkdirSync('data/predictor-v2', { recursive: true });
    writeFileSync(SELECTION, selectionText);
    log(`wrote ${SELECTION}. Commit it before running --final or --measure-frozen.`);
    await vite.close();
    process.exit(0);
  }
  if (!existsSync(SELECTION) || readFileSync(SELECTION, 'utf8') !== selectionText) throw new Error(`${SELECTION} is missing or is not what this selection stage gives. Run the selection stage, commit it, then run --final.`);
  log('the selection stage came out identical to the committed file');
}

// ---------- 6. the final measurement, once, from the committed selection and nothing else
if (!existsSync(SELECTION)) throw new Error(`${SELECTION} is missing. Run the selection stage and commit it first.`);
const selection = JSON.parse(readFileSync(SELECTION, 'utf8'));
{
  // the committed selection has to have been made on these very games, split and grouped this way
  const here = JSON.parse(JSON.stringify(dataOf()));
  for (const part of Object.keys(here)) {
    if (JSON.stringify(selection[part]) !== JSON.stringify(here[part])) throw new Error(`the committed selection was made on other data: "${part}" differs from what the corpora give now`);
  }
  for (const family of ['A', 'B']) if (selection.families[family].theta.length !== 4 * K) throw new Error(`family ${family} of the committed selection has weights for other features`);
}
const models = modelsOf(selection);
// and its settings have to give its recorded losses on the selection games
for (const family of ['A', 'B']) {
  const loss = round(logLoss(selRows, models[family]), 6);
  if (loss !== selection.families[family].loss) throw new Error(`family ${family} of the committed selection gives log loss ${loss} on the selection games, not the ${selection.families[family].loss} it records`);
}
log(`committed selection verified (${sha256(SELECTION).slice(0, 16)}…): family ${selection.chosen}; measuring`);
if (process.argv.includes('--v3-situation')) {
  const { runSituation } = await import('./predictor-v3-situation.mjs');
  await runSituation({ round, FEATURES, K, BOARD, STAKES_MAX, selection, measure, scoresOf, softmaxInto, parseGame, candidates, log });
  await vite.close();
  process.exit(0);
}
if (process.argv.includes('--v3-title')) {
  const { runTitle } = await import('./predictor-v3-title.mjs');
  await runTitle({ round, K, BOARD, selection, measure, scoresOf, softmaxInto, parseGame, candidates, positionKey, monthIndex, log });
  await vite.close();
  process.exit(0);
}
if (V3) {
  const { runV3 } = await import('./predictor-v3.mjs');
  await runV3({ FINAL, splitGames, publishedV1, v1, round, byText, FEATURES, K, BOARD, PLAYERS, MOVER, AS_OF, PRIOR_PLIES, CLOCK_FULL_SECONDS, STAKES_MAX, selection, models, measure, uniform, logLoss, searchTemperature, scoresOf, softmaxInto, ownOf, rows, games, tournaments, history, sample, selectionCounts, yearsBetween, earlier, monthIndex, parseGame, positionKey, candidates, clockPressure, log, sha256 });
  await vite.close();
  process.exit(0);
}
const { writeFinal } = await import('./predictor-final.mjs');
await writeFinal({ publishedV1, v1, round, FEATURES, K, REP_PLAYER, REP_ANY, ALL, PLAYERS, V1, SELECTION, AS_OF, PRIOR_PLIES, CLOCK_FULL_SECONDS, STAKES_MAX, CLASSICAL_SECONDS, selection, models, measure, uniform, scoresOf, softmaxInto, ownOf, games, tournaments, history, sample, selectionCounts, yearsBetween, log, sha256 });
await vite.close();
