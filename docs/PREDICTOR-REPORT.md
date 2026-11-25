# Move predictor: what was measured

Written by `scripts/train-predictor.mjs`. Do not edit by hand; run the script.

Corpus: `data/player-history/games.pgn` (SHA-256 `ad14048d7fa6308d3752e7cdfed7ed629073f34c919bae4786c3e48b4e74e555`), from the Lichess broadcast database, CC BY-SA 4.0.

## Games

Selected 104 of 331 games: standard chess from the initial position, with the larger of the first two clock readings at least 45 minutes. Tags were not trusted over the clocks.

| Left out | Games |
|---|---|
| another variant or a set-up starting position | 14 |
| faster than classical by its first clock readings | 213 |

| Event | First game | Set | Games | Gukesh | Sindarov |
|---|---|---|---|---|---|
| Tata Steel Chess Masters | 2026.01.15 | fit | 25 | 13 | 13 |
| Prague Chess Festival 2026 \| Masters | 2026.02.19 | fit | 9 | 9 | 0 |
| FIDE Candidates Tournament 2026 | 2026.03.02 | fit | 14 | 0 | 14 |
| Super Chess Classic Romania | 2026.05.10 | fit | 9 | 0 | 9 |
| 2026 Norway Chess Open | 2026.05.24 | fit | 10 | 10 | 0 |
| Quantbox Chennai Grandmasters 2026 | 2026.07.16 | fit | 7 | 7 | 0 |
| Sinquefield Cup | 2026.08.04 | calibration | 9 | 0 | 9 |
| Olymp 2026 Open | 2026.09.16 | test | 21 | 11 | 10 |

| Set | Games | Decisions by the two players | Gukesh | Sindarov | All positions (both sides) |
|---|---|---|---|---|---|
| fit | 74 | 3761 | 2037 | 1724 | 7371 |
| calibration | 9 | 479 | 0 | 479 | 959 |
| test | 21 | 963 | 519 | 444 | 1921 |

The weights are fitted on the fitting games (both sides' moves; the two players' corrections on their own moves). The calibration games are games of one player only. "Played here before" never includes the game a position is from, and the calibration and test games count the fitting games only. The tables shipped with the site count all selected games, since for the match all of them are earlier games; no measurement here used those.

All results below are for the two players' own moves in the test games.

## First protocol: as planned, measured first

In a fitting game, "played here before" counts the fitting games of earlier days, which includes earlier rounds of the same event.

Penalties 0.001 (shared) and 0.01 (corrections), temperature 0.859, all chosen on the calibration games.

| | Decisions | First choice right | In the first three | Log loss | Brier | Calibration error |
|---|---|---|---|---|---|---|
| **The model** | 963 | 29.2 % | 53.6 % | 2.556 | 0.853 | 9.0 % |
| Without the per-player corrections | 963 | 29.0 % | 53.6 % | 2.550 | 0.851 | 8.1 % |
| Only "played here before" (ties averaged) | 963 | 6.3 % | 14.9 % | 3.350 | 0.946 | 1.0 % |
| Every legal move equally likely (ties averaged) | 963 | 4.4 % | 12.4 % | 3.398 | 0.956 | 0.0 % |

The model's moves are ranked as the site ranks them: by probability, and exactly equal ones by their UCI text. The two simple baselines give many moves exactly the same probability, so their two accuracy columns are the average over every order of the tied moves: 1/n and min(3, n)/n for n equally likely moves.

95 % intervals for the model, from drawing whole games again: first choice 26.4 % to 32.0 %, first three 50.2 % to 57.3 %.

| The model on | Decisions | First choice right | In the first three | Log loss |
|---|---|---|---|---|
| Gukesh | 519 | 26.4 % | 50.3 % | 2.614 |
| Sindarov | 444 | 32.4 % | 57.4 % | 2.489 |
| positions that also occur in the fitting games | 64 | 39.1 % | 73.4 % | 2.921 |
| positions that do not | 899 | 28.5 % | 52.2 % | 2.530 |

When the model gave its first choice a probability in the range on the left, how often that move was played:

| Said | Decisions | Average said | Played |
|---|---|---|---|
| 0 to 10 % | 83 | 8.2 % | 9.6 % |
| 10 to 20 % | 247 | 14.7 % | 15.8 % |
| 20 to 30 % | 164 | 24.6 % | 29.3 % |
| 30 to 40 % | 140 | 34.9 % | 27.9 % |
| 40 to 50 % | 96 | 44.7 % | 34.4 % |
| 50 to 60 % | 72 | 55.0 % | 40.3 % |
| 60 to 70 % | 46 | 65.0 % | 47.8 % |
| 70 to 80 % | 39 | 74.0 % | 41.0 % |
| 80 to 90 % | 24 | 84.9 % | 62.5 % |
| 90 to 100 % | 52 | 97.3 % | 61.5 % |

## Revision: exploratory, made after the first measurement

In a fitting game, "played here before" counts only games played before that game's event began. This is how the tables are used in the match, whose own games are never in them. Nothing else differs.

**This is not a blind measurement.** The change was made because the first measurement showed the model to be overconfident where lines repeat inside one event. No number of the revision was chosen on the test games, but the decision to revise was informed by them, so these results are likely to flatter the model somewhat. The probabilities are not claimed to be calibrated: the table below shows where they are not. The weights shipped with the site are the revision's.

Penalties 0.001 (shared) and 0.01 (corrections), temperature 0.852, all chosen on the calibration games.

| | Decisions | First choice right | In the first three | Log loss | Brier | Calibration error |
|---|---|---|---|---|---|---|
| **The model** | 963 | 28.8 % | 53.7 % | 2.549 | 0.854 | 9.5 % |
| Without the per-player corrections | 963 | 29.0 % | 54.4 % | 2.543 | 0.852 | 8.9 % |
| Only "played here before" (ties averaged) | 963 | 6.3 % | 14.9 % | 3.350 | 0.946 | 1.0 % |
| Every legal move equally likely (ties averaged) | 963 | 4.4 % | 12.4 % | 3.398 | 0.956 | 0.0 % |

The model's moves are ranked as the site ranks them: by probability, and exactly equal ones by their UCI text. The two simple baselines give many moves exactly the same probability, so their two accuracy columns are the average over every order of the tied moves: 1/n and min(3, n)/n for n equally likely moves.

95 % intervals for the model, from drawing whole games again: first choice 26.1 % to 31.5 %, first three 50.4 % to 57.3 %.

| The model on | Decisions | First choice right | In the first three | Log loss |
|---|---|---|---|---|
| Gukesh | 519 | 26.0 % | 50.5 % | 2.609 |
| Sindarov | 444 | 32.0 % | 57.4 % | 2.479 |
| positions that also occur in the fitting games | 64 | 39.1 % | 73.4 % | 2.769 |
| positions that do not | 899 | 28.0 % | 52.3 % | 2.533 |

When the model gave its first choice a probability in the range on the left, how often that move was played:

| Said | Decisions | Average said | Played |
|---|---|---|---|
| 0 to 10 % | 77 | 8.2 % | 3.9 % |
| 10 to 20 % | 252 | 14.7 % | 16.3 % |
| 20 to 30 % | 162 | 24.7 % | 29.0 % |
| 30 to 40 % | 135 | 34.9 % | 25.9 % |
| 40 to 50 % | 103 | 44.7 % | 35.0 % |
| 50 to 60 % | 69 | 54.7 % | 40.6 % |
| 60 to 70 % | 49 | 65.0 % | 49.0 % |
| 70 to 80 % | 38 | 73.6 % | 36.8 % |
| 80 to 90 % | 26 | 84.7 % | 65.4 % |
| 90 to 100 % | 52 | 97.1 % | 61.5 % |

## Weights of the revision

| Feature | Shared | Gukesh | Sindarov | Under clock pressure |
|---|---|---|---|---|
| knight | 0.18 | 0.03 | 0.04 | -0.16 |
| bishop | -0.12 | 0.00 | 0.05 | -0.12 |
| rook | -0.32 | -0.04 | -0.00 | 0.10 |
| queen | -0.44 | -0.02 | 0.02 | 0.14 |
| king | -0.06 | 0.05 | -0.09 | 0.13 |
| capture | 1.25 | -0.04 | 0.11 | -0.01 |
| captureValue | 3.27 | 0.05 | 0.07 | -0.01 |
| exchange | 2.22 | -0.01 | 0.07 | -0.01 |
| losesMaterial | -1.26 | 0.16 | 0.01 | 0.04 |
| recapture | 0.97 | 0.08 | -0.01 | -0.03 |
| trade | 0.39 | -0.07 | 0.04 | -0.06 |
| check | 1.37 | 0.26 | 0.02 | 0.30 |
| mate | 0.00 | 0.00 | 0.00 | 0.00 |
| castle | 2.45 | 0.05 | 0.10 | 0.00 |
| promotion | 0.29 | 0.01 | 0.02 | 0.01 |
| leftHanging | -5.71 | -0.16 | -0.15 | -0.04 |
| escape | 0.97 | -0.11 | 0.01 | -0.23 |
| threat | 1.56 | 0.01 | 0.06 | -0.09 |
| forward | 0.42 | -0.09 | 0.10 | -0.03 |
| centre | 0.94 | 0.01 | 0.06 | -0.08 |
| develop | 0.56 | 0.02 | 0.02 | 0.00 |
| pawnDouble | -0.05 | -0.05 | -0.05 | -0.07 |
| pawnAdvanced | 0.73 | 0.07 | 0.07 | 0.12 |
| kingWalk | -0.79 | -0.01 | -0.04 | 0.17 |
| kingActive | 0.97 | 0.03 | 0.03 | 0.05 |
| samePiece | 0.22 | 0.05 | -0.02 | 0.03 |
| undo | 0.57 | -0.15 | 0.06 | -0.06 |
| repPlayer | 0.70 | -0.02 | 0.09 | 0.00 |
| repAny | 2.31 | -0.05 | 0.10 | 0.00 |
