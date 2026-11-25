"""Win, draw and loss by engine evaluation, from how real games ended.

    python3 scripts/fit-win-chance.py

Reads data/eval-outcomes/counts.json (written by prepare-eval-outcomes.py)
and writes
- src/data/winchance.json: for each evaluation, the share of positions from
  which White won and from which Black won; the page reads its three
  percentages from this table;
- docs/WIN-CHANCE.md: the same, to read, with a check on later games.

No curve is assumed. The shares are the counted ones, with one thing asked
of them: a better evaluation for a side never gives that side a smaller
share of wins. Where the counts break that rule, neighbouring groups are
pooled until they keep it (isotonic regression). Forced mates are the last
group at either end.

The table is made from the games before 2026 and checked on the games of
2026, which it has not seen.
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
counts = json.loads((ROOT / 'data/eval-outcomes/counts.json').read_text())
STEP = counts['rule']['stepCentipawns']
LIMIT = counts['rule']['limitCentipawns']
KEYS = ['mateBlack'] + [str(cp) for cp in range(-LIMIT, LIMIT + 1, STEP)] + ['mateWhite']


def rows(part):
    """White won, draw, Black won for every group, from Black mates to White mates."""
    return [counts['positions'][part].get(key, [0, 0, 0]) for key in KEYS]


def monotone(values, weights):
    """The closest never-falling sequence to `values`, by weight: neighbours that fall are pooled."""
    blocks = []  # value, weight, length
    for value, weight in zip(values, weights):
        blocks.append([value, weight, 1])
        while len(blocks) > 1 and blocks[-2][0] > blocks[-1][0]:
            v2, w2, n2 = blocks.pop()
            v1, w1, n1 = blocks.pop()
            total = w1 + w2
            blocks.append([(v1 * w1 + v2 * w2) / total if total else (v1 + v2) / 2, total, n1 + n2])
    out = []
    for value, _, length in blocks:
        out.extend([value] * length)
    return out


def table(data):
    """Shares of White wins and Black wins by group, each kept in order."""
    totals = [sum(r) for r in data]
    white = monotone([r[0] / n if n else 0 for r, n in zip(data, totals)], totals)
    black = list(reversed(monotone(list(reversed([r[2] / n if n else 0 for r, n in zip(data, totals)])), list(reversed(totals)))))
    return white, black


def shares(white, black, key_index):
    w, b = white[key_index], black[key_index]
    return w, max(0.0, 1 - w - b), b


def old(cp):
    """The formula the page used before: a guess shaped like an engine's, not a count of games."""
    sig = lambda x: 1 / (1 + math.exp(-x)) if x > -700 else 0.0
    w, b = sig((cp - 100) / 48), sig((-cp - 100) / 48)
    return w, max(0.0, 1 - w - b), b


def log_loss(data, predict):
    total = n = 0
    for i, r in enumerate(data):
        p = predict(i)
        for k in range(3):
            if r[k]:
                total -= r[k] * math.log(max(p[k], 1e-6))
                n += r[k]
    return total / n


earlier, later = rows('earlier'), rows('2026')
white, black = table(earlier)
cp_of = lambda i: -LIMIT - STEP if i == 0 else LIMIT + STEP if i == len(KEYS) - 1 else int(KEYS[i])
old_at = lambda i: (0.0, 0.0, 1.0) if i == 0 else (1.0, 0.0, 0.0) if i == len(KEYS) - 1 else old(cp_of(i))
check = {
    'table': log_loss(later, lambda i: shares(white, black, i)),
    'formulaBefore': log_loss(later, old_at),
}
games = counts['games']
n_games = {part: sum(g.values()) for part, g in games.items()}
n_positions = {part: sum(sum(r) for r in rows(part)) for part in ('earlier', '2026')}

out = {
    'about': 'From positions with a given evaluation, the share of games White went on to win and Black went on to win, in classical games between players rated 2600 or more (Lichess broadcast database, CC BY-SA 4.0). See docs/WIN-CHANCE.md.',
    'stepCentipawns': STEP,
    'limitCentipawns': LIMIT,
    'games': n_games['earlier'],
    'positions': n_positions['earlier'],
    # from -limit to +limit in steps; then the two groups of forced mates
    'white': [round(x, 4) for x in white[1:-1]],
    'black': [round(x, 4) for x in black[1:-1]],
    'mate': {'forWhite': {'white': round(white[-1], 4), 'black': round(black[-1], 4)}, 'forBlack': {'white': round(white[0], 4), 'black': round(black[0], 4)}},
}
(ROOT / 'src/data/winchance.json').write_text(json.dumps(out) + '\n')

BANDS = [(-1000, -800), (-800, -600), (-600, -500), (-500, -400), (-400, -300), (-300, -200), (-200, -150), (-150, -100), (-100, -50), (-50, -25), (-25, 25), (25, 50), (50, 100), (100, 150), (150, 200), (200, 300), (300, 400), (400, 500), (500, 600), (600, 800), (800, 1001)]
pct = lambda x: f'{100 * x:.1f} %'
pawns = lambda cp: f"{'+' if cp > 0 else '−' if cp < 0 else ''}{abs(cp) / 100:.2f}"


def band(data, lo, hi, predict=None):
    w = d = b = 0
    pw = pd = pb = 0.0
    for i, r in enumerate(data):
        if i in (0, len(KEYS) - 1) or not lo <= int(KEYS[i]) < hi:
            continue
        n = sum(r)
        w, d, b = w + r[0], d + r[1], b + r[2]
        if predict:
            p = predict(i)
            pw, pd, pb = pw + n * p[0], pd + n * p[1], pb + n * p[2]
    n = w + d + b
    return n, ((w / n, d / n, b / n) if n else (0, 0, 0)), ((pw / n, pd / n, pb / n) if n and predict else None)


lines = []
for lo, hi in BANDS:
    n1, seen, _ = band(earlier, lo, hi)
    n2, later_seen, said = band(later, lo, hi, lambda i: shares(white, black, i))
    _, _, before = band(later, lo, hi, old_at)
    lines.append(f"| {pawns(lo)} to {pawns(min(hi, LIMIT))} | {n1} | {pct(seen[0])} | {pct(seen[1])} | {pct(seen[2])} | {n2} | {pct(later_seen[0])} / {pct(later_seen[1])} / {pct(later_seen[2])} | {pct(said[0])} / {pct(said[1])} / {pct(said[2])} | {pct(before[0])} / {pct(before[1])} / {pct(before[2])} |")
at = lambda cp: shares(white, black, KEYS.index(str(int(round(cp / STEP)) * STEP)))
example = at(-450)
report = f"""# Win, draw and loss by evaluation

Written by `scripts/fit-win-chance.py`. Do not edit by hand; run the script.

The "Kazanma şansı" card turns the engine's evaluation into three
percentages. They used to come from a formula shaped like an engine's own
guess, which said 100 % from about four pawns up. They now come from how
real games ended.

## Data

Classical games between two players rated 2600 or more, from the Lichess
broadcast database (https://database.lichess.org/#broadcasts, CC BY-SA 4.0),
every monthly archive from January 2020 to October 2026: standard chess from
the initial position, first clock readings of 45 minutes or more, a result,
and at least {counts['rule']['minimumEvaluations']} positions evaluated by Lichess's analysis. Each game once.

| | Games | White won | Draw | Black won | Evaluated positions |
|---|---|---|---|---|---|
| Before 2026: the table is made from these | {n_games['earlier']} | {games['earlier']['whiteWon']} | {games['earlier']['draw']} | {games['earlier']['blackWon']} | {n_positions['earlier']} |
| 2026: the table is checked on these | {n_games['2026']} | {games['2026']['whiteWon']} | {games['2026']['draw']} | {games['2026']['blackWon']} | {n_positions['2026']} |

`python3 scripts/prepare-eval-outcomes.py` counts, for each position, the
evaluation it had (from White's side, in steps of a quarter of a pawn up to
ten pawns either way, forced mates apart) and how the game ended. Only the
counts are kept: `data/eval-outcomes/counts.json`, with the archives' URLs
and checksums.

## Method

No curve is assumed. For each evaluation the table holds the share of
positions from which White won, and from which Black won; the draw is the
rest. One thing is asked of the counts: a better evaluation for a side never
gives that side fewer wins. Where the counts break that, neighbouring groups
are pooled until they keep it. Between two groups the page reads off a
straight line.

At −4.50, for example, the table gives Black {pct(example[2])}, a draw {pct(example[1])} and White {pct(example[0])}.
The formula before gave Black 99.9 %.

## The counts, the table and the check

Evaluations from White's side, in pawns. "Said" is what the table, made from
the earlier games, gives for the positions of 2026; "before" is the old
formula on the same positions. Each cell: White won / draw / Black won.

| Evaluation | Positions before 2026 | White won | Draw | Black won | Positions in 2026 | Ended, 2026 | Said by the table | Said by the formula before |
|---|---|---|---|---|---|---|---|---|
{chr(10).join(lines)}

Forced mates before 2026: for White {sum(earlier[-1])} positions, White won {pct(earlier[-1][0] / sum(earlier[-1]))}; for Black {sum(earlier[0])} positions, Black won {pct(earlier[0][2] / sum(earlier[0]))}.

Log loss on the positions of 2026 (lower is better): the table {check['table']:.4f}, the formula before {check['formulaBefore']:.4f}.

## Limits

- Positions of one game are not independent: a game that was won from +5
  contributes many positions at +5 and above. The shares say how positions
  with an evaluation ended, which is the question, but the far ends rest on
  fewer games than their position counts suggest.
- The evaluation alone. Not the move number, not the clocks, not the players:
  the same evaluation is easier to convert in some positions than in others.
- The evaluations in the archive are from Lichess's analysis. The page's own
  evaluation comes from a cloud lookup or from Stockfish in the browser, at
  another depth, so the two do not agree to the hundredth.
- Players rated 2600 and more, at classical time controls. A world
  championship match is played by two of the very best, with more at stake.
- The 2026 check is on games the table has not seen, but they come from the
  same source and the same kind of event.
"""
(ROOT / 'docs/WIN-CHANCE.md').write_text(report)
print(json.dumps({'games': n_games, 'positions': n_positions, 'check': {k: round(v, 4) for k, v in check.items()}, 'at -4.56': [round(x, 3) for x in at(-450)], 'bytes': len(json.dumps(out))}))
