// The third version of the move predictor: what is added on top of the
// second version's frozen base model, how it is chosen and how it is
// measured. Called by scripts/train-predictor.mjs --v3 (add --final to
// measure and write the files). The plan is in docs/PREDICTOR-V3-PROTOCOL.md.
//
// Phase 1 adds three sources to the blend:
//
//   base(m) = (theory(m) + ν · board(m)) / (all theory + ν)
//   p(m)    = (own + μ · same + φ · faster + w · others + κ · base(m)) / (their sum + κ)
//
//   theory  what players rated 2600 or more played in the position, in
//           months before the tournament's own, aged by whole years;
//   same    the moves of earlier rounds of the same tournament (in the
//           match: its own earlier games);
//   faster  the player's own moves in their rapid and blitz games.
//
// The board model's weights are the second version's, untouched. Every new
// setting is chosen by log loss on the selection games (2025).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const CACHE = '.cache/predictor-v3';
export const SELECTION_V3 = 'data/predictor-v3/selection.json';
/** Theory counts are kept by whole years of age: 0 (up to a year old) to 7 (seven years and more). */
const YEARS = 8;
const GRID = {
  nu: [null, 0.5, 1, 2, 5, 10, 20],
  theoryHalfLife: [1, 2, 4, null],
  same: [0, 0.5, 1, 2, 4],
  faster: [0, 0.1, 0.25, 0.5, 1],
  kappa: [0.25, 0.5, 1, 2, 4, 8, 16],
  others: [0, 0.05, 0.1, 0.25, 0.5, 1],
  halfLife: [0.5, 1, 2, 4, null],
  epsilon: [0, 0.002, 0.005, 0.01, 0.02, 0.05],
};
/** Positions with fewer theory games than this are left out of the table; the largest that costs under TOLERANCE is taken. */
const MIN_THEORY = [1, 2, 3, 5, 10];
const TOLERANCE = 0.002;

export const runV3 = async ctx => {
  const { FINAL, round, K, BOARD, PLAYERS, MOVER, PRIOR_PLIES, selection, models, measure, uniform, logLoss, searchTemperature, scoresOf, softmaxInto, ownOf, history, sample, monthIndex, parseGame, positionKey, log } = ctx;
  const v2 = selection.families[selection.chosen];
  const theta = Float64Array.from(v2.theta);
  const tracked = new Set(Object.keys(PLAYERS));
  const lines = name => readFileSync(`${CACHE}/${name}.jsonl`, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  /** The first moves of a game as the reader wants them, from a list of SAN. */
  const replay = moves => {
    const text = moves.split(' ').slice(0, PRIOR_PLIES).map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' ');
    return parseGame(`[Event "x"]\n[White "a"]\n[Black "b"]\n[Result "*"]\n\n${text} *`, undefined, 0);
  };

  // ---------- theory: what strong players played, by position and month
  const theory = new Map();
  let eliteGames = 0;
  for (const g of lines('elite')) {
    // the two players' own games are counted where they belong, as their own
    if (tracked.has(g.whiteId) || tracked.has(g.blackId)) continue;
    const game = replay(g.moves);
    if (!game) continue;
    eliteGames++;
    const month = monthIndex(g.month);
    let fen = game.initialFen;
    for (const ply of game.plies) {
      const key = positionKey(fen);
      let entry = theory.get(key);
      if (!entry) theory.set(key, (entry = { ucis: [], months: [] }));
      entry.ucis.push(ply.uci);
      entry.months.push(month);
      fen = ply.fen;
    }
  }
  // ---------- the two players' own moves in their faster games
  const faster = new Map();
  let fasterGames = 0;
  for (const g of lines('faster')) {
    const game = replay(g.moves);
    if (!game) continue;
    fasterGames++;
    const month = monthIndex(g.month);
    const side = [PLAYERS[g.whiteId], PLAYERS[g.blackId]];
    let fen = game.initialFen;
    game.plies.forEach((ply, i) => {
      const mover = side[i % 2];
      if (mover) {
        const key = positionKey(fen);
        (faster.get(key) ?? faster.set(key, []).get(key)).push({ uci: ply.uci, mover: MOVER[mover], month });
      }
      fen = ply.fen;
    });
  }
  log(`v3: theory from ${eliteGames} elite games (${theory.size} positions), ${fasterGames} faster games of the two players (${faster.size} positions)`);

  // ---------- what each decision can see of them
  /** Adds to a row what the third version blends: theory by age, the same tournament's earlier rounds, faster games. */
  const prepare = (r, sameEntries) => {
    r.s = scoresOf(theta, r, BOARD);
    const at = uci => r.ucis.indexOf(uci);
    const now = r.month ?? monthIndex(r.t.start.slice(0, 7));
    r.th = undefined;
    r.thN = 0;
    const entry = theory.get(r.key);
    if (entry) {
      const th = new Float64Array(r.n * YEARS);
      let n = 0;
      for (let i = 0; i < entry.ucis.length; i++) {
        // only games of months before the tournament's own
        const age = now - entry.months[i];
        if (age <= 0) continue;
        const j = at(entry.ucis[i]);
        if (j < 0) continue;
        th[j * YEARS + Math.min(YEARS - 1, Math.floor((age - 1) / 12))]++;
        n++;
      }
      if (n) {
        r.th = th;
        r.thN = n;
      }
    }
    // earlier rounds of the same tournament: its own games so far
    const same = (sameEntries ?? history.get(r.key) ?? []).filter(e => e.t === r.t && r.round > 0 && e.round > 0 && e.round < r.round && at(e.uci) >= 0);
    r.sj = Int32Array.from(same, e => at(e.uci));
    r.sown = Uint8Array.from(same, e => (e.mover === r.mover ? 1 : 0));
    const fast = (faster.get(r.key) ?? []).filter(e => e.mover === r.mover && e.month < now && at(e.uci) >= 0);
    r.fj = Int32Array.from(fast, e => at(e.uci));
    r.fage = Float64Array.from(fast, e => (now - e.month) / 12);
    return r;
  };
  const ageOf = (years, halfLife) => (halfLife === null ? 1 : 0.5 ** (years / halfLife));
  /** The third version as a function from a row to probabilities. */
  const v3 = c => {
    const byYear = Array.from({ length: YEARS }, (_, y) => ageOf(y + 0.5, c.theoryHalfLife));
    return r => {
      const n = r.n;
      const p = new Float64Array(n);
      for (let j = 0; j < n; j++) p[j] = r.s[j] / c.temperature;
      softmaxInto(p, n);
      if (c.nu !== null && r.th && r.thN >= c.minTheory) {
        // the board model, pulled towards what strong players played here
        let total = c.nu;
        const played = new Float64Array(n);
        for (let j = 0; j < n; j++) {
          let x = 0;
          for (let y = 0; y < YEARS; y++) x += r.th[j * YEARS + y] * byYear[y];
          played[j] = x;
          total += x;
        }
        for (let j = 0; j < n; j++) p[j] = (played[j] + c.nu * p[j]) / total;
      }
      let total = c.kappa;
      for (let j = 0; j < n; j++) p[j] *= c.kappa;
      for (let i = 0; i < r.hj.length; i++) {
        const weight = (r.hown[i] ? 1 : c.others) * ageOf(r.hage[i], c.halfLife);
        p[r.hj[i]] += weight;
        total += weight;
      }
      if (c.same > 0) {
        for (let i = 0; i < r.sj.length; i++) {
          const weight = c.same * (r.sown[i] ? 1 : c.others);
          p[r.sj[i]] += weight;
          total += weight;
        }
      }
      if (c.faster > 0) {
        for (let i = 0; i < r.fj.length; i++) {
          const weight = c.faster * ageOf(r.fage[i], c.halfLife);
          p[r.fj[i]] += weight;
          total += weight;
        }
      }
      for (let j = 0; j < n; j++) p[j] = (1 - c.epsilon) * (p[j] / total) + c.epsilon / n;
      return p;
    };
  };

  // ---------- every choice, on the selection games
  const selRows = ownOf('selection').map(r => prepare(r));
  const start = { temperature: v2.temperature, kappa: v2.kappa, others: v2.others, halfLife: v2.halfLife, epsilon: v2.epsilon, nu: null, theoryHalfLife: null, same: 0, faster: 0, minTheory: 1 };
  if (round(logLoss(selRows, v3(start)), 6) !== v2.loss) throw new Error('with nothing added, the third version does not give the second version\'s loss on the selection games');
  const search = (from, names) => {
    const c = { ...from };
    const lossOf = change => logLoss(selRows, v3({ ...c, ...change }));
    for (let turn = 1; turn <= 10; turn++) {
      const before = JSON.stringify(c);
      for (const name of names) {
        for (const value of GRID[name]) if (lossOf({ [name]: value }) < lossOf({})) c[name] = value;
      }
      c.temperature = searchTemperature(t => lossOf({ temperature: t }));
      if (JSON.stringify(c) === before) break;
    }
    return { ...c, loss: lossOf({}) };
  };
  const blend = ['kappa', 'others', 'halfLife', 'epsilon'];
  // each source alone, to see what it is worth, and then all of them
  const alone = {
    theory: search(start, ['nu', 'theoryHalfLife', ...blend]),
    same: search(start, ['same', ...blend]),
    faster: search(start, ['faster', ...blend]),
  };
  const all = search(start, ['nu', 'theoryHalfLife', 'same', 'faster', ...blend]);
  for (const [name, c] of Object.entries({ ...alone, all })) log(`v3 on selection, ${name}: log loss ${c.loss.toFixed(4)} (second version ${v2.loss.toFixed(4)}) with ν ${c.nu}, theory half-life ${c.theoryHalfLife}, same ${c.same}, faster ${c.faster}, κ ${c.kappa}, w ${c.others}, half-life ${c.halfLife}, ε ${c.epsilon}, T ${c.temperature}`);
  // how small can the theory table be?
  const byMinimum = MIN_THEORY.map(k => ({ minimum: k, loss: logLoss(selRows, v3({ ...all, minTheory: k })) }));
  const minTheory = byMinimum.filter(x => x.loss <= byMinimum[0].loss + TOLERANCE).at(-1).minimum;
  const chosen = { ...all, minTheory, loss: logLoss(selRows, v3({ ...all, minTheory })) };
  log(`v3: theory table from positions with at least ${minTheory} games: ${byMinimum.map(x => `${x.minimum}: ${x.loss.toFixed(4)}`).join(', ')}`);

  const v3Selection = {
    protocol: 'docs/PREDICTOR-V3-PROTOCOL.md',
    base: { from: 'data/predictor-v2/selection.json', family: selection.chosen, loss: v2.loss },
    data: { eliteGames, theoryPositions: theory.size, fasterGames, fasterPositions: faster.size, selection: sample.selection },
    grid: GRID,
    alone,
    all,
    theoryMinimum: { candidates: byMinimum, tolerance: TOLERANCE, chosen: minTheory },
    chosen,
    onSelection: {
      v3: measure(selRows, v3(chosen), { against: models.v2 }),
      v2: measure(selRows, models.v2),
      withEarlierGames: selRows.filter(r => r.known).length,
      withTheory: selRows.filter(r => r.thN >= minTheory).length,
      withSameTournament: selRows.filter(r => r.sj.length > 0).length,
      withFaster: selRows.filter(r => r.fj.length > 0).length,
    },
  };
  const text = JSON.stringify(v3Selection, (key, value) => (typeof value === 'number' && !Number.isInteger(value) ? round(value, 6) : value), 1) + '\n';
  const m = v3Selection.onSelection;
  log(`v3 on selection: log loss ${m.v3.logLoss.toFixed(4)} against ${m.v2.logLoss.toFixed(4)}; first ${(100 * m.v3.top1).toFixed(1)} % against ${(100 * m.v2.top1).toFixed(1)} %; three ${(100 * m.v3.top3).toFixed(1)} % against ${(100 * m.v2.top3).toFixed(1)} %; calibration error ${(100 * m.v3.ece).toFixed(1)} % against ${(100 * m.v2.ece).toFixed(1)} %`);
  log(`   decisions with: own earlier games ${m.withEarlierGames}, theory ${m.withTheory}, same tournament ${m.withSameTournament}, faster games ${m.withFaster}, of ${selRows.length}`);
  if (!FINAL) {
    mkdirSync('data/predictor-v3', { recursive: true });
    writeFileSync(SELECTION_V3, text);
    log(`wrote ${SELECTION_V3}`);
    return;
  }
  if (!existsSync(SELECTION_V3) || readFileSync(SELECTION_V3, 'utf8') !== text) throw new Error(`${SELECTION_V3} is missing or is not what this stage gives. Run --v3 without --final and commit it first.`);
  const { writeV3 } = await import('./predictor-v3-final.mjs');
  await writeV3({ ...ctx, v3, prepare, theory, faster, chosen: JSON.parse(text).chosen, v3Selection: JSON.parse(text), YEARS, ageOf, replay });
};
