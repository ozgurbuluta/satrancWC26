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
| Prague Chess Festival 2026 | Masters | 2026.02.19 | fit | 9 | 9 | 0 |
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

The weights were fitted on the fitting games (both sides' moves; the two players' corrections on their own moves). "Played here before" never includes the game a position is from: a fitting game counts the fitting games of earlier days, and the calibration and test games count the fitting games only. The tables shipped with the site count all selected games, since for the match all of them are earlier games; no measurement here used those. The penalties (0.001 shared, 0.01 corrections) and the temperature (0.859) were chosen on the calibration games, which are games of one player only. The test games were used once, for the tables below.

## Test games: the two players' own moves

| | Decisions | First choice right | In the first three | Log loss | Brier | Calibration error |
|---|---|---|---|---|---|---|
| **The model** | 963 | 29.2 % | 53.6 % | 2.556 | 0.853 | 9.0 % |
| Without the per-player corrections | 963 | 29.0 % | 53.6 % | 2.550 | 0.851 | 8.1 % |
| Only "played here before" | 963 | 7.3 % | 17.1 % | 3.350 | 0.946 | 2.0 % |
| Every legal move equally likely | 963 | 5.2 % | 14.3 % | 3.398 | 0.956 | 1.2 % |

95 % intervals for the model, from drawing whole games again: first choice 26.4 % to 32.0 %, first three 50.2 % to 57.3 %.

| The model on | Decisions | First choice right | In the first three | Log loss |
|---|---|---|---|---|
| Gukesh | 519 | 26.4 % | 50.3 % | 2.614 |
| Sindarov | 444 | 32.4 % | 57.4 % | 2.489 |
| positions that also occur in the fitting games | 64 | 39.1 % | 73.4 % | 2.921 |
| positions that do not | 899 | 28.5 % | 52.2 % | 2.530 |

## Calibration on the test games

When the model gave its first choice a probability in the range on the left, how often that move was played.

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

## Weights

| Feature | Shared | Gukesh | Sindarov | Under clock pressure |
|---|---|---|---|---|
| knight | 0.17 | 0.03 | 0.04 | -0.16 |
| bishop | -0.12 | 0.00 | 0.05 | -0.13 |
| rook | -0.32 | -0.04 | -0.00 | 0.10 |
| queen | -0.44 | -0.02 | 0.02 | 0.14 |
| king | -0.07 | 0.05 | -0.09 | 0.13 |
| capture | 1.25 | -0.04 | 0.12 | -0.01 |
| captureValue | 3.26 | 0.05 | 0.07 | -0.01 |
| exchange | 2.22 | -0.01 | 0.07 | -0.01 |
| losesMaterial | -1.26 | 0.16 | 0.01 | 0.04 |
| recapture | 0.98 | 0.08 | -0.00 | -0.04 |
| trade | 0.39 | -0.07 | 0.04 | -0.06 |
| check | 1.37 | 0.26 | 0.02 | 0.30 |
| mate | 0.00 | 0.00 | 0.00 | 0.00 |
| castle | 2.44 | 0.05 | 0.10 | 0.00 |
| promotion | 0.29 | 0.01 | 0.02 | 0.01 |
| leftHanging | -5.70 | -0.16 | -0.15 | -0.04 |
| escape | 0.97 | -0.11 | 0.01 | -0.22 |
| threat | 1.56 | 0.01 | 0.06 | -0.08 |
| forward | 0.43 | -0.09 | 0.10 | -0.04 |
| centre | 0.92 | 0.01 | 0.06 | -0.07 |
| develop | 0.56 | 0.02 | 0.02 | 0.00 |
| pawnDouble | -0.08 | -0.05 | -0.05 | -0.06 |
| pawnAdvanced | 0.72 | 0.07 | 0.07 | 0.12 |
| kingWalk | -0.78 | -0.02 | -0.04 | 0.17 |
| kingActive | 0.98 | 0.03 | 0.03 | 0.05 |
| samePiece | 0.22 | 0.05 | -0.02 | 0.03 |
| undo | 0.57 | -0.15 | 0.05 | -0.06 |
| repPlayer | 0.74 | -0.02 | 0.09 | 0.00 |
| repAny | 2.56 | -0.05 | 0.11 | 0.00 |
