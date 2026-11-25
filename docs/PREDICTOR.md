# The move predictor

The site's own estimate of the next move of Gukesh or Sindarov: three legal
moves with a share each, and the rest as "other", at the bottom of the
Tahmin tab. It is experimental, and labelled so.

What was measured, with every table, is in
[PREDICTOR-REPORT.md](PREDICTOR-REPORT.md), which the training script writes.
This page says what the model is and what it is not.

## What it is

An original statistical model. It uses no chess engine and no weights from
anyone else. It is not an engine evaluation turned into percentages, and it
is not a count of what masters played.

For every legal move it computes a row of features that can be read off the
board in a few milliseconds (`src/lib/predictor/features.ts`):

- the piece that moves, and whether the move is a capture, a recapture, an
  even trade, a check, a mate, castling or a promotion;
- what the exchange on the destination square wins or loses, by a count of
  attackers and defenders;
- what the move leaves hanging, compared with the safest legal move, and
  whether it moves a piece out of a losing attack or creates a new threat;
- direction and place: forward or back, towards the centre, development, a
  pawn's double step, an advanced pawn, king moves with and without queens;
- whether the same piece moves again, or goes straight back;
- how often this player has played the move in this exact position before,
  and how often anyone in the data has.

A move's score is a weighted sum of its features. The scores of all legal
moves are turned into shares that add up to one (a conditional choice
model, `src/lib/predictor/model.ts`). There are four sets of weights:

| Weights | Fitted on | What they are |
|---|---|---|
| Shared | every move of the fitting games, both sides | how strong players choose in general |
| Gukesh, Sindarov | each player's own moves | a correction for that player |
| Clock | every move, in proportion to clock pressure | how choices shift as time runs out |

Clock pressure is 0 with ten minutes or more on the mover's clock and rises
to 1 as it runs down. It is taken from the clock reading the viewer can see.

## What is specific to a player

Two things were built in: the per-player corrections to the weights, and a
table of what each player played before in each position of the first 20
moves.

Measured on the test games, the corrections make no difference that can be
told from chance. The table is what is specific to a player, and it only
speaks in positions that player has had before, which means the opening.
After that the estimate is the same for both players given the same
position and clock.

## The match situation is a rule, not something learned

The earlier games are tournaments, not matches, so the data cannot teach
what a player does when behind or ahead in a match. Rather than leave the
match out, or pretend, it enters through one rule that is written down:

- urgency = (opponent's points − mover's points) / games left, counting the
  game in progress, between −1 and 1;
- a move that is an even trade of pieces has `0.35 × urgency` taken from its
  score.

So a player who is behind is taken to avoid even trades a little, and one
who is ahead to welcome them a little. The number 0.35 was chosen, not
fitted, and nothing here measures whether the rule is right. Early in a
14-game match the urgency is close to zero and the rule changes almost
nothing. The panel says that this is a rule and how strongly it applies.

The score used is the score before the open game, from earlier games only.
The open game's own result and anything played later never reach it, also
while the viewer is paused.

## Data

`data/player-history/games.pgn`: 331 games of the two players from the
Lichess broadcast database, January to October 2026, licensed CC BY-SA 4.0
(see `data/player-history/README.md` and `manifest.json` for the sources and
checksums). Nothing from the championship match is in it.

`scripts/train-predictor.mjs` selects from it by what the clocks show, not by
tags: standard chess from the initial position, with the larger of the first
two clock readings at least 45 minutes. That leaves 104 classical games.
Whole events are assigned by the month of their first game:

| Set | Events | Games | The two players' moves |
|---|---|---|---|
| Fitting | January to July | 74 | 3,761 |
| Calibration | August (Sinquefield Cup, Sindarov only) | 9 | 479 |
| Test | September (Olympiad) | 21 | 963 |

## How it was fitted and measured

1. The weights are fitted on the fitting games by maximum likelihood with a
   penalty on large weights.
2. The strength of the penalties and one temperature are chosen on the
   calibration games.
3. The test games are used to measure, not to choose.

"Played here before" never includes the game a position is from. In the
calibration and test games it counts the fitting games only. The tables that
ship with the site count all 104 games, since for the match all of them are
earlier games; no measurement used those tables.

There are two measurements, and both are kept.

**The first protocol** is the one that was planned. In it, a fitting game
counts the fitting games of earlier days, which includes earlier rounds of
the same event. On the 963 test moves its first choice was right 29.2 % of
the time and the move was among its first three 53.6 % of the time, against
about 5 % and 14 % for "every legal move equally likely". It was also
overconfident: of the first choices it gave 90 % or more, 61.5 % were played.

**The revision** changes one thing: a fitting game counts only games played
before its own event began. That is how the tables are used in the match,
whose own games are never in them. The change was made after the first
measurement had been seen, because lines repeat inside one event and the
first protocol had learned to trust that. No number of the revision is
chosen on the test games, but the decision to revise was informed by them.
**Its measurement is therefore exploratory, not blind, and is likely to
flatter the model somewhat.** The shipped weights are the revision's, and
the panel quotes its numbers with that caveat.

**What the revision changed: little.** First choice right 28.8 % (first
protocol 29.2 %), in the first three 53.7 % (53.6 %), log loss 2.549
(2.556). The differences are well inside the intervals. The overconfidence
did not go away: where the revision gave its first choice 70 % or more it
said 87 % on average and 54 % of those moves were played, and of the moves
it gave 90 % or more, 61.5 % were played, the same as before. So the reason
given for the revision explains only a small part of the problem, on the 64
test positions that also occur in the fitting games. Where the rest comes
from has not been established, and no further change was made after looking
at the test games.

Neither protocol's probabilities are claimed to be calibrated. The report
shows, bin by bin, where they are not, and the panel says so in plain words
next to the percentages.

## Limits

- 104 games and one test event. The intervals in the report are wide.
- The calibration games are nine games of one player.
- No look-ahead beyond one exchange: it does not see tactics two moves deep,
  which is where strong players differ most from this model.
- The tables stop at the end of October 2026. The match's own games do not
  update them.
- It estimates what will be played, not what is best. For that there is the
  engine, which is a different thing and is labelled as one.

## Running it

```sh
node scripts/train-predictor.mjs
```

It reads the corpus, runs both protocols, and writes `src/data/predictor.json`
and `docs/PREDICTOR-REPORT.md`. The same corpus gives the same files.

## In the browser

`src/data/predictor.json` (weights and tables, about 130 KB) is loaded with
the Tahmin tab, not with the page. An estimate takes a few milliseconds and
needs no network. Nothing about the viewer is used or sent.
