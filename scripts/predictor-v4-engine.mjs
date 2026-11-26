// The fourth version's study: how much the two players avoid moves the
// engine thinks little of. Run by
//
//   node scripts/train-predictor.mjs --v3 --v4-engine
//
// The third version knows what was played before and what a move looks like
// on the board. It knows nothing of how good a move is, so it can give a
// share to a move that loses on the spot, and Özgür pointed at one: players
// of this strength do not play a move that takes them from level to lost.
//
// What is added is what the page already has when it shows the estimate:
// the engine's best lines for the position, each with its evaluation. For
// every legal move m of a decision,
//
//   score(m) = α · log p3(m) − β · loss(m) − γ · [m is not among the engine's lines]
//
// and the scores are turned into shares that add up to one. p3 is the third
// version's estimate. loss(m) is how much of the expected result the move
// gives up against the engine's first line, on the scale the page uses for
// win chances (0 to 1). A move that is not among the engine's N lines is at
// least as bad as the last of them, so it gets that line's loss, and γ on
// top for not being listed at all. α, β and γ are fitted for each number of
// lines the page may be showing (1 to 5), by maximum likelihood on the
// selection games (2025), and measured on the games of 2026.
//
// The engine: Stockfish, free software, searching every position to a fixed
// depth with five lines. Its answers are kept in data/predictor-v4/lines.txt
// so that the fit can be repeated without the engine; delete a line and it
// is searched again.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';

const DIR = 'data/predictor-v4';
const LINES = `${DIR}/lines.txt`;
const OUT = `${DIR}/engine.json`;
const ENGINE = process.env.STOCKFISH ?? (existsSync('/usr/games/stockfish') ? '/usr/games/stockfish' : 'stockfish');
const DEPTH = 14;
const MULTI_PV = 5;
/** A forced mate, as centipawns: beyond any evaluation, and nearer mates first. */
const MATE_CP = 100000;

/** White's or Black's winning chances in [-1, 1] from the mover's centipawns: the curve the page uses (src/lib/engine.ts). */
const chances = cp => (Math.abs(cp) >= MATE_CP / 2 ? Math.sign(cp) : 2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1);

/** One engine process that answers one position at a time. */
const engine = () => {
  const child = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'ignore'] });
  let buffer = '';
  let onLine = () => {};
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      onLine(line);
    }
  });
  const send = text => child.stdin.write(text + '\n');
  send('uci');
  send('setoption name Threads value 1');
  send('setoption name Hash value 64');
  send(`setoption name MultiPV value ${MULTI_PV}`);
  return {
    /** The engine's lines for a position: [move, centipawns for the side to move], best first. */
    search: fen =>
      new Promise(resolve => {
        const lines = new Map();
        onLine = line => {
          if (line.startsWith('info ') && line.includes(' multipv ') && !line.includes('bound')) {
            const depth = Number(/ depth (\d+)/.exec(line)?.[1]);
            const index = Number(/ multipv (\d+)/.exec(line)?.[1]);
            const cp = / score cp (-?\d+)/.exec(line);
            const mate = / score mate (-?\d+)/.exec(line);
            const move = / pv (\S+)/.exec(line)?.[1];
            if (!move || (!cp && !mate)) return;
            const value = cp ? Number(cp[1]) : Math.sign(Number(mate[1])) * (MATE_CP - Math.abs(Number(mate[1])));
            lines.set(index, { depth, move, value });
          } else if (line.startsWith('bestmove')) {
            const deepest = Math.max(0, ...[...lines.values()].map(l => l.depth));
            resolve([...lines].filter(([, l]) => l.depth === deepest).sort((a, b) => a[0] - b[0]).map(([, l]) => [l.move, l.value]));
          }
        };
        send('ucinewgame');
        send(`position fen ${fen}`);
        send(`go depth ${DEPTH}`);
      }),
    quit: () => send('quit'),
  };
};

/** The engine's lines for every position, from the kept file where it has them and from the engine where it has not. */
const linesFor = async (rows, log) => {
  mkdirSync(DIR, { recursive: true });
  const known = new Map();
  if (existsSync(LINES)) {
    for (const line of readFileSync(LINES, 'utf8').split('\n')) {
      const at = line.indexOf('=');
      if (at > 0) known.set(line.slice(0, at), line.slice(at + 1).split(',').map(part => [part.slice(0, part.indexOf(':')), Number(part.slice(part.indexOf(':') + 1))]));
    }
  }
  const missing = new Map();
  for (const r of rows) if (!known.has(r.key) && !missing.has(r.key)) missing.set(r.key, r.fen);
  if (missing.size) {
    const workers = Math.max(1, Math.min(cpus().length, 4));
    log(`engine: ${missing.size} positions to search to depth ${DEPTH} with ${MULTI_PV} lines, on ${workers} processes (${known.size} already kept)`);
    const todo = [...missing];
    let done = 0;
    const save = () => writeFileSync(LINES, [...known].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([key, lines]) => `${key}=${lines.map(([move, value]) => `${move}:${value}`).join(',')}`).join('\n') + '\n');
    await Promise.all(
      Array.from({ length: workers }, async () => {
        const e = engine();
        for (;;) {
          const next = todo.pop();
          if (!next) break;
          const [key, fen] = next;
          known.set(key, await e.search(fen));
          if (++done % 500 === 0) {
            save();
            log(`engine: ${done} of ${missing.size}`);
          }
        }
        e.quit();
      }),
    );
    save();
    log(`engine: wrote ${LINES} (${known.size} positions)`);
  }
  return known;
};

export const runEngine = async ctx => {
  const { sets, model, measure, round, log } = ctx;
  const all = Object.values(sets).flat();
  const known = await linesFor(all, log);
  if (process.argv.includes('--lines-only')) return;

  // ---------- what each decision knows of the engine, for every number of lines the page may show
  // The engine writes castling as the king's own move (e1g1); the page's list of moves has it as king to rook (e1h1).
  const CASTLING = { e1g1: 'e1h1', e1c1: 'e1a1', e8g8: 'e8h8', e8c8: 'e8a8' };
  const indexOf = (r, move) => {
    const j = r.ucis.indexOf(move);
    return j >= 0 || !CASTLING[move] ? j : r.ucis.indexOf(CASTLING[move]);
  };
  let unmatched = 0;
  for (const r of all) {
    r.p3 = model(r);
    r.logP3 = Float64Array.from(r.p3, p => Math.log(Math.max(1e-12, p)));
    r.engine = [];
    for (const [move, value] of known.get(r.key)) {
      const j = indexOf(r, move);
      if (j < 0) unmatched++;
      else r.engine.push({ j, w: chances(value) });
    }
  }
  if (unmatched) throw new Error(`${unmatched} engine moves are not among the legal moves of their positions: the kept lines do not belong to these positions`);
  /** For N lines: each move's loss against the first line (0 to 1), and whether it is listed. */
  const view = (r, n) => {
    const lines = r.engine.slice(0, n);
    const loss = new Float64Array(r.n);
    const unlisted = new Uint8Array(r.n).fill(1);
    if (!lines.length) return { loss, unlisted: new Uint8Array(r.n), none: true };
    const last = (lines[0].w - lines[lines.length - 1].w) / 2;
    loss.fill(last);
    for (const l of lines) {
      loss[l.j] = (lines[0].w - l.w) / 2;
      unlisted[l.j] = 0;
    }
    // with every legal move listed there is nothing left to be "not listed"
    return { loss, unlisted, none: false };
  };
  const estimate = (n, { alpha, beta, gamma }) => r => {
    const v = (r.views ??= {})[n] ?? (r.views[n] = view(r, n));
    if (v.none) return r.p3;
    const s = new Float64Array(r.n);
    let max = -Infinity;
    for (let j = 0; j < r.n; j++) {
      s[j] = alpha * r.logP3[j] - beta * v.loss[j] - gamma * v.unlisted[j];
      if (s[j] > max) max = s[j];
    }
    let total = 0;
    for (let j = 0; j < r.n; j++) total += s[j] = Math.exp(s[j] - max);
    for (let j = 0; j < r.n; j++) s[j] /= total;
    return s;
  };
  const lossOf = (data, f) => -data.reduce((sum, r) => sum + Math.log(Math.max(1e-12, f(r)[r.chosen])), 0) / data.length;

  // ---------- the three numbers, for each count of lines: one at a time over a grid, until nothing changes
  const GRID = {
    alpha: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2],
    beta: [0, 2, 4, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80],
    gamma: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5],
  };
  const fitted = {};
  for (let n = 1; n <= MULTI_PV; n++) {
    let c = { alpha: 1, beta: 0, gamma: 0 };
    for (let turn = 0; turn < 12; turn++) {
      const before = JSON.stringify(c);
      for (const name of ['beta', 'gamma', 'alpha']) {
        for (const value of GRID[name]) if (lossOf(sets.selection, estimate(n, { ...c, [name]: value })) < lossOf(sets.selection, estimate(n, c))) c = { ...c, [name]: value };
      }
      if (JSON.stringify(c) === before) break;
    }
    fitted[n] = { ...c, selectionLoss: round(lossOf(sets.selection, estimate(n, c)), 6) };
    log(`engine, ${n} line${n > 1 ? 's' : ''}: α ${c.alpha}, β ${c.beta}, γ ${c.gamma}; selection log loss ${fitted[n].selectionLoss.toFixed(4)} (third version ${lossOf(sets.selection, r => r.p3).toFixed(4)})`);
  }

  // ---------- measured on the games of 2026
  const brief = m => ({
    n: m.n,
    games: m.games,
    logLoss: round(m.logLoss),
    brier: round(m.brier),
    top1: round(m.top1),
    top3: round(m.top3),
    ece: round(m.ece),
    sure70: { n: m.sure70.n, said: round(m.sure70.said, 3), happened: round(m.sure70.happened, 3) },
    ...(m.difference ? { difference: Object.fromEntries(Object.entries(m.difference).map(([k, d]) => [k, { value: round(d.value), interval: d.interval ? d.interval.map(x => round(x)) : null }])) } : {}),
  });
  const third = r => r.p3;
  const results = {};
  for (const [name, data] of Object.entries(sets)) {
    results[name] = { decisions: data.length, v3: brief(measure(data, third)), byLines: {} };
    for (let n = 1; n <= MULTI_PV; n++) results[name].byLines[n] = brief(measure(data, estimate(n, fitted[n]), { against: third }));
    const m = results[name].byLines[3];
    log(`engine on ${name} (${data.length} decisions), three lines: log loss ${m.logLoss.toFixed(4)} against ${results[name].v3.logLoss.toFixed(4)}; first ${(100 * m.top1).toFixed(1)} % against ${(100 * results[name].v3.top1).toFixed(1)} %; three ${(100 * m.top3).toFixed(1)} % against ${(100 * results[name].v3.top3).toFixed(1)} %; calibration error ${(100 * m.ece).toFixed(1)} % against ${(100 * results[name].v3.ece).toFixed(1)} %`);
  }

  // ---------- what the two do with the engine's opinion, in plain counts (the games of 2026 that were not fitted on)
  const counted = [...sets.holdout, ...sets.benchmark];
  const playedRank = [0, 0, 0, 0, 0, 0];
  const lossBands = [0.02, 0.05, 0.1, 0.2, 1.01].map(upTo => ({ upTo, offered: 0, played: 0, third: 0, fourth: 0 }));
  const withThree = estimate(3, fitted[3]);
  for (const r of counted) {
    const rank = r.engine.findIndex(l => l.j === r.chosen);
    playedRank[rank < 0 ? 5 : rank]++;
    // every listed move of the five, by how much it gives up: how often it was played, and what each version said of it
    const p4 = withThree(r);
    for (const l of r.engine) {
      const band = lossBands.find(b => (r.engine[0].w - l.w) / 2 < b.upTo);
      band.offered++;
      if (l.j === r.chosen) band.played++;
      band.third += r.p3[l.j];
      band.fourth += p4[l.j];
    }
  }
  const adopted = results.holdout.byLines[3].difference.logLoss.interval[1] < 0 && results.holdout.byLines[3].ece <= results.holdout.v3.ece;
  log(`engine: the played move was the engine's first ${((100 * playedRank[0]) / counted.length).toFixed(1)} %, among its first three ${((100 * (playedRank[0] + playedRank[1] + playedRank[2])) / counted.length).toFixed(1)} %, not among its five ${((100 * playedRank[5]) / counted.length).toFixed(1)} % of ${counted.length} decisions`);
  log(`engine: rule (lower log loss on January to August 2026 with the interval below zero, calibration error not higher), three lines: ${adopted}`);

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        about: 'How much the two players avoid moves the engine thinks little of, on top of the third version. See scripts/predictor-v4-engine.mjs.',
        engine: { name: 'Stockfish 16', depth: DEPTH, lines: MULTI_PV, threads: 1, positions: known.size, kept: LINES },
        form: 'score(m) = alpha * log p3(m) - beta * loss(m) - gamma * [m is not among the N lines]; loss is the share of the expected result given up against the first line, 0 to 1; an unlisted move has the loss of the last line',
        grid: GRID,
        fitted,
        results,
        played: {
          decisions: counted.length,
          byEngineRank: { first: playedRank[0], second: playedRank[1], third: playedRank[2], fourth: playedRank[3], fifth: playedRank[4], notAmongFive: playedRank[5] },
          byLoss: lossBands.map(b => ({ lossBelow: b.upTo > 1 ? null : b.upTo, offered: b.offered, played: b.played, playedShare: round(b.played / Math.max(1, b.offered)), thirdVersionSaid: round(b.third / Math.max(1, b.offered)), fourthVersionSaid: round(b.fourth / Math.max(1, b.offered)) })),
        },
        adopted,
      },
      null,
      1,
    ) + '\n',
  );
  log(`wrote ${OUT}`);
};
