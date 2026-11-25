// One more calibration step, tried on the selection games only and not
// adopted. Kept so that the decision can be reproduced:
//
//   node scripts/train-predictor.mjs --calibration-check
//
// The reliability table of the chosen model on the selection games shows it
// a little too sure between 50 and 100 % and a little too unsure below 20 %.
// One temperature cannot fix both ends. The step tried here gives the base
// model two: a share rho of a flatter reading (temperature T2) mixed into
// the usual one. For each rho and T2 every other setting is searched again,
// as in the selection stage.
//
// The rule, set before the comparison was run (but not published before it):
// adopt the step only if it lowers the selection log loss by at least 0.003.
// It lowers it by 0.0003, so the model stays as selected. Nothing here looks
// at the untouched holdout or the benchmark.
import { writeFileSync } from 'node:fs';

export const THRESHOLD = 0.003;
export const OUTPUT = 'data/predictor-v2/calibration-check.json';

export const calibrationCheck = ({ rows, theta, chosen, grid, scoresOf, softmaxInto, logLoss, searchTemperature, measure, BOARD, round, log }) => {
  const scores = new Map(rows.map(r => [r, scoresOf(theta, r, BOARD)]));
  const soft = (r, temperature) => {
    const s = scores.get(r);
    const p = new Float64Array(r.n);
    for (let j = 0; j < r.n; j++) p[j] = s[j] / temperature;
    return softmaxInto(p, r.n);
  };
  const model = c => r => {
    const p = soft(r, c.temperature);
    if (c.rho > 0) {
      const flat = soft(r, c.T2);
      for (let j = 0; j < r.n; j++) p[j] = (1 - c.rho) * p[j] + c.rho * flat[j];
    }
    let total = c.kappa;
    for (let j = 0; j < r.n; j++) p[j] *= c.kappa;
    for (let i = 0; i < r.hj.length; i++) {
      const weight = (r.hown[i] ? 1 : c.others) * (c.halfLife === null ? 1 : 0.5 ** (r.hage[i] / c.halfLife));
      p[r.hj[i]] += weight;
      total += weight;
    }
    for (let j = 0; j < r.n; j++) p[j] = (1 - c.epsilon) * (p[j] / total) + c.epsilon / r.n;
    return p;
  };
  const search = (rho, T2) => {
    const c = { temperature: chosen.temperature, kappa: chosen.kappa, others: chosen.others, halfLife: chosen.halfLife, epsilon: chosen.epsilon, rho, T2 };
    const lossOf = change => logLoss(rows, model({ ...c, ...change }));
    for (let turn = 1; turn <= 10; turn++) {
      const before = JSON.stringify(c);
      c.temperature = searchTemperature(t => lossOf({ temperature: t }), 0.2, 3);
      for (const [name, values] of Object.entries(grid)) for (const value of values) if (lossOf({ [name]: value }) < lossOf({})) c[name] = value;
      if (JSON.stringify(c) === before) break;
    }
    const m = measure(rows, model(c));
    return { ...c, logLoss: round(m.logLoss, 4), calibrationError: round(m.ece, 4), sure70: { n: m.sure70.n, said: round(m.sure70.said, 3), happened: round(m.sure70.happened, 3) } };
  };
  const selected = search(0, null);
  const candidates = [];
  for (const rho of [0.1, 0.2, 0.3, 0.5, 0.7]) for (const T2 of [1.5, 2, 3, 5]) candidates.push(search(rho, T2));
  const best = candidates.reduce((a, b) => (b.logLoss < a.logLoss ? b : a));
  const gain = round(selected.logLoss - best.logLoss, 4);
  const result = {
    about: 'A second, flatter temperature mixed into the base model (share rho, temperature T2), tried on the selection games only. See scripts/predictor-calibration-check.mjs.',
    decisions: rows.length,
    rule: `adopt only if the selection log loss falls by at least ${THRESHOLD}`,
    selected,
    candidates,
    best,
    gain,
    adopted: gain >= THRESHOLD,
  };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 1) + '\n');
  log(`calibration check on ${rows.length} selection decisions: selected ${selected.logLoss}, best of ${candidates.length} with two temperatures ${best.logLoss} (rho ${best.rho}, T2 ${best.T2}); gain ${gain}, adopted: ${result.adopted}. Wrote ${OUTPUT}.`);
  return result;
};
