# The move predictor

The site's own estimate of the next move of Gukesh or Sindarov: three legal
moves with a share each, and the rest as "other", on the main page under
the board. It is experimental. Until 26 November 2026 the page said so in a
"Deneysel" label beside the title; Özgür had the label taken off, and since
then the estimate is also shown at once in guess mode instead of waiting
for the viewer's guess. Nothing that is claimed about it changed with
that: its probabilities are not claimed to be calibrated. The page itself
carries no explanation of it any more: what it is, how it was measured and where it
falls short is on this page and in the report.

This is its third version: the second version's model of the board, with
opening theory and the match's own games laid over it. That part is
described first, below; the rest of the page is the second version, which
is still what the board model is. Reports, each written by the training
script: [third](PREDICTOR-V3-REPORT.md), [second](PREDICTOR-REPORT.md),
[first](PREDICTOR-REPORT-V1.md). The plans written before each was fitted:
[third](PREDICTOR-V3-PROTOCOL.md), [second](PREDICTOR-V2-PROTOCOL.md).

## Third version: theory, and this match

The second version knew no openings. Where a player had not been in a
position before, it fell back on a model that looks at the board and
nothing else, which in an opening is a poor guess. And it knew nothing of
the match it is used on.

Two things are laid over the board model now:

`base(move) = (theory + ν · board) / (all theory + ν)`

`p(move) = (own + μ · same + κ · base) / (all own + μ · all same + κ)`

- `theory`: how often players rated 2600 or more played the move in this
  position, in 10,761 classical games since 2020 (the two players' own games
  left out), newer games counting for more;
- `own`: how often this player did, in earlier tournaments, as before;
- `same`: how often this player did in the earlier games of this match. The
  page reads those from the broadcast as they are played; nothing of the
  open game or a later one is used.

Chosen on the 2025 games: ν 0.5 (theory is trusted from very few games), a
theory half-life of 4 years, μ 2, κ 2, and the player's own games now halving
every 0.5 years, so the last months dominate.

**The theory table is cut to fit.** Whole, it has 243,288 positions and
would make the file over 4 MB. It is kept for the first 12 moves, for
positions that occurred at least twice: 21,100 positions. That costs about a
quarter of what theory is worth (selection log loss 2.151 against 2.122
whole, and 2.245 for the second version). The file is 590 KB and loads
after the page.

**Measured**, the second version beside it on the same decisions:

| | Decisions | Log loss | First choice right | In the first three | Calibration error |
|---|---|---|---|---|---|
| January to August 2026, third | 4,240 | 2.125 | 36.5 % | 61.2 % | 3.4 % |
| January to August 2026, second | 4,240 | 2.205 | 34.7 % | 59.4 % | 2.9 % |
| September 2026, third | 963 | 2.299 | 33.7 % | 59.0 % | 6.5 % |
| September 2026, second | 963 | 2.376 | 31.6 % | 56.8 % | 6.2 % |
| The match so far (2 games), third | 116 | 2.038 | 31.0 % | 60.3 % | |
| The match so far, second | 116 | 2.290 | 22.4 % | 56.0 % | |

- On January to August 2026 the difference in log loss is -0.080
  (-0.104 to -0.058, by drawing whole games again), and the first
  choice is right 1.8 points more often. All of it comes from the first twelve
  moves; after that the two versions are the same model.
- **Calibration error is not better**: 3.4 % against 2.9 %, a difference of
  +0.5 points whose interval (-0.2 to 1.2) includes zero. The rule
  written beforehand asked for lower log loss and a calibration error that
  is not higher. The first is met, the second is not, by the point
  estimate. By that rule alone the third version would not replace the
  second; whether it goes on the page is Özgür's decision.
- The January to August games are not untouched for this version: the
  second version's result on them had been seen. The match games are
  unseen by any version, and they are two games.

Tried on the 2025 games and not adopted: the two players' rapid and blitz
games (worth 0.0007 of log loss, for ten thousand more positions), and
other players' moves in the two players' own games (theory says the same
from more games).

### The score of the match, and the title match itself

Özgür asked what a world championship does to the players' choices: the
stakes, the preparation, the wish to surprise, the score. Two studies were
made of what the archives can say about that. Numbers and tables are in
the [report](PREDICTOR-V3-REPORT.md).

**The score, learned.** In a FIDE World Cup the second game of a two-game
match is played by one who must win and one for whom a draw is enough: 468
such games in 2021, 2023 and 2025. A correction to the board model's
weights was fitted on the first two and measured on 2025. It lowers log
loss by 0.0007 (0.0002 to 0.0012), which met the rule set beforehand, so it
replaces the written rule of the first two versions (0.35 off an even
trade), which did nothing that can be measured. The effect is very small: a
player who must win takes a little less and goes back with a piece a
little less. At its strongest a capture becomes about 4 % less likely. On
the page it is scaled by urgency (see below), and with the score level it
does nothing.

**The title match.** Five title matches since 2021 (60 games), beside the
same players' other events of the year before each:

- In a title match a player is in a position he has had before a little
  less often (20 % of his first fifteen moves against 23 %), repeats his
  most played move there a little less often (67 % against 69 %), and leaves
  his own earlier games a little sooner (move 3.9 against 4.3). In three of
  the five matches he repeats himself less than in his tournaments, in two
  more. The weight that predicts best is the same in both. Nothing was
  changed for it.
- What does differ is inside the match: a player is back in a position of
  an earlier game of the same match twice as often as within a tournament
  (15 % against 8 %), and then repeats his move 81 % of the time against
  70 %. The weight the page gives those games (2) turned out to be the one
  the title matches ask for, so that stays too.

What none of this can see is what a camp has prepared and not yet played.
A new line is new to the tables as well.

## Second version: the model of the board and the player's own games


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

## The score of the match

The earlier games of the two are tournaments, not matches, so they cannot
teach what a player does when behind or ahead in a match. The first two
versions had a written rule instead. The third has a correction learned
from other players' knockout matches (above):

- urgency = (opponent's points − mover's points) / games left, counting the
  game in progress, between −1 and 1;
- each feature of a move has a small weight, and `urgency × (weights ·
  features)` is added to the move's score in the base model. The weights
  are in `data/predictor-v3/situation.json` and in the model file.

In the knockout games the urgency is 1 for the player who must win the last
game and −1 for the other. That a fourteen-game match scales between those
by points behind per game left is an assumption, not something measured.
Early in the match the urgency is close to zero and the correction changes
almost nothing.

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
- The two players' own games are from 2023 on, and tournaments only. What
  the score does to a move comes from other players' two-game knockout
  matches, and it is small.
- The tables stop at the end of October 2026. The match's own games do not
  update them.
- The benchmark on which the two versions are compared has been looked at
  before. Only the holdout measurement is blind, and the first version
  cannot be measured there because it was fitted on those games.
- It estimates what will be played, not what is best. For that there is the
  engine, which is a different thing and is labelled as one.

## Running it

The third version sits on top of the second, so the second's committed
selection has to be in place. Then:

```sh
python3 scripts/prepare-v3-games.py
node scripts/train-predictor.mjs --v3
node scripts/train-predictor.mjs --v3-situation
node scripts/train-predictor.mjs --v3-title
node scripts/train-predictor.mjs --v3 --final
```

The first reads the archives once (cached, about 770 MB) for the elite,
knockout and title-match games and the games of the title matches' players.
The second makes the third version's choices on the 2025 games and writes
`data/predictor-v3/selection.json`. The third and fourth are the two
studies: they write `data/predictor-v3/situation.json` and
`data/predictor-v3/title-matches.json`. The last repeats the selection,
stops unless it comes out identical, measures, and writes
`src/data/predictor.json` and `docs/PREDICTOR-V3-REPORT.md`. About two
minutes each.

For the second version alone (these write the second version's model file
over the third's; run the two `--v3` commands again afterwards):


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

`src/data/predictor.json` (weights and the two tables, about 590 KB) is
loaded after the page, with the card under the board. An estimate takes a
few milliseconds and needs no network. Nothing about the viewer is used or
sent.
