// The measurement of the third version and the files that come out of it.
// Called by scripts/predictor-v3.mjs after the selection stage has been
// repeated and found identical to data/predictor-v3/selection.json. Nothing
// here chooses anything.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const MATCH = 'data/predictor-v3/match-2026.pgn';
const SITUATION = 'data/predictor-v3/situation.json';
const TITLE = 'data/predictor-v3/title-matches.json';
/** The fourth version's study: what the engine's opinion of a move does to the estimate. */
const ENGINE = 'data/predictor-v4/engine.json';
/** The match is played over this many classical games. */
const MATCH_GAMES = 14;
/** The match began on this day; everything in the corpora is over by then. */
const MATCH_START = '2026-11-24';

export const writeV3 = async ctx => {
  const { round, K, FEATURES, BOARD, PLAYERS, MOVER, AS_OF, PRIOR_PLIES, CLOCK_FULL_SECONDS, STAKES_MAX, selection, models, measure, uniform, ownOf, history, sample, selectionCounts, yearsBetween, earlier, parseGame, positionKey, candidates, clockPressure, publishedV1, log, v3, prepare, theoryTable, ownTable, chosen, v3Selection } = ctx;
  const model = v3(chosen);
  const v2 = selection.families[selection.chosen];

  // ---------- the two studies: what the score does to a move, and whether a title match changes the opening
  const situation = JSON.parse(readFileSync(SITUATION, 'utf8'));
  const title = JSON.parse(readFileSync(TITLE, 'utf8'));
  if (JSON.stringify(situation.features) !== JSON.stringify([...FEATURES])) throw new Error(`${SITUATION} was made with other features: run --v3-situation again`);
  if (situation.temperature !== chosen.temperature || title.settings.temperature !== chosen.temperature) throw new Error('the studies were made with another selection: run --v3-situation and --v3-title again');
  // the fourth version's study, when it has been made: the engine's lines on top of this estimate
  const engine = existsSync(ENGINE) ? JSON.parse(readFileSync(ENGINE, 'utf8')) : undefined;
  // the learned correction where the rule adopted it; otherwise the written rule, in the same form
  const shift = situation.adopted ? situation.weights : FEATURES.map(name => (name === 'trade' ? -STAKES_MAX : 0));

  // ---------- the games of the match played so far: seen by no version
  const matchT = { name: 'FIDE World Chess Championship 2026', start: MATCH_START, end: '9999-12-31' };
  const roundOf = (chunk, index) => Math.floor(Number((/^\[Round "(.*)"\]$/m.exec(chunk)?.[1] ?? '').split('.')[0])) || index + 1;
  const matchGames = readFileSync(MATCH, 'utf8')
    .split(/\n\n(?=\[Event )/)
    .map(text => text.trim())
    .filter(text => text.startsWith('['))
    .map((chunk, index) => ({ chunk, roundNo: roundOf(chunk, index) }))
    .sort((a, b) => a.roundNo - b.roundNo);
  const matchRows = [];
  const matchMoves = new Map();
  const points = Object.fromEntries(Object.values(PLAYERS).map(key => [key, 0]));
  matchGames.forEach(({ chunk, roundNo }) => {
    const game = parseGame(chunk, undefined, 0);
    const side = [PLAYERS[game.white.fideId], PLAYERS[game.black.fideId]];
    // the score before this game, as the page has it: points behind for each game still to play, this one counted
    const left = MATCH_GAMES - (roundNo - 1);
    const urgencyOf = mover => (left > 0 ? Math.max(-1, Math.min(1, (points[side[1 - side.indexOf(mover)]] - points[mover]) / left)) : 0);
    const urgency = { [side[0]]: urgencyOf(side[0]), [side[1]]: urgencyOf(side[1]) };
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
      const r = { g: 100000 + roundNo, t: matchT, round: roundNo, set: 'match', mover: MOVER[mover], ply: i, key, n, x, ucis: cands.map(c => c.uci), chosen: chosenMove, pressure: clockPressure(i > 1 ? game.plies[i - 2].clk : undefined, CLOCK_FULL_SECONDS), urgency: urgency[mover] };
      // what was played before, as for every other row: tournaments that were over before the match began
      const entries = (history.get(key) ?? []).filter(e => earlier(e.t, matchT));
      r.hj = Int32Array.from(entries, e => r.ucis.indexOf(e.uci));
      r.hage = Float64Array.from(entries, e => yearsBetween(e.t.end, matchT.start));
      r.hown = Uint8Array.from(entries, e => (e.mover === r.mover ? 1 : 0));
      r.known = r.hown.some(Boolean);
      matchRows.push(r);
      fen = ply.fen;
    });
    const result = /^\[Result "(.*)"\]$/m.exec(chunk)?.[1];
    if (result === '1-0') points[side[0]] += 1;
    else if (result === '0-1') points[side[1]] += 1;
    else if (result === '1/2-1/2') for (const key of side) points[key] += 0.5;
    else throw new Error(`game ${roundNo} of the match snapshot is not finished`);
  });
  for (const r of matchRows) {
    prepare(r, matchMoves.get(r.key) ?? []);
    // the score of the match, as on the page: added to the scores before the temperature divides them
    if (r.urgency !== 0) {
      for (let j = 0; j < r.n; j++) {
        let add = 0;
        for (let k = 0; k < K; k++) add += shift[k] * r.x[j * K + k];
        r.s[j] += chosen.temperature * r.urgency * add;
      }
    }
  }
  const pressed = matchRows.filter(r => r.urgency !== 0).length;

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
    version: engine?.adopted ? 5 : 4,
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
    // what the score of the match adds to a move's score for a player who must win the last game, a weight for each feature
    situation: shift,
    clockFullSeconds: CLOCK_FULL_SECONDS,
    // what the engine's opinion of a move does to the estimate, for each number of engine lines at hand (the fourth version)
    ...(engine?.adopted ? { engine: Object.fromEntries(Object.entries(engine.fitted).map(([lines, w]) => [lines, { alpha: w.alpha, beta: w.beta, gamma: w.gamma }])) } : {}),
    report: {
      protocol: v3Selection.protocol,
      source: 'Lichess official broadcasts, January 2020 to October 2026',
      licence: 'CC BY-SA 4.0',
      selection: { selected: Object.values(selectionCounts).reduce((sum, c) => sum + c.selected, 0), eliteGames: v3Selection.data.eliteGames },
      tables: { ownPositions: own.positions, ownMoves: own.moves, theoryPositions: theory.positions, theoryMoves: theory.moves, asOf: AS_OF },
      shown: { ...brief(results.holdout.v3), blind: false },
      holdout: { v2: brief(results.holdout.v2), v3: brief(results.holdout.v3) },
      benchmark: { v1: brief(results.benchmark.v1), v2: brief(results.benchmark.v2), v3: brief(results.benchmark.v3) },
      match: { games: matchGames.length, decisionsWithTheScoreUneven: pressed, v2: brief(results.match.v2), v3: brief(results.match.v3) },
      situation: { adopted: situation.adopted, secondGames: Object.values(situation.events).reduce((sum, e) => sum + e.firstDecisive, 0), fitDecisions: situation.fit.decisions, testDecisions: situation.test.decisions, logLoss: { none: situation.on2025.withoutCorrection.logLoss, written: situation.on2025.writtenRule.logLoss, learned: situation.on2025.learned.logLoss }, difference: situation.on2025.learned.difference.logLoss },
      titleMatches: { adopted: title.adopted, multiplier: title.multiplier, matches: title.perMatch.length, decisions: title.titleMatches.decisions, known: title.titleMatches.known, repeated: title.titleMatches.repeated, otherEvents: { decisions: title.otherEvents.decisions, known: title.otherEvents.known, repeated: title.otherEvents.repeated } },
      adopted,
      ...(engine
        ? {
            engine: {
              adopted: engine.adopted,
              name: engine.engine.name,
              depth: engine.engine.depth,
              positions: engine.engine.positions,
              holdout: { decisions: engine.results.holdout.decisions, v3: engine.results.holdout.v3, withThreeLines: engine.results.holdout.byLines[3], withOneLine: engine.results.holdout.byLines[1], withFiveLines: engine.results.holdout.byLines[5] },
              benchmark: { decisions: engine.results.benchmark.decisions, v3: engine.results.benchmark.v3, withThreeLines: engine.results.benchmark.byLines[3] },
              played: engine.played.byEngineRank,
            },
          }
        : {}),
    },
  };
  const artifact = JSON.stringify(out) + '\n';
  writeFileSync('src/data/predictor.json', artifact);
  log(`wrote src/data/predictor.json: ${(artifact.length / 1024).toFixed(0)} KB (own table ${own.positions} positions, theory ${theory.positions} positions)`);

  // ---------- the report
  const pct = x => `${(100 * x).toFixed(1)} %`;
  const f3 = x => x.toFixed(3);
  const signed = (x, d = 4) => `${x > 0 ? '+' : ''}${x.toFixed(d)}`;
  const less = title.perMatch.filter(m => m.repeated < m.control.repeated).length;
  const titlePlayers = new Set(title.perMatch.flatMap(m => m.players)).size;
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

The plan was written down before any fitting: [PREDICTOR-V3-PROTOCOL.md](PREDICTOR-V3-PROTOCOL.md). The second version's report is [PREDICTOR-REPORT.md](PREDICTOR-REPORT.md). Phase 1 of the plan is theory, the same tournament's earlier games, and the two players' faster games; the board model's weights are the second version's, untouched. Phases 2 and 3, the score of the match and the title match itself, are further down.

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

## The score, learned from knockout matches

In a FIDE World Cup the second classical game of a two-game match is played by one who must win, having lost the first, and one for whom a draw is enough. The World Cups of 2021, 2023 and 2025, open and women, have ${Object.values(situation.events).reduce((sum, e) => sum + e.firstDecisive, 0)} such second games. A correction to the board model's weights was fitted for that situation: added for the player who must win, taken off for the other. Entering with opposite signs for the two sides of the same game, it cannot pick up what merely distinguishes those players from the two finalists.

Fitted on 2021 and 2023 (${situation.fit.decisions} decisions; penalty ${situation.penalty}, chosen there by leaving one event out at a time), measured on 2025 (${situation.test.decisions} decisions, ${situation.on2025.learned.games} games):

| On the World Cups of 2025 | Log loss | Against no correction |
|---|---|---|
| No correction | ${situation.on2025.withoutCorrection.logLoss.toFixed(4)} | |
| The written rule of the first two versions (0.35 off an even trade) | ${situation.on2025.writtenRule.logLoss.toFixed(4)} | ${signed(situation.on2025.writtenRule.difference.logLoss.value)} (${situation.on2025.writtenRule.difference.logLoss.interval.map(x => signed(x)).join(' to ')}) |
| Learned | ${situation.on2025.learned.logLoss.toFixed(4)} | ${signed(situation.on2025.learned.difference.logLoss.value)} (${situation.on2025.learned.difference.logLoss.interval.map(x => signed(x)).join(' to ')}) |

Learned against the written rule: ${signed(situation.on2025.learnedMinusWritten.logLoss.value)} (${situation.on2025.learnedMinusWritten.logLoss.interval.map(x => signed(x)).join(' to ')}). The rule set beforehand was that the learned correction replaces the written one only if it lowers log loss on the 2025 games with the interval below zero. **${situation.adopted ? 'It does, and it replaces the written rule.' : 'It does not, and the written rule stays.'}** The written rule did nothing that can be measured.

The effect is real and very small. Its largest weights, for the player who must win: ${[...situation.features.keys()].sort((a, b) => Math.abs(situation.weights[b]) - Math.abs(situation.weights[a])).slice(0, 6).map(k => `${situation.features[k]} ${signed(situation.weights[k], 3)}`).join(', ')}. So he takes a little less, and moves a piece again or straight back a little less; the player a draw is enough for does the opposite. At its strongest, in a last game that must be won, a capture becomes about ${Math.round(100 * (1 - Math.exp(situation.weights[situation.features.indexOf('capture')])))} % less likely than the board alone would have it. The first choice is the same move as before in almost every position (first choice right ${pct(situation.on2025.learned.top1)} against ${pct(situation.on2025.withoutCorrection.top1)}).

On the page it is scaled by urgency: the points the mover is behind, for each game still to be played. That a fourteen-game match scales like that is an assumption; nothing here measures it. With the score level it does nothing, and a point behind with twelve games to go it is a twelfth of the above. ${pressed ? `In the match so far ${pressed} decisions were made with the score uneven.` : 'In the match so far the score has been level before every game, so it has done nothing yet.'}

## Does a title match change the opening?

Of the title matches in the archives, ${title.perMatch.length} have earlier games of their players: ${title.titleMatches.games} games, ${title.titleMatches.decisions} decisions in the first fifteen moves. Beside them, the same players' other classical events of the twelve months before each match: ${title.otherEvents.games} games, ${title.otherEvents.decisions} decisions. ${title.matchesInTheArchives.filter(m => !m.measured).map(m => `One more, the ${m.match}, is in the first month of the archives and has nothing before it.`).join(' ')} The estimate is the third version's, from what could be known at the time, with the shared board model (the two finalists' own corrections are theirs alone).

| In the first fifteen moves | Title matches | Other events |
|---|---|---|
| The player has had the position before, in an earlier event | ${pct(title.titleMatches.known)} | ${pct(title.otherEvents.known)} |
| and then plays the move he played there most | ${pct(title.titleMatches.repeated)} | ${pct(title.otherEvents.repeated)} |
| His game leaves his own earlier games at move | ${title.titleMatches.leavesOwnGamesAtMove.toFixed(1)} | ${title.otherEvents.leavesOwnGamesAtMove.toFixed(1)} |
| He has had the position in an earlier game of the same event | ${pct(title.titleMatches.sameKnown)} | ${pct(title.otherEvents.sameKnown)} |
| and then plays a move he played there | ${pct(title.titleMatches.sameRepeated)} | ${pct(title.otherEvents.sameRepeated)} |
| Theory has the position | ${pct(title.titleMatches.inTheory)} | ${pct(title.otherEvents.inTheory)} |
| and he plays its most played move | ${pct(title.titleMatches.theoryMostPlayed)} | ${pct(title.otherEvents.theoryMostPlayed)} |
| Log loss of the estimate | ${f3(title.titleMatches.logLoss)} | ${f3(title.otherEvents.logLoss)} |

Match by match, with the players' other events of the year before in brackets:

| Match | Decisions | Had the position before | Then repeats his most played move | Best weight of the base, as a multiple | Chosen without this match |
|---|---|---|---|---|---|
${title.perMatch.map(m => `| ${m.players.join(' and ')}, ${m.month} | ${m.decisions} (${m.control.decisions}) | ${pct(m.known)} (${pct(m.control.known)}) | ${pct(m.repeated)} (${pct(m.control.repeated)}) | ${m.best} (${m.control.best}) | ${m.chosenOnTheOthers} |`).join('\n')}

**The weight of the base against the player's own games.** If a title match made players leave their own lines, the base would deserve more weight in a match than in a tournament. Over all title matches the best multiple is ${title.titleMatches.best}; over the same players' other events it is ${title.otherEvents.best}. Leaving each match out in turn gives ${title.perMatch.map(m => m.chosenOnTheOthers).join(', ')}. The rule set beforehand asked for every one of those to be on the same side of what the tournaments ask for. **${title.adopted ? `They are, and κ is multiplied by ${title.multiplier} in the match.` : 'They are not, so nothing is changed.'}** In ${less} of the ${title.perMatch.length} matches the players repeated themselves less than in their tournaments of the year before, in ${title.perMatch.length - less} more; ${title.perMatch.length} matches cannot tell a habit of title matches from the habits of ${titlePlayers} players.

**The match's own earlier games.** Not in the plan; looked at because the table shows it. In a title match a player is back in a position of an earlier game of the same match about twice as often as he meets one again within a tournament, and he then repeats his move more often. The weight of those games on the page (${c.same}, chosen on the two finalists' tournaments) is only ever used for the match, so the question put to it was direct: is another weight better in title matches? Over all of them the best multiple of it is ${title.same.bestInTitleMatches}, and leaving each match out in turn gives ${title.same.leftOutChoices.join(', ')}. In the same players' other events the best is ${title.same.bestInOtherEvents}: log loss in title matches ${title.same.logLoss.withThePagesWeight.toFixed(4)} with the page's weight, ${title.same.logLoss.withTheOtherEventsBest.toFixed(4)} with that (${signed(title.same.logLoss.pagesWeightMinusOtherEventsBest.value)}, ${title.same.logLoss.pagesWeightMinusOtherEventsBest.interval.map(x => signed(x)).join(' to ')}). **${title.same.adopted ? `Changed: those games count ${title.same.multiplier} times as much.` : 'The weight on the page is the one title matches ask for; nothing is changed.'}**

What this cannot see is what a player has prepared and not yet shown. A new line is new to the tables as well, and the estimate for it comes from theory and the board.

${
  engine
    ? `## The engine's opinion of a move (fourth version)

Asked for by Özgür after the third version went on the page: it gave a share to moves that lose on the spot, because it knows what was played before and what a move looks like, and nothing of how good a move is. Players of this strength rarely play such a move. The plan of the third version said "no engine"; this section changes that, and says so.

What is added is what the page already has when it shows the estimate: the engine's best lines for the position. For every legal move,

\`score(m) = α · log p3(m) − β · loss(m) − γ · [m is not among the engine's lines]\`

and the scores become shares that add up to one. p3 is the third version's estimate. loss(m) is the part of the expected result the move gives up against the engine's first line (0 to 1, on the page's win-chance curve). A move the engine does not list is at least as bad as its last line, so it takes that line's loss, and γ on top. α, β and γ were fitted by maximum likelihood on the selection games (2025), once for each number of lines the page may have (1 to 5).

The engine for the fit: ${engine.engine.name}, every position searched to depth ${engine.engine.depth} with ${engine.engine.lines} lines, ${engine.engine.positions} positions. Its answers are kept in \`${engine.engine.kept}\`, so the fit can be repeated without the engine.

| Lines | α | β | γ | Selection log loss |
|---|---|---|---|---|
${Object.entries(engine.fitted).map(([n, w]) => `| ${n} | ${w.alpha} | ${w.beta} | ${w.gamma} | ${w.selectionLoss.toFixed(4)} |`).join('\n')}

Third version on the same selection games: ${engine.results.selection.v3.logLoss.toFixed(4)}.

Measured on the games of 2026, which the fit did not use:

| | Decisions | Log loss | First choice right | In the first three | Calibration error |
|---|---|---|---|---|---|
${['holdout', 'benchmark'].map(name => { const r = engine.results[name]; const label = name === 'holdout' ? 'January to August 2026' : 'September 2026'; return [`| ${label}, third version | ${r.decisions} | ${f3(r.v3.logLoss)} | ${pct(r.v3.top1)} | ${pct(r.v3.top3)} | ${pct(r.v3.ece)} |`, ...[1, 3, 5].map(n => `| ${label}, with ${n} engine line${n > 1 ? 's' : ''} | ${r.decisions} | ${f3(r.byLines[n].logLoss)} | ${pct(r.byLines[n].top1)} | ${pct(r.byLines[n].top3)} | ${pct(r.byLines[n].ece)} |`)].join('\n'); }).join('\n')}

With three lines on January to August 2026: log loss ${signed(engine.results.holdout.byLines[3].difference.logLoss.value, 3)} (${engine.results.holdout.byLines[3].difference.logLoss.interval.map(x => signed(x, 3)).join(' to ')}), first choice right ${signed(100 * engine.results.holdout.byLines[3].difference.top1.value, 1)} points (${engine.results.holdout.byLines[3].difference.top1.interval.map(x => signed(100 * x, 1)).join(' to ')}).

What the two did with the engine's opinion, in the ${engine.played.decisions} decisions of 2026: the move played was the engine's first ${pct(engine.played.byEngineRank.first / engine.played.decisions)} of the time, among its first three ${pct((engine.played.byEngineRank.first + engine.played.byEngineRank.second + engine.played.byEngineRank.third) / engine.played.decisions)}, and not among its five ${pct(engine.played.byEngineRank.notAmongFive / engine.played.decisions)}.

Every move among the engine's five lines, by how much of the expected result it gives up, how often it was played, and what each version said of it on average (three lines at hand):

| Gives up | Moves offered | Played | Third version said | With the engine |
|---|---|---|---|---|
${engine.played.byLoss.map((b, i) => `| ${b.lossBelow === null ? `${(100 * engine.played.byLoss[i - 1].lossBelow).toFixed(0)} % or more` : `under ${(100 * b.lossBelow).toFixed(0)} %`} | ${b.offered} | ${pct(b.playedShare)} | ${pct(b.thirdVersionSaid)} | ${pct(b.fourthVersionSaid)} |`).join('\n')}

The rule is the one used before: lower log loss on January to August 2026 with the interval of the difference below zero, and a calibration error that is not higher. **${engine.adopted ? 'Both are met, and the estimate on the page uses the engine\'s lines.' : 'They are not both met.'}**

Limits of this part:

- The page's engine is not the fit's engine at depth ${engine.engine.depth}: the cloud's answers are much deeper, the browser's own start shallower and deepen. The weights are applied to whatever depth is at hand.
- The estimate now leans on the engine. Where the engine is switched off, or has no answer after a few seconds, the page shows the third version's estimate as it is.
- It says what these two tend to do with good and bad moves on average. It does not know that a player is in time trouble and about to blunder; the clock enters only through the third version.

`
    : ''
}## What can be said

The rule was written down beforehand: the third version replaces the second if its log loss is lower on January to August 2026 with the interval of the difference below zero, and its calibration error is not higher.

- Log loss: ${f3(results.holdout.v3.logLoss)} against ${f3(results.holdout.v2.logLoss)}, difference ${results.holdout.v3.difference.logLoss.value.toFixed(3)} (${span(results.holdout.v3.difference.logLoss.interval, f3)}).
- Calibration error: ${pct(results.holdout.v3.ece)} against ${pct(results.holdout.v2.ece)}.

**${adopted ? 'Both conditions are met.' : 'The conditions are not both met.'}** The gain is in the first ${c.theoryPlies / 2} moves, where theory speaks; after that the two versions are the same model. The probabilities are not claimed to be calibrated. The plan kept the "Deneysel" label on the page; it was taken off on 26 November 2026 at Özgür's request, which changes nothing that was measured here.

## Limits

- Theory is what was played by players rated 2600 or more in broadcast games since 2020, cut to positions that occurred at least ${c.minTheory} times in the first ${c.theoryPlies / 2} moves. A rare line, or a new one, is not in it.
- The match's own games are read on the page as they are played. In the measurements that part was chosen on earlier rounds of tournaments, where the opponent changes every round; in a match he does not.
- Nothing here knows the two camps' preparation.
- The score correction comes from two-game knockout matches of other players. That it carries over to a fourteen-game title match, scaled by urgency, is an assumption.
- The title-match study has ${title.perMatch.length} matches and ${titlePlayers} players, none of them Sindarov.
- The shipped tables count every game up to the end of October 2026, aged as of ${AS_OF}.
`;
  writeFileSync('docs/PREDICTOR-V3-REPORT.md', report);
  log('wrote docs/PREDICTOR-V3-REPORT.md');
};
