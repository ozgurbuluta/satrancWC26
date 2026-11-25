# The move predictor

The site's own estimate of the next move of Gukesh or Sindarov: three legal
moves with a share each, and the rest as "other", at the bottom of the
Tahmin tab. It is experimental, and labelled so.

This is its second version. What was measured, with every table, is in
[PREDICTOR-REPORT.md](PREDICTOR-REPORT.md), which the training script writes.
How it was to be built and measured was fixed beforehand in
[PREDICTOR-V2-PROTOCOL.md](PREDICTOR-V2-PROTOCOL.md). The first version's
report is kept as [PREDICTOR-REPORT-V1.md](PREDICTOR-REPORT-V1.md). This
page says what the model is and what it is not.

## What it is

An original statistical model. It uses no chess engine and no weights from
anyone else. It is not an engine evaluation turned into percentages, and it
is not a count of what masters played.

It has two parts.

**A base model.** For every legal move it computes a row of features that
can be read off the board in a few milliseconds
(`src/lib/predictor/features.ts`):

- the piece that moves, and whether the move is a capture, a recapture, an
  even trade, a check, a mate, castling or a promotion;
- what the exchange on the destination square wins or loses, by a count of
  attackers and defenders;
- what the move leaves hanging, compared with the safest legal move, and
  whether it moves a piece out of a losing attack or creates a new threat;
- direction and place: forward or back, towards the centre, development, a
  pawn's double step, an advanced pawn, king moves with and without queens;
- whether the same piece moves again, or goes straight back.

A move's score is a weighted sum of its features, and the scores of all
legal moves are turned into shares that add up to one. There are weights
shared by everyone, a small correction for each of the two players, and a
correction that grows as the mover's clock runs below ten minutes.

**What the player did here before.** Where the player has been in the same
position in earlier games, the estimate is pulled towards what they played:

`p(move) = (own + w · others + κ · base) / (all own + w · all others + κ)`

- `own`: how often this player played the move in this position;
- `others`: how often anyone else did, in the same games, counted at a
  discount `w`;
- `κ`: how many games the base model is worth;
- every count is aged: it halves with each `h` years since that tournament
  ended, so a game of last month weighs more than one of three years ago;
- a small share `ε` is spread over every legal move at the end.

Before that last step the estimate lies between the base model and the
share actually played. With no earlier games it is the base model; with many
it is close to what the player has done. It does not sharpen a mixed
repertoire: a player who chose between two moves 60 to 40 stays near 60 to
40. The even share `ε` is a third ingredient, mixed in afterwards.

This is the main change from the first version. That one put
`log(1 + times played)` into the weighted sum, with a fitted weight that
turned 60 to 40 into roughly 77 to 23 and kept growing with the count. It
was badly overconfident, and more games would have made it worse.

The settings were chosen on the selection games: the base model counts as
half a game (`κ` = 0.5), a move played here by someone else counts
half of one of the player's own (`w` = 0.5), counts halve every
4 years, `ε` is 0.005 and the temperature is 0.971.

## What is specific to a player

The table of what each player played before, in each position of the first
20 moves. It only speaks in positions the player has had, which means the
opening; after that the estimate is nearly the same for both players given
the same position and clock.

The per-player corrections to the weights are in the model because the
selection rule picked them, but they make no difference that can be
measured: without them the log loss on the selection games is 2.2450
against 2.2449.

## The match situation is a rule, not something learned

The earlier games are tournaments, not matches, so the data cannot teach
what a player does when behind or ahead in a match. Rather than leave the
match out, or pretend, it enters through one rule that is written down:

- urgency = (opponent's points − mover's points) / games left, counting the
  game in progress, between −1 and 1;
- a move that is an even trade of pieces has `0.35 × urgency` taken from its
  score in the base model.

So a player who is behind is taken to avoid even trades a little, and one
who is ahead to welcome them a little. The number 0.35 was chosen, not
fitted, and nothing here measures whether the rule is right. Early in a
14-game match the urgency is close to zero and the rule changes almost
nothing. The panel says that this is a rule and how strongly it applies.

The score used is the score before the open game, from earlier games only.
The open game's own result and anything played later never reach it, also
while the viewer is paused.

## Data

All games are from the Lichess broadcast database, licensed CC BY-SA 4.0
(sources and checksums: `data/player-history/README.md` and the two
manifests). Nothing from the championship match is in it.

- `data/player-history/earlier/games.pgn`: 351 classical games of 2023 to
  2025.
- `data/player-history/games.pgn`: 331 games of 2026 at every time control,
  of which 104 are classical.

Players are matched by exact FIDE ID. No game before 2023 carries either
player's ID in this source, and names are not used, so nothing earlier is
in. Classical means standard chess from the initial position with the larger
of the first two clock readings at least 45 minutes; tags are not trusted
over the clocks. That gives 455 games in 43 tournaments.

Date tags are unreliable in this source, so time is handled per tournament:
a tournament starts on its earliest usable date and ends, to be safe, on the
last day of the month of its latest archive. "Played here before" counts
only tournaments that were over, by that bound, before the one in question
started.

Whole tournaments are assigned by the day they ended:

| Set | Tournaments ended | Games | The two players' moves | Used for |
|---|---|---|---|---|
| Fit | up to 2024 | 233 | 10,578 | the weights |
| Selection | in 2025 | 118 | 5,733 | every choice |
| Untouched holdout | January to August 2026 | 83 | 4,240 | one blind measurement |
| Reused benchmark | September 2026 | 21 | 963 | the first version against the second |

## How it was chosen and measured

1. The weights are fitted on the fit games by maximum likelihood with a
   penalty on large weights.
2. Every choice is made on the selection games, by log loss: which of two
   families of model, the penalties, the temperature, and `κ`, `w`, `h` and
   `ε`. The other family is the first version's recipe fitted again on the
   same games.
3. The selection is committed. Then the untouched holdout and the reused
   benchmark are scored, once.

The weights that ship are the ones that were measured. They are not fitted
again on more games afterwards. The shipped tables count every selected
game, aged as of 1 November 2026.

## What was measured

**On the untouched holdout**: 83 games, 4,240 decisions that no choice
was made on. A blind measurement, made once.

| | Log loss | First choice right | In the first three | Calibration error |
|---|---|---|---|---|
| Second version | 2.205 | 34.7 % | 59.4 % | 2.9 % |
| The first version's recipe, fitted again on the same games | 2.222 | 34.6 % | 59.9 % | 4.4 % |
| Base model alone, no earlier moves | 2.382 | 29.9 % | 54.7 % | 3.5 % |
| Every legal move equally likely | 3.287 | 5.1 % | 14.2 % | |

- Where it gave its first choice 70 % or more (490 decisions) it said
  84.3 % on average and 82.0 % were played. The interval of that gap,
  -1.0 to 5.7 points, includes zero. At 90 % or more (132 decisions):
  95.6 % said, 93.2 % played.
- Against the first version's recipe with the same information, the gain is
  in the probabilities, not in the ranking: log loss -0.017
  (-0.025 to -0.009), calibration error -1.5 points
  (-2.0 to -0.5), first choice +0.1 points, first three
  -0.45 points (-0.84 to -0.05): the old recipe is a shade better at
  naming three moves, and worse at saying how sure it is.
- Accuracy is still modest: the first choice is right about one time in
  three.

The published first version was fitted on these games, so it cannot be
measured on them.

**On the reused benchmark**: the 963 decisions of September 2026 the first
version was measured on. This is not a blind measurement: those results
have been looked at, and they are the reason the second version exists.

| | Log loss | First choice right | In the first three | Calibration error | Said at 70 % and above | Played |
|---|---|---|---|---|---|---|
| Published first version | 2.549 | 28.8 % | 53.7 % | 9.5 % | 86.6 % | 54.3 % |
| Second version | 2.376 | 31.6 % | 56.8 % | 6.2 % | 83.3 % | 69.6 % |

- Log loss -0.172 (-0.209 to -0.135, by drawing whole games again),
  first choice +2.8 points (0.9 to 4.6), first three +3.1 points
  (1.5 to 4.6), calibration error -3.3 points (-5.1 to 0.0).
- **It is still too sure there.** Of 92 first choices given 70 % or more,
  it said 83.3 % and 69.6 % were played. That is less than half the first
  version's gap, and not gone. Reliability differs from one tournament to
  the next, and the holdout's better figure is not a promise about the
  match. The panel quotes both.
- 21 games is a small sample, and the intervals are wide.

**By the rule fixed beforehand**, the second version is more reliable than
the first: lower log loss on the benchmark with the interval of the
difference below zero, lower calibration error, a smaller gap at 70 % and
above, and not worse than the first version's recipe on the holdout. Its
probabilities are not claimed to be calibrated.

One further calibration step was tried on the selection games after their
reliability table had been read: a second, flatter temperature in the base
model. It lowered the selection log loss by 0.0003 against a threshold of
0.003 and was not adopted. The report has the table.

## Limits

- It is experimental. Its probabilities are not claimed to be calibrated;
  the report shows bin by bin where they are and are not.
- No look-ahead beyond one exchange: it does not see tactics two moves deep,
  which is where strong players differ most from this model.
- Nothing before 2023, and tournaments only: nothing here teaches match
  strategy, and the match-score rule is not measured.
- The tables stop at the end of October 2026. The match's own games do not
  update them.
- The benchmark on which the two versions are compared has been looked at
  before. Only the holdout measurement is blind, and the first version
  cannot be measured there because it was fitted on those games.
- It estimates what will be played, not what is best. For that there is the
  engine, which is a different thing and is labelled as one.

## Running it

```sh
node scripts/train-predictor.mjs
node scripts/train-predictor.mjs --final
```

The first command fits and chooses on the selection games and writes
`data/predictor-v2/selection.json`. The second repeats that, stops unless it
comes out identical to the committed file, and then measures and writes
`src/data/predictor.json` and `docs/PREDICTOR-REPORT.md`. Together about
sixteen minutes.

```sh
node scripts/train-predictor.mjs --measure-frozen
```

measures from the committed selection without fitting anything, after
checking that the corpora, the sets and the tournaments are the ones the
selection was made on. It writes the same two files, in under a minute.

`node scripts/train-predictor.mjs --calibration-check` repeats a further
calibration step that was tried on the selection games and not adopted.
`node scripts/train-predictor-v1.mjs` rebuilds the first version.

## In the browser

`src/data/predictor.json` (weights and tables, about 303 KiB, 13,750 positions) is loaded
with the Tahmin tab, not with the page. An estimate takes a few
milliseconds and needs no network. Nothing about the viewer is used or sent.
