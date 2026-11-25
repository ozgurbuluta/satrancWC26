// The final measurement of the move predictor's second version, and the files
// that come out of it. Called by scripts/train-predictor.mjs --final, after
// the selection stage has been repeated and found identical to the committed
// data/predictor-v2/selection.json. Nothing here chooses anything.
//
// Written before any holdout result existed: every table of the report is
// laid out here, and the numbers go in as they come.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const writeFinal = async ctx => {
  const { publishedV1, v1, round, FEATURES, K, PLAYERS, AS_OF, PRIOR_PLIES, CLOCK_FULL_SECONDS, STAKES_MAX, CLASSICAL_SECONDS, selection, models, measure, uniform, ownOf, tournaments, history, sample, selectionCounts, yearsBetween, log } = ctx;
  const chosen = selection.chosen;
  const other = chosen === 'B' ? 'A' : 'B';
  const A = selection.families.A;
  const B = selection.families.B;

  // ---------- the untouched holdout: blind for every model measured on it
  const holdout = ownOf('holdout');
  const onHoldout = {
    v2: measure(holdout, models.v2, { against: models[other] }),
    [other]: measure(holdout, models[other]),
    base: measure(holdout, models.base),
    uniform: measure(holdout, uniform, { expected: true }),
    gukesh: measure(holdout.filter(r => r.mover === 1), models.v2),
    sindarov: measure(holdout.filter(r => r.mover === 2), models.v2),
    known: measure(holdout.filter(r => r.known), models.v2),
    unknown: measure(holdout.filter(r => !r.known), models.v2),
  };
  // ---------- the reused benchmark: the same 963 decisions the first version was measured on
  const benchmark = ownOf('benchmark');
  const onBenchmark = {
    v1: measure(benchmark, publishedV1),
    v2: measure(benchmark, models.v2, { against: publishedV1 }),
    [other]: measure(benchmark, models[other], { against: publishedV1 }),
    base: measure(benchmark, models.base),
    uniform: measure(benchmark, uniform, { expected: true }),
    gukesh: measure(benchmark.filter(r => r.mover === 1), models.v2),
    sindarov: measure(benchmark.filter(r => r.mover === 2), models.v2),
    known: measure(benchmark.filter(r => r.known), models.v2),
    unknown: measure(benchmark.filter(r => !r.known), models.v2),
  };

  // ---------- what may be said, by the rule written down beforehand
  const gap = m => Math.abs(m.sure70.said - m.sure70.happened);
  const claims = {
    benchmarkLogLossLower: onBenchmark.v2.difference.logLoss.interval[1] < 0,
    benchmarkCalibrationErrorLower: onBenchmark.v2.ece < onBenchmark.v1.ece,
    benchmarkGapAt70Smaller: onBenchmark.v2.sure70.n === 0 || gap(onBenchmark.v2) < gap(onBenchmark.v1),
    holdoutLogLossNotWorseThanOther: onHoldout.v2.logLoss <= onHoldout[other].logLoss,
    holdoutCalibrationErrorNotWorseThanOther: onHoldout.v2.ece <= onHoldout[other].ece,
  };
  claims.moreReliableThanV1 = Object.values(claims).every(Boolean);
  log(`holdout, v2: log loss ${onHoldout.v2.logLoss.toFixed(4)}, first ${(100 * onHoldout.v2.top1).toFixed(1)} %, three ${(100 * onHoldout.v2.top3).toFixed(1)} %, calibration error ${(100 * onHoldout.v2.ece).toFixed(1)} %`);
  log(`benchmark, published v1: log loss ${onBenchmark.v1.logLoss.toFixed(4)}; v2: ${onBenchmark.v2.logLoss.toFixed(4)}; claims ${JSON.stringify(claims)}`);

  // ---------- the tables that ship: every selected game, aged as of AS_OF
  const ageing = t => (B.halfLife === null ? 1 : 0.5 ** (yearsBetween(t.end, AS_OF) / B.halfLife));
  const priors = {};
  let entries = 0;
  for (const key of [...history.keys()].sort()) {
    const moves = new Map();
    for (const e of history.get(key)) {
      if (!(e.t.end < AS_OF)) throw new Error(`a tournament that is not over by ${AS_OF}: ${e.t.name}`);
      const m = moves.get(e.uci) ?? moves.set(e.uci, [0, 0, 0]).get(e.uci);
      // by who played it: Gukesh, Sindarov, anyone else. Family A counts whole games, family B ages them.
      m[e.mover === 1 ? 0 : e.mover === 2 ? 1 : 2] += chosen === 'B' ? ageing(e.t) : 1;
    }
    const kept = [...moves.entries()]
      .map(([uci, m]) => [uci, ...m.map(x => round(x, 3))])
      // a move only others played is of no use when others count for nothing
      .filter(([, g, s, o]) => g > 0 || s > 0 || ((chosen === 'A' || B.others > 0) && o > 0))
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    if (!kept.length) continue;
    entries += kept.length;
    priors[key] = kept.map(([uci, g, s, o]) => (chosen === 'A' || B.others > 0 ? `${uci} ${g} ${s} ${o}` : `${uci} ${g} ${s}`)).join('|');
  }

  // ---------- the files
  const theta = chosen === 'B' ? B.theta : A.theta;
  const weights = offset => theta.slice(offset, offset + K);
  const brief = m => ({
    n: m.n,
    games: m.games,
    logLoss: round(m.logLoss),
    brier: round(m.brier),
    top1: round(m.top1),
    top3: round(m.top3),
    ece: round(m.ece),
    shownEce: round(m.shownEce),
    sure70: { n: m.sure70.n, said: round(m.sure70.said, 3), happened: round(m.sure70.happened, 3) },
    sure90: { n: m.sure90.n, said: round(m.sure90.said, 3), happened: round(m.sure90.happened, 3) },
    intervals: Object.fromEntries(Object.entries(m.intervals).map(([k, v]) => [k, v ? v.map(x => round(x)) : null])),
    ...(m.difference ? { difference: Object.fromEntries(Object.entries(m.difference).map(([k, d]) => [k, { value: round(d.value), interval: d.interval ? d.interval.map(x => round(x)) : null }])) } : {}),
  });
  const out = {
    version: 3,
    family: chosen,
    features: [...FEATURES],
    weights: { shared: weights(0), players: { gukesh: weights(K), sindarov: weights(2 * K) }, clock: weights(3 * K) },
    temperature: chosen === 'B' ? B.temperature : A.temperature,
    // how counts of earlier moves are blended with the base model (family B only)
    blend: chosen === 'B' ? { kappa: B.kappa, others: B.others, halfLifeYears: B.halfLife, epsilon: B.epsilon, asOf: AS_OF } : null,
    players: Object.fromEntries(Object.entries(PLAYERS).map(([id, key]) => [id, key])),
    // position key, then "uci count count …" for each move, joined by "|": how often each column's player played it there, aged for family B
    priorColumns: chosen === 'A' || B.others > 0 ? ['gukesh', 'sindarov', 'others'] : ['gukesh', 'sindarov'],
    priors,
    priorPlies: PRIOR_PLIES,
    stakesMax: STAKES_MAX,
    clockFullSeconds: CLOCK_FULL_SECONDS,
    report: {
      protocol: selection.protocol,
      source: 'Lichess official broadcasts, January 2023 to October 2026',
      licence: 'CC BY-SA 4.0',
      corpora: selectionCounts,
      selection: { rule: `standard chess from the initial position; the larger of the first two clock readings at least ${CLASSICAL_SECONDS / 60} minutes`, selected: Object.values(selectionCounts).reduce((sum, c) => sum + c.selected, 0), of: Object.values(selectionCounts).reduce((sum, c) => sum + c.games, 0), tournaments: tournaments.length },
      split: sample,
      chosen: { family: chosen, onSelection: { [chosen]: round(selection.families[chosen].loss), [other]: round(selection.families[other].loss) } },
      // what the panel quotes: the second version on the untouched holdout, a blind measurement
      shown: { ...brief(onHoldout.v2), whenSure: brief(onHoldout.v2).sure70, blind: true },
      benchmark: { blind: false, v1: brief(onBenchmark.v1), v2: brief(onBenchmark.v2) },
      claims,
    },
  };
  const artifact = JSON.stringify(out) + '\n';
  writeFileSync('src/data/predictor.json', artifact);
  log(`wrote src/data/predictor.json: ${(artifact.length / 1024).toFixed(0)} KB, ${Object.keys(priors).length} positions, ${entries} moves in the tables`);

  // ---------- the report, to read
  const pct = x => `${(100 * x).toFixed(1)} %`;
  const f3 = x => x.toFixed(3);
  const span = (v, f) => (v ? `${f(v[0])} to ${f(v[1])}` : '');
  const esc = text => text.replaceAll('|', '\\|');
  const NAMES = { v1: 'Published first version', v2: '**Second version**', A: 'Family A: the first version\'s recipe fitted again', B: 'Family B: back-off', base: 'Base model alone (no earlier moves)', uniform: 'Every legal move equally likely (ties averaged)' };
  const nameOf = k => (k === chosen ? NAMES.v2 : NAMES[k]);
  const row = (name, m) => `| ${name} | ${m.n} | ${f3(m.logLoss)} | ${f3(m.brier)} | ${pct(m.top1)} | ${pct(m.top3)} | ${pct(m.ece)} |`;
  const head = '| | Decisions | Log loss | Brier | First choice right | In the first three | Calibration error |\n|---|---|---|---|---|---|---|';
  const intervalRows = m => `| | 95 % interval |\n|---|---|\n| Log loss | ${span(m.intervals.logLoss, f3)} |\n| Brier | ${span(m.intervals.brier, f3)} |\n| First choice right | ${span(m.intervals.top1, pct)} |\n| In the first three | ${span(m.intervals.top3, pct)} |\n| Calibration error | ${span(m.intervals.ece, pct)} |`;
  const diffRows = (m, minus) => `| ${minus} | Difference | 95 % interval |\n|---|---|---|\n| Log loss | ${m.difference.logLoss.value.toFixed(3)} | ${span(m.difference.logLoss.interval, f3)} |\n| Brier | ${m.difference.brier.value.toFixed(3)} | ${span(m.difference.brier.interval, f3)} |\n| First choice right | ${pct(m.difference.top1.value)} | ${span(m.difference.top1.interval, pct)} |\n| In the first three | ${pct(m.difference.top3.value)} | ${span(m.difference.top3.interval, pct)} |\n| Calibration error | ${pct(m.difference.ece.value)} | ${span(m.difference.ece.interval, pct)} |`;
  const binRows = bins => bins.map((b, i) => (b.n ? `| ${i * 10} to ${i * 10 + 10} % | ${b.n} | ${pct(b.said)} | ${pct(b.happened)} |` : '')).filter(Boolean).join('\n');
  const binTable = (title, bins) => `${title}\n\n| Said | Decisions | Average said | Played |\n|---|---|---|---|\n${binRows(bins)}`;
  const sure = (name, m) => `| ${name} | ${m.sure70.n} | ${m.sure70.n ? pct(m.sure70.said) : ''} | ${m.sure70.n ? pct(m.sure70.happened) : ''} | ${m.sure90.n} | ${m.sure90.n ? pct(m.sure90.said) : ''} | ${m.sure90.n ? pct(m.sure90.happened) : ''} |`;
  const sureHead = '| First choices | given 70 % or more | said | played | given 90 % or more | said | played |\n|---|---|---|---|---|---|---|';
  const sub = m => `| Gukesh | ${m.gukesh.n} | ${f3(m.gukesh.logLoss)} | ${pct(m.gukesh.top1)} | ${pct(m.gukesh.top3)} | ${pct(m.gukesh.ece)} |\n| Sindarov | ${m.sindarov.n} | ${f3(m.sindarov.logLoss)} | ${pct(m.sindarov.top1)} | ${pct(m.sindarov.top3)} | ${pct(m.sindarov.ece)} |\n| positions the player has had before, by the tables | ${m.known.n} | ${f3(m.known.logLoss)} | ${pct(m.known.top1)} | ${pct(m.known.top3)} | ${pct(m.known.ece)} |\n| positions the player has not | ${m.unknown.n} | ${f3(m.unknown.logLoss)} | ${pct(m.unknown.top1)} | ${pct(m.unknown.top3)} | ${pct(m.unknown.ece)} |`;
  const subHead = '| The second version on | Decisions | Log loss | First choice right | In the first three | Calibration error |\n|---|---|---|---|---|---|';
  const yes = b => (b ? 'yes' : 'no');
  const SET = { fit: 'Fit', selection: 'Selection', holdout: 'Untouched holdout', benchmark: 'Reused benchmark' };
  const S = selection.onSelection;
  // an extra calibration step tried on the selection games (scripts/predictor-calibration-check.mjs), if its record is there
  const check = existsSync('data/predictor-v2/calibration-check.json') ? JSON.parse(readFileSync('data/predictor-v2/calibration-check.json', 'utf8')) : undefined;
  const checkText = check
    ? `### One more calibration step, tried and not ${check.adopted ? 'left out' : 'adopted'}

The table above shows the second version a little too sure between 50 and 100 % and a little too unsure below 20 %, on the very games it was chosen on. One temperature cannot correct both ends, so a second, flatter temperature mixed into the base model was tried, on the selection games only (\`node scripts/train-predictor.mjs --calibration-check\`, ${check.candidates.length} combinations, every other setting searched again for each). The rule was to adopt it only if the selection log loss fell by at least ${check.rule.match(/[\d.]+$/)[0]}; that threshold was set before the comparison was run, but was not published before it.

| | Log loss | Calibration error | Given 70 % or more | said | played |
|---|---|---|---|---|---|
| As selected | ${check.selected.logLoss.toFixed(4)} | ${pct(check.selected.calibrationError)} | ${check.selected.sure70.n} | ${pct(check.selected.sure70.said)} | ${pct(check.selected.sure70.happened)} |
| Best with two temperatures (share ${check.best.rho} at temperature ${check.best.T2}) | ${check.best.logLoss.toFixed(4)} | ${pct(check.best.calibrationError)} | ${check.best.sure70.n} | ${pct(check.best.sure70.said)} | ${pct(check.best.sure70.happened)} |

The gain is ${check.gain.toFixed(4)}. ${check.adopted ? 'It was adopted.' : 'It was not adopted, and the model is as selected above. The remaining gap between said and played is left as it is and reported, not tuned away.'}
`
    : '';
  const blend = chosen === 'B' ? `Temperature ${B.temperature}, κ ${B.kappa}, weight of others' moves ${B.others}, half-life ${B.halfLife === null ? 'none' : `${B.halfLife} years`}, ε ${B.epsilon}; per-player corrections: ${B.players ? `yes, penalty ${B.penaltyPlayers}` : 'none'}; clock correction penalty ${B.penaltyClock}.` : `Penalties ${A.penaltyShared} (shared) and ${A.penaltyOwn} (corrections), temperature ${A.temperature}.`;

  const report = `# Move predictor, second version: what was measured

Written by \`scripts/train-predictor.mjs --final\`. Do not edit by hand; run the script.

How this was to be done was written down before any fitting: [PREDICTOR-V2-PROTOCOL.md](PREDICTOR-V2-PROTOCOL.md). The first version's own report is [PREDICTOR-REPORT-V1.md](PREDICTOR-REPORT-V1.md).

Source of every game: the Lichess broadcast database, CC BY-SA 4.0.

## Games

Selected: standard chess from the initial position, with the larger of the first two clock readings at least ${CLASSICAL_SECONDS / 60} minutes. Tags were not trusted over the clocks. Players by exact FIDE ID.

| Corpus | SHA-256 | Games | Selected | Left out |
|---|---|---|---|---|
${Object.values(selectionCounts).map(c => `| \`${c.path}\` | \`${c.sha256.slice(0, 16)}…\` | ${c.games} | ${c.selected} | ${Object.entries(c.excluded).map(([k, n]) => `${n} ${k}`).join('; ') || 'none'} |`).join('\n')}

Whole tournaments, by the day they ended (the last day of their latest archive month, an upper bound).

| Set | Tournaments | Games | Decisions by the two players | Gukesh | Sindarov | In positions the player has had before |
|---|---|---|---|---|---|---|
${Object.keys(SET).map(s => `| ${SET[s]} | ${sample[s].tournaments} | ${sample[s].games} | ${sample[s].decisions} | ${sample[s].gukesh} | ${sample[s].sindarov} | ${sample[s].withEarlierGames} |`).join('\n')}

| Tournament | Set | Starts | Ends by | Games | Gukesh | Sindarov |
|---|---|---|---|---|---|---|
${tournaments.map(t => `| ${esc(t.name)} | ${SET[t.set]} | ${t.start} | ${t.end} | ${t.games} | ${t.gukesh} | ${t.sindarov} |`).join('\n')}

"Played here before", for a decision in one tournament, counts the tournaments that were over before it started, by these bounds. A tournament that ends in the month the next one starts is therefore not counted for it, although it may have been over. These pairs share a player and are left out for that reason:

${selection.pairsLeftOut.map(p => `- ${p.earlier} (ends by ${p.ends}) for ${p.later} (starts ${p.starts})`).join('\n') || '- none'}

## What was chosen, on the selection games only

Weights were fitted on the fit games. Every choice below was made by log loss on the two players' ${sample.selection.decisions} decisions in the selection games.

Family A, the first version's recipe fitted again:

| Shared penalty | Corrections penalty | Log loss at temperature 1 |
|---|---|---|
${A.candidates.map(c => `| ${c.penaltyShared} | ${c.penaltyOwn} | ${c.lossAtTemperature1.toFixed(4)} |`).join('\n')}

Chosen: ${A.penaltyShared} and ${A.penaltyOwn}, then temperature ${A.temperature}: log loss ${A.loss.toFixed(4)}.

Family B, counts of earlier moves blended with a base model:

| Base model | Temperature | κ | Others | Half-life | ε | Log loss | Base model alone |
|---|---|---|---|---|---|---|---|
${B.candidates.map(c => `| ${c.label} | ${c.temperature} | ${c.kappa} | ${c.others} | ${c.halfLife ?? 'none'} | ${c.epsilon} | ${c.loss.toFixed(4)} | ${c.baseModelAlone.toFixed(4)} |`).join('\n')}

Chosen: ${B.label}: log loss ${B.loss.toFixed(4)}.

**The second version is family ${chosen}**, the one with the lower log loss on the selection games. ${blend}

${head}
${['v2', other, 'base', 'uniform'].map(k => row(k === 'v2' ? NAMES.v2 : nameOf(k), S[k === 'v2' ? 'v2' : k])).join('\n')}

${sureHead}
${sure(NAMES.v2, S.v2)}
${sure(nameOf(other), S[other])}

${binTable('The second version on the selection games: when it gave its first choice a probability in the range on the left, how often that move was played.', S.v2.bins)}

These are the games the choices were made on, so these numbers flatter the model. They are here to show what was seen when choosing.

${checkText}
## Untouched holdout: a blind measurement

${sample.holdout.games} games of January to August 2026, ${sample.holdout.decisions} decisions. No choice was made on these games, and they were scored once. The published first version was fitted on these very games, so it is not measured here; family ${other}, fitted on the same earlier games as the second version, stands beside it instead.

${head}
${['v2', other, 'base', 'uniform'].map(k => row(k === 'v2' ? NAMES.v2 : nameOf(k), onHoldout[k])).join('\n')}

The second version, with intervals from drawing whole games again (${onHoldout.v2.games} games, 2,000 draws):

${intervalRows(onHoldout.v2)}

The second version minus ${NAMES[other]}, on the same decisions and the same draws. Below zero is better for log loss, Brier and calibration error:

${diffRows(onHoldout.v2, 'Second version minus the other family')}

${sureHead}
${sure(NAMES.v2, onHoldout.v2)}
${sure(nameOf(other), onHoldout[other])}

Said minus played at 70 % and above, second version: ${pct(onHoldout.v2.sure70.said - onHoldout.v2.sure70.happened)}${onHoldout.v2.intervals.gap70 ? ` (95 % interval ${span(onHoldout.v2.intervals.gap70, pct)})` : ''}.

${binTable('The second version: its first choice.', onHoldout.v2.bins)}

${binTable(`${NAMES[other]}: its first choice.`, onHoldout[other].bins)}

${binTable('The second version: the three rows the page shows, pooled. For each row, what it said and whether that move was played.', onHoldout.v2.shownBins)}

Calibration error of the three rows shown: ${pct(onHoldout.v2.shownEce)} (${span(onHoldout.v2.intervals.shownEce, pct)}).

${subHead}
${sub(onHoldout)}

## Reused benchmark: not a blind measurement

The ${sample.benchmark.games} games of September 2026, ${sample.benchmark.decisions} decisions: the ones the first version was measured on. That measurement has been looked at, it led to a change in the first version, and it is the reason the second version exists. Nothing was chosen on these games for the second version either, but they are not a fresh test.

The published first version is scored with its released weights and temperature and with the tables its published numbers were measured with, its 74 fitting games. Its released file's tables, which contain these 21 games, are not used. The script stops unless this reproduces the published numbers.

${head}
${row(NAMES.v1, onBenchmark.v1)}
${row(NAMES.v2, onBenchmark.v2)}
${row(nameOf(other), onBenchmark[other])}
${row(NAMES.base, onBenchmark.base)}
${row(NAMES.uniform, onBenchmark.uniform)}

The second version minus the published first version, on the same decisions and the same draws of whole games (${onBenchmark.v2.games} games):

${diffRows(onBenchmark.v2, 'Second version minus first')}

${sureHead}
${sure(NAMES.v1, onBenchmark.v1)}
${sure(NAMES.v2, onBenchmark.v2)}

${binTable('Published first version: its first choice.', onBenchmark.v1.bins)}

${binTable('Second version: its first choice.', onBenchmark.v2.bins)}

${binTable('Second version: the three rows the page shows, pooled.', onBenchmark.v2.shownBins)}

${subHead}
${sub(onBenchmark)}

With 21 games the intervals are wide.

## What can be said

The rule was written down beforehand. "More reliable than the first version" needs every line to be yes.

| Condition | Met |
|---|---|
| Benchmark: log loss lower than the published first version, interval of the difference below zero | ${yes(claims.benchmarkLogLossLower)} |
| Benchmark: calibration error lower | ${yes(claims.benchmarkCalibrationErrorLower)} |
| Benchmark: said and played closer at 70 % and above | ${yes(claims.benchmarkGapAt70Smaller)} |
| Holdout: log loss not worse than family ${other} | ${yes(claims.holdoutLogLossNotWorseThanOther)} |
| Holdout: calibration error not worse than family ${other} | ${yes(claims.holdoutCalibrationErrorNotWorseThanOther)} |

**${claims.moreReliableThanV1 ? 'By this rule the second version is more reliable than the first.' : 'By this rule the second version is not shown to be more reliable than the first.'}** Its probabilities are not claimed to be calibrated: the tables above show where they are and are not. The page keeps the label "Deneysel" and quotes the untouched holdout.

## Weights of the second version

| Feature | Shared | Gukesh | Sindarov | Under clock pressure |
|---|---|---|---|---|
${FEATURES.map((f, k) => `| ${f} | ${theta[k].toFixed(2)} | ${theta[K + k].toFixed(2)} | ${theta[2 * K + k].toFixed(2)} | ${theta[3 * K + k].toFixed(2)} |`).join('\n')}

${chosen === 'B' ? 'The two repertoire features have no weight in this family: earlier moves enter through the blend, not through the weighted sum.' : ''}

## Limits

- The games before 2023 are missing: broadcasts carry no FIDE IDs before then, and names are not used.
- The earlier games are tournaments. Nothing here teaches what a player does in a match, and the match-score rule on the page is a written rule that nothing here measures.
- The tables that ship count every selected game, aged as of ${AS_OF}. The measurements used the same rule as of each tournament's start, so the shipped tables are a little fuller than any that were measured.
- The match's own earlier games are not in the tables.
`;
  writeFileSync('docs/PREDICTOR-REPORT.md', report);
  log('wrote docs/PREDICTOR-REPORT.md');
  return { onHoldout, onBenchmark, claims, bytes: artifact.length };
};
