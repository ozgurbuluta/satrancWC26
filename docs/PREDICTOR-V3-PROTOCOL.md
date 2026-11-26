# Predictor v3: the plan, written before any fitting

Özgür asked for the model to be reworked: more games, and some account of
what a world championship match does to the players' choices: the stakes,
the preparation, the wish to surprise, and the score. This page says what
will be tried, on which games each choice is made, and what will count as
an improvement. It was committed before any of it was fitted or measured.

## What the second version does not know

- **Theory.** Outside the positions a player has had before, it falls back
  on a model of the board that knows no openings. In an opening the player
  has not played, that is a poor guess.
- **This match.** Its tables stop in October 2026. What the two played
  against each other last week is not in them.
- **The score.** A written rule (0.35 × urgency on even trades) that nothing
  measured.
- **A match is not a tournament.** Nothing in it distinguishes a title match
  from an open.

## Data, all from the Lichess broadcast database (CC BY-SA 4.0)

One pass over the 82 monthly archives (`scripts/prepare-v3-games.py`),
standard chess from the initial position, classical by the clocks as before:

| Set | What | Used for |
|---|---|---|
| Elite | classical games between two players rated 2600 or more, without the two players' own games | what strong players play in a position |
| Faster | the two players' own rapid and blitz games, by exact FIDE ID | more of their repertoire, at a discount |
| Knockout | classical games of the FIDE World Cups 2021, 2023 and 2025, open and women | two-game matches: the second game is played knowing the score |
| Title matches | classical games of the world championship matches of 2021, 2023, 2024 and the women's of 2023 and 2025 | what a title match does to opening choice |
| This match | the games of the 2026 match as they are played, from the public broadcast | a check on games no version has seen |

The two players' classical games are the 455 of the second version,
unchanged.

## Phase 1: theory, this match, faster games

The base model's weights stay as they are (fitted on the games up to 2024).
What changes is what the estimate is blended from:

`base(m) = (theory(m) + ν · board(m)) / (all theory + ν)`

`p(m) = (own + μ · same + φ · faster + w · others + κ · base(m)) / (their sum + κ)`

- `theory(m)`: how often elite players played `m` in this position, in games
  of months before the tournament's start, aged with a half-life;
- `same`: the player's moves in earlier rounds of the same tournament. In
  the match this is the match's own earlier games, read at the time the
  page is open;
- `faster`: the player's moves in their own faster games;
- the rest as in the second version.

Chosen on the **selection games (2025)**, by log loss, one setting at a
time until nothing changes: ν (0.5, 1, 2, 5, 10, 20, or no theory), the
theory half-life (1, 2, 4 years, none), μ (0, 0.5, 1, 2, 4), φ (0, 0.1,
0.25, 0.5, 1), and again κ, w, the half-life, ε and the temperature.

The theory table is the large part of the file. It is cut by a rule fixed
here: positions that occurred fewer than `k` times are left out, with `k`
the largest of 1, 2, 3, 5, 10 that costs less than 0.002 of selection log
loss against keeping everything.

## Phase 2: the score, learned from knockouts

In a World Cup the second classical game is played by a player who must win
(lost the first), one for whom a draw is enough (won it), or two who are
level. A correction to the board model's weights is fitted for that
situation: added for the player who must win, subtracted for the one who
needs a draw. Because it enters with opposite signs for the two sides of
the same game, it cannot pick up anything that merely distinguishes World
Cup players from the two.

- Fitted on the World Cups of 2021 and 2023; penalty chosen there by
  leaving one event out; measured on the World Cup of 2025.
- It replaces the written rule only if it lowers log loss on the 2025 games
  in those situations, with the interval of the difference by game below
  zero. Otherwise the written rule stays and the report says so.
- In the match it is scaled by urgency, (opponent's points − mover's
  points) / games left. That a fourteen-game match scales this way is an
  assumption, and will be said to be one.

## Phase 3: does a title match change the opening?

On the 60 classical title-match games in the archives: how well do a
player's own earlier games, and theory, predict their first fifteen moves,
compared with the same players' tournament games of the same years? If
title matches show less repetition of the player's own lines (preparation,
surprise), the weight of the base against the player's own history (κ) gets
a multiplier for a match, chosen on those games by leaving one match out.

Sixty games is little. A multiplier is adopted only if every left-out match
agrees on its direction; otherwise this is reported as a measurement and
the model is left alone.

## Measurement

| Set | Status | What is measured |
|---|---|---|
| Selection, 2025 | choices are made here | reported as such |
| January to August 2026 | the second version was scored here once; no choice of this version is made here | v2 against v3, same decisions |
| September 2026 | looked at since the first version | v1, v2, v3, same decisions |
| The 2026 match so far | seen by no version | v2 against v3; small, and it grows by a game at a time |

Log loss, Brier, first choice, first three, calibration error and said
against played at 70 % and above, with intervals by drawing whole games
again, and each paired difference.

v3 replaces v2 on the page if its log loss is lower on January to August
2026 with the interval of the difference below zero, and its calibration
error is not higher. The label stays "Deneysel". Whatever is tried and not
adopted is listed in the report.

## Changes made on the selection games, before any other measurement

After phase 1's selection stage had run (`data/predictor-v3/selection.json`),
and before the third version was scored on anything else:

1. **The rule for cutting the theory table is replaced.** The rule above
   took the largest minimum that costs under 0.002. Every cut costs more
   than that, and the table kept whole would make the file over 4 MB. The
   rule used: of the tables that keep the whole file under 600 KB, the one
   with the lowest selection log loss, over how deep into the game theory
   goes (half-move 16, 20, 24, 30 or 40) and how many games a position
   needs (1, 2, 3 or 5).
2. **Faster games are not adopted.** They are worth 0.0007 of selection log
   loss next to theory, and would add about ten thousand positions.
3. **Other players' moves in the two players' own games are dropped**
   (`w` = 0). Theory says the same from more games; the cost is 0.0003.

## Phases 2 and 3: where they differ from the plan above

Written when the two studies were run, after phase 1 had been measured.

Phase 2 (`scripts/predictor-v3-situation.mjs`):

- "Lowers log loss on the 2025 games" was read as: lower than no correction
  at all, with the interval of that difference below zero, and lower than
  the written rule as well.
- Level second games (the first was drawn) carry no correction and are not
  in the fit.

Phase 3 (`scripts/predictor-v3-title.mjs`):

- "The same players' tournament games of the same years" became: their
  other classical events that began in the twelve months before each match.
- "Agrees on its direction" was read against those events: a multiplier is
  adopted only if every left-out choice is on the same side of what the
  same players' tournaments ask for. Measured against the page's own κ the
  left-out choices do all point one way, but the tournaments point the same
  way, so it is no habit of title matches.
- The archives before 2023 carry no FIDE IDs. There the seven players'
  games are taken by name, with a rating of 2400 or more on the game.
- The plan counted five title matches. There is a sixth, the women's match
  of January 2020, in the first month of the archives. Nothing precedes it,
  so it is not measured; its games count as earlier games of its players.
- One test is not in the plan: the weight of the same event's earlier
  games (`same`), looked at because the first run showed that players come
  back to positions of the same match more than of the same tournament.
  The question put to it: is another weight better in title matches than
  the one on the page? It is changed only if every left-out choice is on
  the same side of the page's weight.

## Limits known in advance

- Still no engine, no paid service, no viewer data.
- Knockout players are not the two finalists, and two-game matches are not
  fourteen-game matches.
- Nobody outside the two camps knows their preparation. What can be learned
  is how much less a player repeats himself in a title match, not what he
  will play instead.
- The file should stay under 600 KB and load after the page, as now.
