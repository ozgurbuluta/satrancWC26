# Predictor v2: the protocol, written before any fitting

Issue: https://github.com/ozgurbuluta/satrancWC26/issues/13

This page fixes how the second version of the move predictor is built and
measured. It was committed before any model was fitted on the new games and
before any result on them was computed. What is chosen later, and on which
games, is listed here in advance. Anything that has to change after a
holdout result has been seen will be named in the report, with the reason,
and that result will no longer be called blind.

## What is known going in

- v1 was fitted on 74 games of January to July 2026, calibrated on 9 games
  of August 2026 and measured on 21 games of September 2026 (963 decisions).
  First choice right 28.8 %, in the first three 53.7 %, log loss 2.549. It
  is too sure of itself: where it gave its first choice 70 % or more it said
  87 % and 54 % were played.
- That September measurement has been looked at, and it informed a method
  change in v1. It also motivates v2. It is a **reused benchmark** from here
  on, never a blind test.
- The cause I expect, to be checked on selection data only: v1 puts
  `log(1 + times played)` into a weighted sum and fits a weight above 1 on
  it, so a mixed repertoire is sharpened (60 / 40 becomes about 77 / 23) and
  the odds keep growing with the count. More games would make this worse,
  not better.

What has been looked at in the new data so far: counts, dates, event names,
first clock readings and time-control tags. No move of the new games has
been scored by any model.

## Data

Source: the Lichess broadcast database, https://database.lichess.org/#broadcasts,
CC BY-SA 4.0. All 82 monthly archives from January 2020 to October 2026 were
downloaded (767 MB compressed) and scanned.

- **Players by exact FIDE ID only**: 46616543 (Gukesh D) and 14205483
  (Javokhir Sindarov), in `WhiteFideId` or `BlackFideId`. Broadcasts carry
  no FIDE IDs before 2023, so there are no matches in 2020 to 2022. Games
  that match only by name (18, 302, 331, 235, 1, 38 and 7 for 2020 to 2026)
  are not used: a name does not tell Javokhir Sindarov from Islombek
  Sindarov. They are counted in the manifest and left out.
- Matches by ID: 206 (2023), 287 (2024), 470 (2025), 331 (2026, the existing
  corpus): 1,294 games of every time control.
- **Classical, by the clocks**: standard chess from the initial position
  (no `Variant` other than Standard, no `FEN`, no `SetUp`), and the larger of
  the first two clock readings at least 45 minutes. This is v1's rule,
  unchanged. A game without clock readings is left out; a time-control tag
  alone never admits a game. In the inventory the two groups are far apart:
  no game has a first reading between 31 and 58 minutes. Counts by this
  rule, before removing duplicates: 100 (2023), 136 (2024), 115 (2025),
  104 (2026): 455.
- **Duplicates**: the same white ID, black ID and sequence of moves (read
  and written as UCI) is one game. The first copy in archive order is kept.
- **The original corpus stays as it is**: `data/player-history/games.pgn`
  and its manifest (331 games of 2026, SHA-256 `ad14048d…`) are not touched.
  The earlier games go to `data/player-history/earlier/` with their own
  manifest: every archive's URL and SHA-256, counts read, matched, kept and
  left out by reason. Only games that pass the classical rule are stored
  there, as original PGN text with one tag added, `Archive`, the month of
  the archive the game came from.

### Dates and tournaments

Date tags are not reliable in this source. 263 of the 963 earlier matched
games have none or a malformed one, and several broadcasts give every game
the tournament's first day. So time is handled per tournament, not per game.

- A **tournament** is the broadcast name up to the first ` | ` (so the
  rounds of the 2025 World Cup, published as separate broadcasts, are one
  tournament). The `Event` tag is not used: some broadcasts put the pairing
  there.
- A game's date is its `Date` tag, or `UTCDate` where `Date` is missing,
  written as `YYYY.MM.DD` or `YYYY-MM-DD`, and used only if it falls in the
  game's archive month or the two months before it.
- **Start** of a tournament: its earliest such date; if it has none, the
  first day of its earliest archive month.
- **End** of a tournament: its latest such date, but not earlier than the
  first day of its latest archive month; if it has no usable date at all,
  the last day of its latest archive month.
- For the 2026 corpus, which has no `Archive` tag, the archive month is the
  month of the `Date` tag.

## Split

Whole tournaments, by the date they ended. 43 tournaments, 455 games before
duplicates are removed.

| Set | Tournaments that ended | Tournaments | Games | Gukesh | Sindarov | Used for |
|---|---|---|---|---|---|---|
| **Fit** | up to 31 December 2024 | 24 | 233 | 129 | 104 | fitting weights |
| **Selection** | in 2025 | 11 | 118 | 61 | 57 | every choice listed below |
| **Untouched holdout** | January to August 2026 | 7 | 83 | 39 | 45 | one final measurement of v2 |
| **Reused benchmark** | September 2026 | 1 | 21 | 11 | 10 | published v1 against v2, same 963 decisions |

- The German Bundesliga 2024/25 ran from September 2024 to April 2025; by
  its end date it is in Selection.
- The untouched holdout is the v1 fitting and calibration data. No decision
  about v2 has been or will be made on it. Because the published v1 was
  fitted on it, **the published v1 is not measured there**. What stands in
  for it there is the v1 recipe fitted again on the Fit games (family A
  below), which had the same information as v2.
- The reused benchmark must come out as the same 21 games and 963 decisions
  as in v1's report, and the published v1's numbers must be reproduced
  exactly by the new script. The script stops if they are not.

## What counts as "played before"

For a decision in tournament E, the earlier games are the selected games of
tournaments that **ended before E started**. Never a game of E itself, and
never a game of a tournament still running when E began. This is how the
tables are used in the match, whose own games are not in them.

- It holds in every set. Selection, holdout and benchmark decisions see all
  earlier tournaments, including earlier ones of their own set: counting
  moves is not fitting.
- Tables cover the first 40 half-moves of a game, as in v1.
- Known approximation: where every date tag of a tournament is its first
  day, its end is taken from its last archive month. Two pairs in the
  inventory depend on this; one of them (a tournament with no dates at all)
  is resolved by the last-day rule above.

## Models

**Published v1**, frozen: the weights, temperature and its own tables as
released (main `4875b39`). Measured on the reused benchmark only.

**Family A, the v1 recipe fitted again**: v1's 29 features including
`log(1 + count)` of the player's and of everyone's earlier moves, v1's
fitting (Adam, 500 steps), v1's penalty grid (0.001, 0.01 shared; 0.01,
0.05, 0.2 corrections) and one temperature. Weights on Fit; penalties and
temperature on Selection. At measurement it gets the same earlier games as
family B.

**Family B, back-off**: the planned v2.

1. A base model `q` over the legal moves from the 27 board features only
   (no repertoire features), with the shared weights, per-player
   corrections and the clock correction as in v1, and a temperature.
2. The estimate blends counts with the base model:

   `p(m) = (own(m) + w · others(m) + κ · q(m)) / (own + w · others + κ)`

   `own(m)`: times this player played `m` in this position in earlier
   games. `others(m)`: times anyone else did, in the same games. Each count
   is weighted by age, `0.5 ^ (years since that tournament ended / h)`.
3. A final mix with "every legal move equally likely": `(1 − ε) · p + ε / n`.

With few earlier games the estimate falls back on the base model; with many
it approaches the share actually played, and never beyond it.

The match-score rule of v1 (0.35 × urgency taken from even trades) stays a
written rule on the base model's scores. Nothing here measures it.

## What is chosen, and where

On the **Fit** games: the weights, by maximum likelihood with the penalties
below. Both sides' moves fit the shared weights; each player's own moves
fit that player's corrections.

On the **Selection** games only, by log loss on the two players' decisions:

| Choice | Candidates |
|---|---|
| Family | A or B |
| B: penalty on the per-player corrections | 0.01, 0.2, or no per-player corrections (shared penalty fixed at 0.001) |
| B: temperature of the base model | search between 0.5 and 3 |
| B: κ | 0.25, 0.5, 1, 2, 4, 8, 16 |
| B: w | 0, 0.05, 0.1, 0.25, 0.5, 1 |
| B: half-life h | 0.5, 1, 2, 4 years, or no ageing |
| B: ε | 0, 0.002, 0.005, 0.01, 0.02, 0.05 |
| A: penalties and temperature | as in v1 |

κ, w, h, ε and the temperature are searched one at a time, in turn, until a
full round changes nothing. The family with the lower Selection log loss
becomes v2. If that is A, v2 is A and the report says so.

Reliability tables on the Selection games may be read, and a further
calibration step may be added because of them. If one is, it is fitted on
Selection only and named in the report as an addition to this list.

Nothing is chosen on the untouched holdout or on the reused benchmark.

The weights that ship are the ones fitted on Fit. They are not fitted again
on more games after selection, so the model that is measured is the model
that ships. The shipped tables count every selected game, aged as of
1 November 2026.

## Measurement

Run once, by a separate command, after the selection is committed and
pushed. On the two players' decisions:

- log loss, Brier score, first choice right, in the first three;
- calibration error of the first choice (10 equal bins, as in v1), and the
  bins themselves;
- first choices given 70 % or more, and 90 % or more: how many, what was
  said, what was played;
- the same reliability for the three rows the page shows, pooled;
- per player, and for positions with and without earlier games;
- 95 % intervals from drawing whole games again (2,000 draws, fixed seed),
  for every number above and for each paired difference between two models
  on identical decisions.

Comparisons:

| Where | Models |
|---|---|
| Untouched holdout (blind for all three) | v2, family A fitted again, base model alone |
| Reused benchmark, 963 decisions | published v1, v2, family A fitted again |

## What may be claimed

- "More reliable than v1" only if, on the reused benchmark, v2's log loss
  is lower than the published v1's with the interval of the paired
  difference excluding zero, its calibration error is lower, and the gap
  between said and played at 70 % and above is smaller; and on the
  untouched holdout v2 is not worse than family A on log loss and
  calibration error.
- The page quotes the untouched holdout's numbers for v2, including what
  was said and what was played at 70 % and above, whatever they are.
- "Calibrated" is not claimed. The label stays "Deneysel".
- If v2 does not meet the first point, the report says so and the release
  decision is the reviewer's.

## Limits accepted in advance

- No engine, no paid service, no viewer data.
- Games before 2023 are missing because they cannot be matched by FIDE ID.
- Tournaments, not matches: nothing teaches match strategy.
- The match's own earlier games are not in the tables.
- The browser file should stay small: the target is under 300 KB.
