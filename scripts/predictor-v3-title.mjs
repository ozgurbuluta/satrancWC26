// Phase 3 of the third version: does a title match change what a player
// opens with? Run by scripts/train-predictor.mjs --v3-title.
// Plan: docs/PREDICTOR-V3-PROTOCOL.md.
//
// The seven players of the title matches in the archives, every classical
// game of theirs (.cache/predictor-v3/champions.jsonl). For each of their
// first fifteen moves in a title match, and in their other tournaments of
// the twelve months before it, the third version's estimate is computed as
// the page computes it, from what could be known then: theory from earlier
// months, the player's own games from earlier tournaments, and earlier
// rounds of the same event. The board model is the shared one, without the
// two finalists' own corrections.
//
// Measured: how often a player is in a position he has had before and how
// often he then repeats himself, in a title match and outside one; and
// which weight of the base against his own games (κ, times a multiplier)
// predicts his moves best. A multiplier for a match is adopted only if
// leaving out each match in turn gives a choice on the same side of what
// the same players' tournaments ask for.
//
// Not in the plan, added after the first run showed it: in a title match a
// player comes back to a position of an earlier game of the same match more
// often than he meets one again within a tournament, and repeats his move
// there more often. The weight of those earlier games (`same`) is only ever
// used on the page for the match, so the question put to it is direct: is
// another weight better in title matches than the one on the page? It is
// changed only if every left-out choice is on the same side of it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const CACHE = '.cache/predictor-v3';
const OUT = 'data/predictor-v3/title-matches.json';
const PLIES = 30;
const MULTIPLIERS = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64];
const SAME_MULTIPLIERS = [0.25, 0.5, 1, 2, 4, 8, 16];
const TITLE = /^(FIDE )?(Women['’]s )?World (Chess )?Championship( \d{4})?$/;
/** Broadcasts of 2020 were one per round: "… - Game 3", "… - Rd 7". */
const eventOf = name => name.replace(/\s+-\s+(Rd|Round|Game)\s+\d+$/i, '');
const NAMES = { 1503014: 'Carlsen', 4168119: 'Nepomniachtchi', 8603677: 'Ding', 46616543: 'Gukesh', 8603006: 'Ju', 8605114: 'Lei', 8603642: 'Tan' };

export const runTitle = async ctx => {
  const { K, BOARD, selection, scoresOf, softmaxInto, parseGame, candidates, positionKey, monthIndex, measure, round, log } = ctx;
  const theta = Float64Array.from(selection.families[selection.chosen].theta);
  const c = JSON.parse(readFileSync('data/predictor-v3/selection.json', 'utf8')).chosen;
  const lines = name => readFileSync(`${CACHE}/${name}.jsonl`, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const replay = moves => {
    const text = moves.split(' ').slice(0, PLIES).map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' ');
    return parseGame(`[Event "x"]\n[White "a"]\n[Black "b"]\n[Result "*"]\n\n${text} *`, undefined, 0);
  };
  const age = (years, halfLife) => (halfLife === null ? 1 : 0.5 ** (years / halfLife));

  // ---------- the players' games, by event
  const games = lines('champions').map((g, index) => ({ ...g, index, month: monthIndex(g.month), event: eventOf(g.event), round: Math.floor(Number(String(g.round).split('.')[0])) || 0 }));
  const byEvent = new Map();
  for (const g of games) (byEvent.get(g.event) ?? byEvent.set(g.event, []).get(g.event)).push(g);
  const events = [];
  for (const [name, list] of byEvent) {
    list.sort((a, b) => a.month - b.month || a.index - b.index);
    let t;
    for (const g of list) {
      // the same name more than two months later is another year's event
      if (!t || g.month - t.end > 2) events.push((t = { name, start: g.month, end: g.month, title: TITLE.test(name), games: 0 }));
      t.end = g.month;
      t.games++;
      g.t = t;
    }
  }
  const label = month => `${Math.floor((month - 1) / 12)}-${String(((month - 1) % 12) + 1).padStart(2, '0')}`;
  const matches = events.filter(t => t.title).sort((a, b) => a.start - b.start);
  for (const t of matches) t.players = [...new Set(games.filter(g => g.t === t).flatMap(g => [g.whiteWho, g.blackWho]).filter(Boolean))];

  // ---------- what each of them played, by position
  const own = new Map();
  for (const g of games) {
    const game = replay(g.moves);
    if (!game) continue;
    g.game = game;
    let fen = game.initialFen;
    game.plies.forEach((ply, i) => {
      const who = i % 2 === 0 ? g.whiteWho : g.blackWho;
      const key = positionKey(fen);
      if (who) (own.get(key) ?? own.set(key, []).get(key)).push({ uci: ply.uci, who, t: g.t, round: g.round });
      fen = ply.fen;
    });
  }
  // ---------- theory, as in phase 1, with whose game each move is from
  const theory = new Map();
  for (const g of lines('elite')) {
    const game = replay(g.moves);
    if (!game) continue;
    const month = monthIndex(g.month);
    let fen = game.initialFen;
    for (const ply of game.plies) {
      const key = positionKey(fen);
      (theory.get(key) ?? theory.set(key, []).get(key)).push({ uci: ply.uci, month, a: g.whiteWho ?? '', b: g.blackWho ?? '' });
      fen = ply.fen;
    }
  }

  // ---------- the decisions: title matches, and the same players' other events of the twelve months before
  const rows = [];
  const decide = (g, set, match) => {
    const game = g.game;
    if (!game) return;
    let fen = game.initialFen;
    game.plies.forEach((ply, i) => {
      const who = i % 2 === 0 ? g.whiteWho : g.blackWho;
      const from = fen;
      fen = ply.fen;
      if (!who || (set === 'control' && !match.players.includes(who))) return;
      const cands = candidates({ fen: from, lastMove: i > 0 ? game.plies[i - 1].uci : undefined, ownLastMove: i > 1 ? game.plies[i - 2].uci : undefined });
      const chosen = cands.findIndex(x => x.san === ply.san);
      if (chosen < 0) return;
      const n = cands.length;
      const x = new Float64Array(n * K);
      cands.forEach((cand, j) => x.set(cand.f, j * K));
      const ucis = cands.map(cand => cand.uci);
      const r = { g: g.index, set, match: match.name, who, ply: i, n, x, ucis, chosen, mover: 0, pressure: 0 };
      // the base: the board model, pulled towards theory of earlier months, the mover's own games left out
      const q = scoresOf(theta, r, BOARD);
      for (let j = 0; j < n; j++) q[j] /= c.temperature;
      softmaxInto(q, n);
      const key = positionKey(from);
      const played = new Float64Array(n);
      let theoryGames = 0;
      for (const e of theory.get(key) ?? []) {
        const months = g.t.start - e.month;
        if (months <= 0 || e.a === who || e.b === who) continue;
        const j = ucis.indexOf(e.uci);
        if (j < 0) continue;
        played[j] += age(Math.floor((months - 1) / 12) + 0.5, c.theoryHalfLife);
        theoryGames++;
      }
      r.theory = theoryGames >= c.minTheory && i < c.theoryPlies;
      if (r.theory) {
        const total = played.reduce((sum, v) => sum + v, c.nu);
        r.theoryTop = played.indexOf(Math.max(...played)) === chosen;
        for (let j = 0; j < n; j++) q[j] = (played[j] + c.nu * q[j]) / total;
      }
      r.q = q;
      // the mover's own moves here: in events that were over before this one began, and in its earlier rounds
      r.own = new Float64Array(n);
      r.same = new Float64Array(n);
      const before = new Float64Array(n);
      for (const e of own.get(key) ?? []) {
        if (e.who !== who) continue;
        const j = ucis.indexOf(e.uci);
        if (j < 0) continue;
        if (e.t.end < g.t.start) {
          r.own[j] += age((g.t.start - e.t.end) / 12, c.halfLife);
          before[j]++;
        } else if (e.t === g.t && g.round > 0 && e.round > 0 && e.round < g.round) r.same[j]++;
      }
      r.known = before.some(v => v > 0);
      r.repeated = r.known && before[chosen] === Math.max(...before);
      r.sameKnown = r.same.some(v => v > 0);
      r.sameRepeated = r.sameKnown && r.same[chosen] > 0;
      rows.push(r);
    });
  };
  for (const m of matches) {
    for (const g of games) {
      if (g.t === m) decide(g, 'match', m);
      else if (!g.t.title && g.t.start < m.start && g.t.start >= m.start - 12) decide(g, 'control', m);
    }
  }
  // the first match of the archives has nothing before it to compare with
  const usable = matches.filter(m => rows.some(r => r.set === 'match' && r.match === m.name && r.known));
  const used = new Set(usable.map(m => m.name));
  const matchRows = rows.filter(r => r.set === 'match' && used.has(r.match));
  const controlRows = rows.filter(r => r.set === 'control' && used.has(r.match));
  log(`title matches: ${matches.length} in the archives, ${usable.length} with earlier games of their players; ${matchRows.length} decisions in them, ${controlRows.length} in the same players' other events of the twelve months before`);

  // ---------- the estimate, with the base weighted `multiplier` times as much against the player's own games
  const model = (multiplier, sameMultiplier = 1) => r => {
    const kappa = c.kappa * multiplier;
    const p = new Float64Array(r.n);
    let total = kappa;
    for (let j = 0; j < r.n; j++) {
      const mine = r.own[j] + c.same * sameMultiplier * r.same[j];
      p[j] = mine + kappa * r.q[j];
      total += mine;
    }
    for (let j = 0; j < r.n; j++) p[j] = (1 - c.epsilon) * (p[j] / total) + c.epsilon / r.n;
    return p;
  };
  const loss = (data, multiplier, sameMultiplier = 1) => {
    const f = model(multiplier, sameMultiplier);
    return -data.reduce((sum, r) => sum + Math.log(Math.max(1e-12, f(r)[r.chosen])), 0) / data.length;
  };
  const best = data => MULTIPLIERS.reduce((a, b) => (loss(data, b) < loss(data, a) ? b : a));
  const bestSame = data => SAME_MULTIPLIERS.reduce((a, b) => (loss(data, 1, b) < loss(data, 1, a) ? b : a));
  const share = (data, test) => (data.length ? round(data.filter(test).length / data.length) : null);
  /** The move number at which a game leaves the player's own earlier games, averaged over games and sides. */
  const leaves = data => {
    const first = new Map();
    for (const r of data) {
      const id = `${r.g}|${r.who}`;
      const move = Math.floor(r.ply / 2) + 1;
      const now = first.get(id) ?? { left: undefined, last: 0 };
      if (!r.known && now.left === undefined) now.left = move;
      now.last = Math.max(now.last, move);
      first.set(id, now);
    }
    const list = [...first.values()].map(v => v.left ?? v.last + 1);
    return list.length ? round(list.reduce((sum, v) => sum + v, 0) / list.length, 2) : null;
  };
  const describe = data => ({
    decisions: data.length,
    games: new Set(data.map(r => r.g)).size,
    // the position is one the player has had before, in an earlier event
    known: share(data, r => r.known),
    // and then the move is the one he played there most often
    repeated: share(data.filter(r => r.known), r => r.repeated),
    leavesOwnGamesAtMove: leaves(data),
    // the position occurred in an earlier round of the same event, and the move is one he played there
    sameKnown: share(data, r => r.sameKnown),
    sameRepeated: share(data.filter(r => r.sameKnown), r => r.sameRepeated),
    inTheory: share(data, r => r.theory),
    theoryMostPlayed: share(data.filter(r => r.theory), r => r.theoryTop),
    logLoss: round(loss(data, 1)),
    byMultiplier: MULTIPLIERS.map(m => ({ multiplier: m, logLoss: round(loss(data, m)) })),
    best: best(data),
    bySameMultiplier: SAME_MULTIPLIERS.map(m => ({ multiplier: m, logLoss: round(loss(data, 1, m)) })),
    bestSame: bestSame(data),
  });

  const control = describe(controlRows);
  const all = describe(matchRows);
  const perMatch = usable.map(m => {
    const mine = matchRows.filter(r => r.match === m.name);
    const others = matchRows.filter(r => r.match !== m.name);
    const chosenWithout = best(others);
    return {
      match: m.name,
      month: label(m.start),
      players: m.players.map(id => NAMES[id] ?? id),
      ...describe(mine),
      control: describe(controlRows.filter(r => r.match === m.name)),
      // chosen on the other matches, then looked at here
      chosenOnTheOthers: chosenWithout,
      logLossWithIt: round(loss(mine, chosenWithout)),
      sameChosenOnTheOthers: bestSame(others),
      logLossWithThatSame: round(loss(mine, 1, bestSame(others))),
    };
  });
  // the weight of the match's own earlier games: on the page it is the multiple 1; is another better in title matches?
  const sameSides = perMatch.map(m => Math.sign(Math.log(m.sameChosenOnTheOthers)));
  const sameAgree = sameSides.every(v => v === sameSides[0]) && sameSides[0] !== 0;
  const sameLeftOut = perMatch.reduce((sum, m) => sum + m.logLossWithThatSame * m.decisions, 0) / matchRows.length;
  const sameAgainst = measure(matchRows, model(1, 1), { against: model(1, control.bestSame) }).difference.logLoss;
  const sameAdopted = sameAgree && sameLeftOut < loss(matchRows, 1, 1);
  const sides = perMatch.map(m => Math.sign(Math.log(m.chosenOnTheOthers / control.best)));
  const agree = sides.every(s => s === sides[0]) && sides[0] !== 0;
  const multiplier = agree ? all.best / control.best : 1;
  const against = measure(matchRows, model(all.best), { against: model(control.best) }).difference.logLoss;
  // the left-out choices, each scored on the match it never saw, against what tournaments ask for
  const leftOut = perMatch.reduce((sum, m) => sum + m.logLossWithIt * m.decisions, 0) / matchRows.length;
  const adopted = agree && leftOut < loss(matchRows, control.best);
  log(`title matches: known position ${(100 * all.known).toFixed(1)} % (other events ${(100 * control.known).toFixed(1)} %); repeats his most played move ${(100 * all.repeated).toFixed(1)} % (${(100 * control.repeated).toFixed(1)} %); leaves his own games at move ${all.leavesOwnGamesAtMove} (${control.leavesOwnGamesAtMove})`);
  log(`title matches: best multiplier ${all.best} (other events ${control.best}); left out in turn: ${perMatch.map(m => `${m.players.join('–')} ${m.month}: ${m.chosenOnTheOthers}`).join(', ')}; same side every time: ${agree}`);
  log(`title matches: log loss ${loss(matchRows, control.best).toFixed(4)} with the tournaments' multiplier, ${leftOut.toFixed(4)} with the left-out choices, ${loss(matchRows, all.best).toFixed(4)} with the best for all (difference ${against.value.toFixed(4)}, ${against.interval.map(v => v.toFixed(4)).join(' to ')}); adopted: ${adopted}`);

  mkdirSync('data/predictor-v3', { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        about: 'Do title matches change what a player opens with? The first fifteen moves of the players of the title matches in the archives, in those matches and in their other events of the twelve months before each. See scripts/predictor-v3-title.mjs and docs/PREDICTOR-V3-PROTOCOL.md.',
        players: Object.fromEntries(Object.entries(NAMES).map(([id, name]) => [name, games.filter(g => g.whiteWho === id || g.blackWho === id).length])),
        matchesInTheArchives: matches.map(m => ({ match: m.name, month: label(m.start), games: m.games, measured: used.has(m.name) })),
        settings: { kappa: c.kappa, halfLifeYears: c.halfLife, same: c.same, nu: c.nu, theoryHalfLifeYears: c.theoryHalfLife, theoryPlies: c.theoryPlies, minTheory: c.minTheory, epsilon: c.epsilon, temperature: c.temperature, multipliers: MULTIPLIERS, sameMultipliers: SAME_MULTIPLIERS },
        titleMatches: all,
        otherEvents: control,
        perMatch,
        sameSideEveryTime: agree,
        logLoss: {
          withTheTournamentsMultiplier: round(loss(matchRows, control.best)),
          withTheLeftOutChoices: round(leftOut),
          withTheBestForAll: round(loss(matchRows, all.best)),
          bestForAllMinusTournaments: { value: round(against.value), interval: against.interval.map(v => round(v)) },
        },
        multiplier: adopted ? multiplier : 1,
        adopted,
        // not in the plan: the weight of the same event's earlier games, as multiples of the one on the page
        same: {
          bestInTitleMatches: all.bestSame,
          bestInOtherEvents: control.bestSame,
          leftOutChoices: perMatch.map(m => m.sameChosenOnTheOthers),
          sameSideOfThePagesWeightEveryTime: sameAgree,
          logLoss: {
            withThePagesWeight: round(loss(matchRows, 1, 1)),
            withTheLeftOutChoices: round(sameLeftOut),
            withTheOtherEventsBest: round(loss(matchRows, 1, control.bestSame)),
            pagesWeightMinusOtherEventsBest: { value: round(sameAgainst.value), interval: sameAgainst.interval.map(v => round(v)) },
          },
          multiplier: sameAdopted ? all.bestSame : 1,
          adopted: sameAdopted,
        },
      },
      null,
      1,
    ) + '\n',
  );
  log(`title matches, earlier games of the same event: there before ${(100 * all.sameKnown).toFixed(1)} % (other events ${(100 * control.sameKnown).toFixed(1)} %), repeats ${(100 * all.sameRepeated).toFixed(1)} % (${(100 * control.sameRepeated).toFixed(1)} %); best multiple of the page's weight ${all.bestSame} (other events ${control.bestSame}); left out in turn: ${perMatch.map(m => m.sameChosenOnTheOthers).join(', ')}; log loss ${loss(matchRows, 1, 1).toFixed(4)} with the page's weight, ${loss(matchRows, 1, control.bestSame).toFixed(4)} with the other events' best (difference ${sameAgainst.value.toFixed(4)}, ${sameAgainst.interval.map(v => v.toFixed(4)).join(' to ')}); changed: ${sameAdopted}`);
  log(`wrote ${OUT}`);
};
