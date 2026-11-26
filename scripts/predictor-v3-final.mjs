// The measurement of the third version and the files that come out of it.
// Called by scripts/predictor-v3.mjs after the selection stage has been
// repeated and found identical to data/predictor-v3/selection.json. Nothing
// here chooses anything.
import { readFileSync, writeFileSync } from 'node:fs';

const MATCH = 'data/predictor-v3/match-2026.pgn';
/** The match began on this day; everything in the corpora is over by then. */
const MATCH_START = '2026-11-24';

export const writeV3 = async ctx => {
  const { round, K, FEATURES, BOARD, PLAYERS, MOVER, AS_OF, PRIOR_PLIES, CLOCK_FULL_SECONDS, STAKES_MAX, selection, models, measure, uniform, ownOf, history, sample, selectionCounts, yearsBetween, earlier, parseGame, positionKey, candidates, clockPressure, publishedV1, log, v3, prepare, theoryTable, ownTable, chosen, v3Selection } = ctx;
  const model = v3(chosen);
  const v2 = selection.families[selection.chosen];

  // ---------- the games of the match played so far: seen by no version
  const matchT = { name: 'FIDE World Chess Championship 2026', start: MATCH_START, end: '9999-12-31' };
  const matchGames = readFileSync(MATCH, 'utf8').split(/\n\n(?=\[Event )/).map(text => text.trim()).filter(text => text.startsWith('['));
  const matchRows = [];
  const matchMoves = new Map();
  matchGames.forEach((chunk, index) => {
    const game = parseGame(chunk, undefined, 0);
    const roundNo = Math.floor(Number((/^\[Round "(.*)"\]$/m.exec(chunk)?.[1] ?? '').split('.')[0])) || index + 1;
    const side = [PLAYERS[game.white.fideId], PLAYERS[game.black.fideId]];
    let fen = game.initialFen;
    game.plies.forEach((ply, i) => {
      const mover = side[i % 2];
      const key = positionKey(fen);
      const cands = candidates({ fen, lastMove: i > 0 ? game.plies[i - 1].uci : undefined, ownLastMove: i > 1 ? game.plies[i - 2].uci : undefined });
      const chosenMove = cands.findIndex(c => c.san === ply.san);
      if (chosenMove < 0) throw new Error(`a match move that is not legal: game ${roundNo}, ${ply.san}`);
      if (i < PRIOR_PLIES) (matchMoves.get(key) ?? matchMoves.set(key, []).get(key)).push({ uci: cands[chosenMove].uci, mover: MOVER[mover], t: matchT, round: roundNo });
      const n = cands.length;
      const x = new Float64Array(n * K);
      cands.forEach((c, j) => x.set(c.f, j * K));
      const r = { g: 100000 + roundNo, t: matchT, round: roundNo, set: 'match', mover: MOVER[mover], ply: i, key, n, x, ucis: cands.map(c => c.uci), chosen: chosenMove, pressure: clockPressure(i > 1 ? game.plies[i - 2].clk : undefined, CLOCK_FULL_SECONDS) };
      // what was played before, as for every other row: tournaments that were over before the match began
      const entries = (history.get(key) ?? []).filter(e => earlier(e.t, matchT));
      r.hj = Int32Array.from(entries, e => r.ucis.indexOf(e.uci));
      r.hage = Float64Array.from(entries, e => yearsBetween(e.t.end, matchT.start));
      r.hown = Uint8Array.from(entries, e => (e.mover === r.mover ? 1 : 0));
      r.known = r.hown.some(Boolean);
      matchRows.push(r);
      fen = ply.fen;
    });
  });
  for (const r of matchRows) prepare(r, matchMoves.get(r.key) ?? []);

  // ---------- the measurements
  const holdout = ownOf('holdout').map(r => prepare(r));
  const benchmark = ownOf('benchmark').map(r => prepare(r));
  const on = (rows, extra = {}) => ({
    v3: measure(rows, model, { against: models.v2 }),
    v2: measure(rows, models.v2),
    uniform: measure(rows, uniform, { expected: true }),
    gukesh: measure(rows.filter(r => r.mover === 1), model, { against: models.v2 }),
    sindarov: measure(rows.filter(r => r.mover === 2), model, { against: models.v2 }),
    opening: measure(rows.filter(r => r.ply < chosen.theoryPlies), model, { against: models.v2 }),
    later: measure(rows.filter(r => r.ply >= chosen.theoryPlies), model, { against: models.v2 }),
    ...extra,
  });
  const results = {
    holdout: on(holdout),
    benchmark: on(benchmark, { v1: measure(benchmark, publishedV1) }),
    match: on(matchRows),
  };
  const adopted = results.holdout.v3.difference.logLoss.interval[1] < 0 && results.holdout.v3.ece <= results.holdout.v2.ece;
  for (const [name, r] of Object.entries(results)) {
    log(`v3 on ${name} (${r.v3.n} decisions): log loss ${r.v3.logLoss.toFixed(4)} against ${r.v2.logLoss.toFixed(4)}; first ${(100 * r.v3.top1).toFixed(1)} % against ${(100 * r.v2.top1).toFixed(1)} %; three ${(100 * r.v3.top3).toFixed(1)} % against ${(100 * r.v2.top3).toFixed(1)} %; calibration error ${(100 * r.v3.ece).toFixed(1)} % against ${(100 * r.v2.ece).toFixed(1)} %`);
  }
  log(`v3 adoption rule (lower log loss on January to August 2026 with the interval below zero, calibration error not higher): ${adopted}`);

  // ---------- the model file
  const brief = m => ({
    n: m.n,
    games: m.games,
    logLoss: round(m.logLoss),
    brier: round(m.brier),
    top1: round(m.top1),
    top3: round(m.top3),
    ece: round(m.ece),
    sure70: { n: m.sure70.n, said: round(m.sure70.said, 3), happened: round(m.sure70.happened, 3) },
    intervals: Object.fromEntries(Object.entries(m.intervals).map(([k, v]) => [k, v ? v.map(x => round(x)) : null])),
    ...(m.difference ? { difference: Object.fromEntries(Object.entries(m.difference).map(([k, d]) => [k, { value: round(d.value), interval: d.interval ? d.interval.map(x => round(x)) : null }])) } : {}),
  });
  const theory = theoryTable(chosen);
  const own = ownTable(chosen);
  const theta = v2.theta;
  const weights = offset => theta.slice(offset, offset + K);
  const out = {
    version: 4,
    features: [...FEATURES],
    weights: { shared: weights(0), players: { gukesh: weights(K), sindarov: weights(2 * K) }, clock: weights(3 * K) },
    temperature: chosen.temperature,
    // how the estimate is put together; every number chosen on the selection games
    blend: { kappa: chosen.kappa, halfLifeYears: chosen.halfLife, epsilon: chosen.epsilon, nu: chosen.nu, theoryHalfLifeYears: chosen.theoryHalfLife, theoryPlies: chosen.theoryPlies, same: chosen.same, asOf: AS_OF },
    players: Object.fromEntries(Object.entries(PLAYERS).map(([id, key]) => [id, key])),
    priorColumns: { g: 'gukesh', s: 'sindarov' },
    // the two players' own earlier moves, and what players rated 2600 or more played: "key=move…;…", keys are the last eight characters of the position key
    priors: own.text,
    theory: theory.text,
    priorPlies: PRIOR_PLIES,
    stakesMax: STAKES_MAX,
    clockFullSeconds: CLOCK_FULL_SECONDS,
    report: {
      protocol: v3Selection.protocol,
      source: 'Lichess official broadcasts, January 2020 to October 2026',
      licence: 'CC BY-SA 4.0',
      selection: { selected: Object.values(selectionCounts).reduce((sum, c) => sum + c.selected, 0), eliteGames: v3Selection.data.eliteGames },
      tables: { ownPositions: own.positions, ownMoves: own.moves, theoryPositions: theory.positions, theoryMoves: theory.moves, asOf: AS_OF },
      shown: { ...brief(results.holdout.v3), blind: false },
      holdout: { v2: brief(results.holdout.v2), v3: brief(results.holdout.v3) },
      benchmark: { v1: brief(results.benchmark.v1), v2: brief(results.benchmark.v2), v3: brief(results.benchmark.v3) },
      match: { games: matchGames.length, v2: brief(results.match.v2), v3: brief(results.match.v3) },
      adopted,
    },
  };
  const artifact = JSON.stringify(out) + '\n';
  writeFileSync('src/data/predictor.json', artifact);
  log(`wrote src/data/predictor.json: ${(artifact.length / 1024).toFixed(0)} KB (own table ${own.positions} positions, theory ${theory.positions} positions)`);

  // ---------- the report
  const pct = x => `${(100 * x).toFixed(1)} %`;
  const f3 = x => x.toFixed(3);
  const span = (v, f) => (v ? `${f(v[0])} to ${f(v[1])}` : '');
  const head = '| | Decisions | Log loss | Brier | First choice right | In the first three | Calibration error | Said / played at 70 % and above |\n|---|---|---|---|---|---|---|---|';
  const row = (name, m) => `| ${name} | ${m.n} | ${f3(m.logLoss)} | ${f3(m.brier)} | ${pct(m.top1)} | ${pct(m.top3)} | ${pct(m.ece)} | ${m.sure70.n ? `${pct(m.sure70.said)} / ${pct(m.sure70.happened)} (${m.sure70.n})` : ''} |`;
  const diff = m => `| | Third minus second | 95 % interval |\n|---|---|---|\n| Log loss | ${m.difference.logLoss.value.toFixed(3)} | ${span(m.difference.logLoss.interval, f3)} |\n| First choice right | ${(100 * m.difference.top1.value).toFixed(1)} points | ${span(m.difference.top1.interval, x => (100 * x).toFixed(1))} |\n| In the first three | ${(100 * m.difference.top3.value).toFixed(1)} points | ${span(m.difference.top3.interval, x => (100 * x).toFixed(1))} |\n| Calibration error | ${(100 * m.difference.ece.value).toFixed(1)} points | ${span(m.difference.ece.interval, x => (100 * x).toFixed(1))} |`;
  const parts = r => `| Where | Decisions | Third version | Second version | Difference in log loss |\n|---|---|---|---|---|\n| First ${chosen.theoryPlies / 2} moves | ${r.opening.n} | ${f3(r.opening.logLoss)} | ${f3(r.opening.logLoss - r.opening.difference.logLoss.value)} | ${r.opening.difference.logLoss.value.toFixed(3)} (${span(r.opening.difference.logLoss.interval, f3)}) |\n| After that | ${r.later.n} | ${f3(r.later.logLoss)} | ${f3(r.later.logLoss - r.later.difference.logLoss.value)} | ${r.later.difference.logLoss.value.toFixed(3)} (${span(r.later.difference.logLoss.interval, f3)}) |\n| Gukesh | ${r.gukesh.n} | ${f3(r.gukesh.logLoss)} | ${f3(r.gukesh.logLoss - r.gukesh.difference.logLoss.value)} | ${r.gukesh.difference.logLoss.value.toFixed(3)} |\n| Sindarov | ${r.sindarov.n} | ${f3(r.sindarov.logLoss)} | ${f3(r.sindarov.logLoss - r.sindarov.difference.logLoss.value)} | ${r.sindarov.difference.logLoss.value.toFixed(3)} |`;
  const bins = m => m.bins.map((b, i) => (b.n ? `| ${i * 10} to ${i * 10 + 10} % | ${b.n} | ${pct(b.said)} | ${pct(b.happened)} |` : '')).filter(Boolean).join('\n');
  const S = v3Selection;
  const c = chosen;
  const report = `# Move predictor, third version: what was measured

Written by \`scripts/train-predictor.mjs --v3 --final\`. Do not edit by hand; run the script.

The plan was written down before any fitting: [PREDICTOR-V3-PROTOCOL.md](PREDICTOR-V3-PROTOCOL.md). The second version's report is [PREDICTOR-REPORT.md](PREDICTOR-REPORT.md). This is phase 1 of the plan: theory, the same tournament's earlier games, and the two players' faster games. The board model's weights are the second version's, untouched.

Source of every game: the Lichess broadcast database, CC BY-SA 4.0.

## What was added

| Source | Games | What it gives |
|---|---|---|
| Theory | ${S.data.eliteGames} classical games between players rated 2600 or more, without the two players' own | what strong players played in a position |
| The same tournament | earlier rounds of the tournament a game is in | in the match: its own games so far |
| Faster games | ${S.data.fasterGames} rapid and blitz games of the two players | more of their repertoire |

## What was chosen, on the selection games (2025, ${S.data.selection.decisions} decisions)

Each source on its own, with every setting searched again, against the second version's log loss of ${S.base.loss.toFixed(4)}:

| Added | Log loss | Settings found |
|---|---|---|
| Theory | ${S.alone.theory.loss.toFixed(4)} | ν ${S.alone.theory.nu}, theory half-life ${S.alone.theory.theoryHalfLife ?? 'none'} years |
| The same tournament | ${S.alone.same.loss.toFixed(4)} | weight ${S.alone.same.same} |
| Faster games | ${S.alone.faster.loss.toFixed(4)} | weight ${S.alone.faster.faster} |
| All three | ${S.all.loss.toFixed(4)} | |

Almost all of the gain is theory. Two things were then weighed against what they cost in the file:

- **Faster games are not adopted.** Without them the log loss is ${S.costs.withoutFaster.toFixed(4)} against ${S.all.loss.toFixed(4)} with them, and they would add ${S.data.fasterPositions} positions to the table.
- **Other players' moves in the two players' games are dropped.** Theory says the same thing from more games: without them ${S.costs.withoutOthers.toFixed(4)}.

**The theory table had to be cut.** Kept whole it has ${S.data.theoryPositions} positions and the file would be over 4 MB. The plan's rule (the largest minimum that costs under 0.002) fails: every cut costs more than that. The rule used instead: of the tables that keep the whole file under ${S.costs.budgetBytes / 1024} KB, the one with the lowest log loss on the selection games.

| Theory up to half-move | A position needs | Log loss | Positions | File |
|---|---|---|---|---|
${S.rules.map(x => `| ${x.theoryPlies} | ${x.minimum} game${x.minimum > 1 ? 's' : ''} | ${x.loss.toFixed(4)} | ${x.positions} | ${(x.fileBytes / 1024).toFixed(0)} KB${x.theoryPlies === c.theoryPlies && x.minimum === c.minTheory ? ' **chosen**' : ''} |`).join('\n')}

Chosen: theory for the first ${c.theoryPlies / 2} moves, from positions with at least ${c.minTheory} games; ν ${c.nu}; theory half-life ${c.theoryHalfLife ?? 'none'} years; the same tournament's games count ${c.same} times; κ ${c.kappa}; the player's own games halve every ${c.halfLife ?? '∞'} years; ε ${c.epsilon}; temperature ${c.temperature}. Selection log loss ${c.loss.toFixed(4)}; with the whole table it would be ${S.all.loss.toFixed(4)}.

${head}
${row('**Third version**', S.onSelection.v3)}
${row('Second version', S.onSelection.v2)}

These are the games the choices were made on.

## January to August 2026

${sample.holdout.games} games, ${results.holdout.v3.n} decisions. The second version was scored here once, and its result has been seen; no choice of the third version was made here.

${head}
${row('**Third version**', results.holdout.v3)}
${row('Second version', results.holdout.v2)}
${row('Every legal move equally likely (ties averaged)', results.holdout.uniform)}

On the same decisions and the same draws of whole games:

${diff(results.holdout.v3)}

${parts(results.holdout)}

The third version's first choice, by what it said:

| Said | Decisions | Average said | Played |
|---|---|---|---|
${bins(results.holdout.v3)}

## September 2026, the reused benchmark

The 963 decisions every version has been measured on. Not a blind measurement.

${head}
${row('**Third version**', results.benchmark.v3)}
${row('Second version', results.benchmark.v2)}
${row('Published first version', results.benchmark.v1)}

${diff(results.benchmark.v3)}

${parts(results.benchmark)}

## The 2026 match so far

${matchGames.length} games, ${results.match.v3.n} decisions, from the public broadcast (\`${MATCH}\`). No version has seen them and nothing was chosen on them. The third version also reads the match's own earlier games here, as it does on the page. With this few games the numbers say little; they are here because they are the only ones from the match itself, and the file grows by a game at a time.

${head}
${row('**Third version**', results.match.v3)}
${row('Second version', results.match.v2)}

${parts(results.match)}

## What can be said

The rule was written down beforehand: the third version replaces the second if its log loss is lower on January to August 2026 with the interval of the difference below zero, and its calibration error is not higher.

- Log loss: ${f3(results.holdout.v3.logLoss)} against ${f3(results.holdout.v2.logLoss)}, difference ${results.holdout.v3.difference.logLoss.value.toFixed(3)} (${span(results.holdout.v3.difference.logLoss.interval, f3)}).
- Calibration error: ${pct(results.holdout.v3.ece)} against ${pct(results.holdout.v2.ece)}.

**${adopted ? 'Both conditions are met.' : 'The conditions are not both met.'}** The gain is in the first ${c.theoryPlies / 2} moves, where theory speaks; after that the two versions are the same model. The probabilities are not claimed to be calibrated, and the label stays "Deneysel".

## Limits

- Theory is what was played by players rated 2600 or more in broadcast games since 2020, cut to positions that occurred at least ${c.minTheory} times in the first ${c.theoryPlies / 2} moves. A rare line, or a new one, is not in it.
- The match's own games are read on the page as they are played. In the measurements that part was chosen on earlier rounds of tournaments, where the opponent changes every round; in a match he does not.
- Nothing here knows the two camps' preparation, and nothing here measures the match-score rule. Those are phases 2 and 3 of the plan.
- The shipped tables count every game up to the end of October 2026, aged as of ${AS_OF}.
`;
  writeFileSync('docs/PREDICTOR-V3-REPORT.md', report);
  log('wrote docs/PREDICTOR-V3-REPORT.md');
};
