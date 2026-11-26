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
/** The model file has to stay under this, tables and all. */
const BUDGET_BYTES = 600 * 1024;
/** Weights, settings and the report in the file, apart from the two tables. */
const FIXED_BYTES = 8 * 1024;

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
      if (!entry) theory.set(key, (entry = { ucis: [], months: [], ply: game.plies.indexOf(ply) }));
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
      if (c.nu !== null && r.th && r.thN >= c.minTheory && r.ply < (c.theoryPlies ?? Infinity)) {
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
  // ---------- the tables as they ship, and a rule for how much theory fits
  // Keys are the last eight characters of the position key; a count is written right after its move.
  const shortKey = key => key.slice(-8);
  const number = x => {
    const text = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
    const trimmed = text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
    return trimmed.startsWith('0.') ? trimmed.slice(1) : trimmed;
  };
  const asOfMonth = monthIndex(ctx.AS_OF.slice(0, 7));
  /** Theory as one text, "key=move12.5,move3;…": games of months before `asOf`, aged, for positions the rule keeps. */
  const theoryTable = c => {
    const byYear = Array.from({ length: YEARS }, (_, y) => ageOf(y + 0.5, c.theoryHalfLife));
    const parts = new Map();
    let moves = 0;
    for (const [key, e] of theory) {
      if (e.ply >= c.theoryPlies || e.ucis.length < c.minTheory) continue;
      const counts = new Map();
      for (let i = 0; i < e.ucis.length; i++) {
        const age = asOfMonth - e.months[i];
        if (age > 0) counts.set(e.ucis[i], (counts.get(e.ucis[i]) ?? 0) + byYear[Math.min(YEARS - 1, Math.floor((age - 1) / 12))]);
      }
      const kept = [...counts].filter(([, x]) => number(x) !== '0').sort((a, b) => ctx.byText(a[0], b[0]));
      // two positions with the same short key: the first is kept (rare, and then one of them goes without theory)
      if (!kept.length || parts.has(shortKey(key))) continue;
      moves += kept.length;
      parts.set(shortKey(key), kept.map(([uci, x]) => uci + number(x)).join(','));
    }
    return { text: [...parts].sort((a, b) => ctx.byText(a[0], b[0])).map(([k, v]) => `${k}=${v}`).join(';'), positions: parts.size, moves };
  };
  /** The two players' own earlier moves as one text, aged as of the shipping day: "key=moveg1.5s2;…". */
  const ownTable = c => {
    const parts = new Map();
    let moves = 0;
    for (const [key, entries] of history) {
      const counts = new Map();
      for (const e of entries) {
        if (e.mover === 0) continue;
        const m = counts.get(e.uci) ?? counts.set(e.uci, [0, 0]).get(e.uci);
        m[e.mover - 1] += ageOf(ctx.yearsBetween(e.t.end, ctx.AS_OF), c.halfLife);
      }
      const kept = [...counts].map(([uci, [g, sx]]) => `${uci}${number(g) !== '0' ? `g${number(g)}` : ''}${number(sx) !== '0' ? `s${number(sx)}` : ''}`).filter(text => /[gs]/.test(text.slice(4))).sort();
      if (!kept.length || parts.has(shortKey(key))) continue;
      moves += kept.length;
      parts.set(shortKey(key), kept.join(','));
    }
    return { text: [...parts].sort((a, b) => ctx.byText(a[0], b[0])).map(([k, v]) => `${k}=${v}`).join(';'), positions: parts.size, moves };
  };

  // Others' moves in the two players' games, and the faster games, are weighed against what they cost.
  const withoutOthers = logLoss(selRows, v3({ ...all, others: 0 }));
  const withoutFaster = logLoss(selRows, v3({ ...all, faster: 0 }));
  log(`v3: without others' moves ${withoutOthers.toFixed(4)}, without faster games ${withoutFaster.toFixed(4)} (with both ${all.loss.toFixed(4)})`);
  // The theory rule: how deep into the game, and how many games a position needs. The lowest loss that fits.
  const lean = { ...all, others: 0, faster: 0 };
  const ownBytes = ownTable(lean).text.length;
  const rules = [];
  for (const theoryPlies of [16, 20, 24, 30, 40]) {
    for (const minimum of [1, 2, 3, 5]) {
      const c = { ...lean, theoryPlies, minTheory: minimum };
      const table = theoryTable(c);
      rules.push({ theoryPlies, minimum, loss: logLoss(selRows, v3(c)), positions: table.positions, theoryBytes: table.text.length, fileBytes: table.text.length + ownBytes + FIXED_BYTES });
    }
  }
  const fitting = rules.filter(x => x.fileBytes <= BUDGET_BYTES).sort((a, b) => a.loss - b.loss);
  const rule = fitting[0];
  for (const x of rules) log(`   theory to half-move ${x.theoryPlies}, at least ${x.minimum} games: log loss ${x.loss.toFixed(4)}, ${x.positions} positions, file ${(x.fileBytes / 1024).toFixed(0)} KB${x === rule ? '  <- chosen' : ''}`);
  // every other setting again, with that rule in place
  const chosenFull = search({ ...lean, theoryPlies: rule.theoryPlies, minTheory: rule.minimum }, ['nu', 'theoryHalfLife', 'same', 'kappa', 'halfLife', 'epsilon']);
  const chosen = chosenFull;
  log(`v3 chosen: theory to half-move ${chosen.theoryPlies} from ${chosen.minTheory} games, ν ${chosen.nu}, theory half-life ${chosen.theoryHalfLife}, same ${chosen.same}, κ ${chosen.kappa}, half-life ${chosen.halfLife}, ε ${chosen.epsilon}, T ${chosen.temperature}: log loss ${chosen.loss.toFixed(4)}`);

  const v3Selection = {
    protocol: 'docs/PREDICTOR-V3-PROTOCOL.md',
    base: { from: 'data/predictor-v2/selection.json', family: selection.chosen, loss: v2.loss },
    data: { eliteGames, theoryPositions: theory.size, fasterGames, fasterPositions: faster.size, selection: sample.selection },
    grid: GRID,
    alone,
    all,
    costs: { withoutOthers, withoutFaster, budgetBytes: BUDGET_BYTES, ownTableBytes: ownBytes },
    rules,
    chosen,
    onSelection: {
      v3: measure(selRows, v3(chosen), { against: models.v2 }),
      v2: measure(selRows, models.v2),
      withEarlierGames: selRows.filter(r => r.known).length,
      withTheory: selRows.filter(r => r.th && r.thN >= chosen.minTheory && r.ply < chosen.theoryPlies).length,
      withSameTournament: selRows.filter(r => r.sj.length > 0).length,
      withFaster: selRows.filter(r => r.fj.length > 0).length,
    },
  };
  const text = JSON.stringify(v3Selection, (key, value) => (typeof value === 'number' && !Number.isInteger(value) ? round(value, 6) : value), 1) + '\n';
  const m = v3Selection.onSelection;
  log(`v3 on selection: log loss ${m.v3.logLoss.toFixed(4)} against ${m.v2.logLoss.toFixed(4)}; first ${(100 * m.v3.top1).toFixed(1)} % against ${(100 * m.v2.top1).toFixed(1)} %; three ${(100 * m.v3.top3).toFixed(1)} % against ${(100 * m.v2.top3).toFixed(1)} %; calibration error ${(100 * m.v3.ece).toFixed(1)} % against ${(100 * m.v2.ece).toFixed(1)} %`);
  log(`   decisions with: own earlier games ${m.withEarlierGames}, theory ${m.withTheory}, same tournament ${m.withSameTournament}, of ${selRows.length}`);
  if (!FINAL) {
    mkdirSync('data/predictor-v3', { recursive: true });
    writeFileSync(SELECTION_V3, text);
    log(`wrote ${SELECTION_V3}`);
    return;
  }
  if (!existsSync(SELECTION_V3) || readFileSync(SELECTION_V3, 'utf8') !== text) throw new Error(`${SELECTION_V3} is missing or is not what this stage gives. Run --v3 without --final and commit it first.`);
  const { writeV3 } = await import('./predictor-v3-final.mjs');
  await writeV3({ ...ctx, v3, prepare, theory, theoryTable, ownTable, chosen: JSON.parse(text).chosen, v3Selection: JSON.parse(text), replay });
};
