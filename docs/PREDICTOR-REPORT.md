# Move predictor, second version: what was measured

Written by `scripts/train-predictor.mjs` (with `--final` or `--measure-frozen`). Do not edit by hand; run the script.

How this was to be done was written down before any fitting: [PREDICTOR-V2-PROTOCOL.md](PREDICTOR-V2-PROTOCOL.md). The first version's own report is [PREDICTOR-REPORT-V1.md](PREDICTOR-REPORT-V1.md).

Source of every game: the Lichess broadcast database, CC BY-SA 4.0.

## Games

Selected: standard chess from the initial position, with the larger of the first two clock readings at least 45 minutes. Tags were not trusted over the clocks. Players by exact FIDE ID.

| Corpus | SHA-256 | Games | Selected | Left out |
|---|---|---|---|---|
| `data/player-history/games.pgn` | `ad14048d7fa6308d…` | 331 | 104 | 14 another variant or a set-up starting position; 213 faster than classical by its first clock readings |
| `data/player-history/earlier/games.pgn` | `a36ea69c64954881…` | 351 | 351 | none |

Whole tournaments, by the day they ended (the last day of their latest archive month, an upper bound).

| Set | Tournaments | Games | Decisions by the two players | Gukesh | Sindarov | In positions the player has had before |
|---|---|---|---|---|---|---|
| Fit | 24 | 233 | 10578 | 5965 | 4613 | 683 |
| Selection | 11 | 118 | 5733 | 3124 | 2609 | 492 |
| Untouched holdout | 7 | 83 | 4240 | 2037 | 2203 | 396 |
| Reused benchmark | 1 | 21 | 963 | 519 | 444 | 89 |

| Tournament | Set | Starts | Ends by | Games | Gukesh | Sindarov |
|---|---|---|---|---|---|---|
| Tata Steel Challengers 2023 | Fit | 2023-01-27 | 2023-01-31 | 3 | 0 | 3 |
| Tata Steel Masters 2023 | Fit | 2023-01-27 | 2023-01-31 | 3 | 3 | 0 |
| Menorca Open 2023 | Fit | 2023-04-11 | 2023-04-30 | 5 | 5 | 0 |
| 2023 TePe Sigeman & Co | Fit | 2023-05-04 | 2023-05-31 | 7 | 7 | 0 |
| Dubai Open 2023 - Group A | Fit | 2023-05-27 | 2023-06-30 | 8 | 0 | 8 |
| Norway Chess 2023 | Fit | 2023-05-30 | 2023-06-30 | 2 | 2 | 0 |
| FIDE World Cup 2023 Open Section | Fit | 2023-07-30 | 2023-08-31 | 18 | 10 | 8 |
| 2023 Abu Dhabi Chess Festival | Fit | 2023-08-16 | 2023-08-31 | 8 | 0 | 8 |
| Qatar Masters 2023 | Fit | 2023-10-11 | 2023-10-31 | 18 | 9 | 9 |
| FIDE Grand Swiss 2023 | Fit | 2023-10-25 | 2023-11-30 | 22 | 11 | 11 |
| Chennai Grand Masters 2023 | Fit | 2023-12-15 | 2023-12-31 | 6 | 6 | 0 |
| Tata Steel Masters 2024 | Fit | 2024-01-13 | 2024-01-31 | 13 | 13 | 0 |
| Prague Chess Festival 2024 | Fit | 2024-02-27 | 2024-03-31 | 9 | 9 | 0 |
| FIDE Candidates 2024 | Fit | 2024-04-04 | 2024-04-30 | 14 | 14 | 0 |
| Dubai Police Global Chess Challenge Masters | Fit | 2024-05-04 | 2024-05-31 | 8 | 0 | 8 |
| Sharjah | Fit | 2024-05-14 | 2024-05-31 | 3 | 0 | 3 |
| UzChess Cup 2024 | Fit | 2024-06-06 | 2024-06-30 | 9 | 0 | 9 |
| Superbet Romania Chess Classic 2024 | Fit | 2024-06-26 | 2024-07-31 | 9 | 9 | 0 |
| 30th Abu Dhabi Chess Festival 2024 | Fit | 2024-08-15 | 2024-08-31 | 9 | 0 | 9 |
| 45th Chess Olympiad Budapest 2024 | Fit | 2024-09-12 | 2024-09-30 | 20 | 10 | 10 |
| German Bundesliga 2024/25 | Selection | 2024-09-28 | 2025-04-30 | 14 | 0 | 14 |
| WR Chess Masters Cup 2024 | Fit | 2024-10-14 | 2024-10-31 | 2 | 0 | 2 |
| European Chess Club Cup | Fit | 2024-10-20 | 2024-10-31 | 14 | 7 | 7 |
| 3rd International President Cup Tashkent 2024 | Fit | 2024-11-21 | 2024-11-30 | 9 | 0 | 9 |
| FIDE World Championship 2024 | Fit | 2024-11-25 | 2024-12-31 | 14 | 14 | 0 |
| Tata Steel Chess 2025 | Selection | 2025-01-18 | 2025-02-28 | 13 | 13 | 0 |
| GCT: 2025 Superbet Classic Romania | Selection | 2025-05-07 | 2025-05-31 | 9 | 9 | 0 |
| TePe Sigeman & Co Chess Tournament 2025 | Selection | 2025-05-20 | 2025-05-31 | 7 | 0 | 7 |
| Norway Chess 2025 | Selection | 2025-05-21 | 2025-06-30 | 10 | 10 | 0 |
| 2nd Uzchess Cup | Selection | 2025-06-18 | 2025-06-30 | 9 | 0 | 9 |
| GCT: Sinquefield Cup 2025 | Selection | 2025-08-01 | 2025-08-31 | 9 | 9 | 0 |
| FIDE Grand Swiss 2025 | Selection | 2025-08-26 | 2025-09-30 | 22 | 11 | 11 |
| German Bundesliga 2025/26 | Selection | 2025-09-27 | 2025-09-30 | 2 | 0 | 2 |
| European Chess Club Cup 2025 | Selection | 2025-10-18 | 2025-10-31 | 5 | 5 | 0 |
| FIDE World Cup 2025 | Selection | 2025-10-27 | 2025-11-30 | 18 | 4 | 14 |
| Tata Steel Chess 2026 | Untouched holdout | 2026-01-15 | 2026-02-28 | 25 | 13 | 13 |
| Prague International Chess Festival 2026 | Untouched holdout | 2026-02-19 | 2026-03-31 | 9 | 9 | 0 |
| FIDE Candidates 2026: Open | Untouched holdout | 2026-03-02 | 2026-04-30 | 14 | 0 | 14 |
| GCT: Super Chess Classic Romania 2026 | Untouched holdout | 2026-05-10 | 2026-05-31 | 9 | 0 | 9 |
| Norway Chess 2026 | Untouched holdout | 2026-05-24 | 2026-06-30 | 10 | 10 | 0 |
| Chennai Grand Masters 2026 | Untouched holdout | 2026-07-16 | 2026-07-31 | 7 | 7 | 0 |
| GCT: Sinquefield Cup 2026 | Untouched holdout | 2026-08-04 | 2026-08-31 | 9 | 0 | 9 |
| 46th FIDE Chess Olympiad Samarkand 2026 | Reused benchmark | 2026-09-16 | 2026-09-30 | 21 | 11 | 10 |

"Played here before", for a decision in one tournament, counts the tournaments that were over before it started, by these bounds. A tournament that ends in the month the next one starts is therefore not counted for it, although it may have been over. These pairs share a player and are left out for that reason:

- 2023 TePe Sigeman & Co (ends by 2023-05-31) for Norway Chess 2023 (starts 2023-05-30)
- FIDE World Cup 2023 Open Section (ends by 2023-08-31) for 2023 Abu Dhabi Chess Festival (starts 2023-08-16)
- Qatar Masters 2023 (ends by 2023-10-31) for FIDE Grand Swiss 2023 (starts 2023-10-25)
- Dubai Police Global Chess Challenge Masters (ends by 2024-05-31) for Sharjah (starts 2024-05-14)
- 45th Chess Olympiad Budapest 2024 (ends by 2024-09-30) for German Bundesliga 2024/25 (starts 2024-09-28)
- WR Chess Masters Cup 2024 (ends by 2024-10-31) for European Chess Club Cup (starts 2024-10-20)
- GCT: 2025 Superbet Classic Romania (ends by 2025-05-31) for Norway Chess 2025 (starts 2025-05-21)
- GCT: Sinquefield Cup 2025 (ends by 2025-08-31) for FIDE Grand Swiss 2025 (starts 2025-08-26)
- FIDE Grand Swiss 2025 (ends by 2025-09-30) for German Bundesliga 2025/26 (starts 2025-09-27)
- European Chess Club Cup 2025 (ends by 2025-10-31) for FIDE World Cup 2025 (starts 2025-10-27)
- Tata Steel Chess 2026 (ends by 2026-02-28) for Prague International Chess Festival 2026 (starts 2026-02-19)

## What was chosen, on the selection games only

Weights were fitted on the fit games. Every choice below was made by log loss on the two players' 5733 decisions in the selection games.

Family A, the first version's recipe fitted again:

| Shared penalty | Corrections penalty | Log loss at temperature 1 |
|---|---|---|
| 0.001 | 0.01 | 2.2660 |
| 0.001 | 0.05 | 2.2667 |
| 0.001 | 0.2 | 2.2671 |
| 0.01 | 0.01 | 2.3178 |
| 0.01 | 0.05 | 2.3324 |
| 0.01 | 0.2 | 2.3369 |

Chosen: 0.001 and 0.01, then temperature 0.981: log loss 2.2658.

Family B, counts of earlier moves blended with a base model:

| Base model | Temperature | κ | Others | Half-life | ε | Log loss | Base model alone |
|---|---|---|---|---|---|---|---|
| corrections 0.01 | 0.971 | 0.5 | 0.5 | 4 | 0.005 | 2.2449 | 2.4054 |
| corrections 0.2 | 0.963 | 0.5 | 0.5 | 4 | 0.005 | 2.2455 | 2.4067 |
| no per-player corrections, clock 0.01 | 0.962 | 0.5 | 0.5 | 4 | 0.005 | 2.2450 | 2.4056 |
| no per-player corrections, clock 0.2 | 0.962 | 0.5 | 0.5 | 4 | 0.005 | 2.2456 | 2.4069 |

Chosen: corrections 0.01: log loss 2.2449.

**The second version is family B**, the one with the lower log loss on the selection games. Temperature 0.971, κ 0.5, weight of others' moves 0.5, half-life 4 years, ε 0.005; per-player corrections: yes, penalty 0.01; clock correction penalty 0.01.

| | Decisions | Log loss | Brier | First choice right | In the first three | Calibration error |
|---|---|---|---|---|---|---|
| **Second version** | 5733 | 2.245 | 0.787 | 33.5 % | 58.7 % | 3.1 % |
| Family A: the first version's recipe fitted again | 5733 | 2.266 | 0.795 | 33.1 % | 58.6 % | 4.0 % |
| Base model alone (no earlier moves) | 5733 | 2.405 | 0.831 | 28.8 % | 54.6 % | 4.2 % |
| Every legal move equally likely (ties averaged) | 5733 | 3.300 | 0.950 | 5.0 % | 14.1 % | 0.0 % |

| First choices | given 70 % or more | said | played | given 90 % or more | said | played |
|---|---|---|---|---|---|---|
| **Second version** | 674 | 84.2 % | 79.5 % | 200 | 96.0 % | 92.5 % |
| Family A: the first version's recipe fitted again | 718 | 86.9 % | 76.0 % | 310 | 96.5 % | 86.5 % |

The second version on the selection games: when it gave its first choice a probability in the range on the left, how often that move was played.

| Said | Decisions | Average said | Played |
|---|---|---|---|
| 0 to 10 % | 544 | 8.3 % | 13.8 % |
| 10 to 20 % | 1526 | 14.7 % | 16.3 % |
| 20 to 30 % | 1061 | 24.7 % | 23.5 % |
| 30 to 40 % | 705 | 34.6 % | 32.2 % |
| 40 to 50 % | 506 | 45.1 % | 44.5 % |
| 50 to 60 % | 414 | 54.5 % | 48.3 % |
| 60 to 70 % | 303 | 64.9 % | 52.8 % |
| 70 to 80 % | 264 | 74.8 % | 69.3 % |
| 80 to 90 % | 210 | 84.9 % | 80.0 % |
| 90 to 100 % | 200 | 96.0 % | 92.5 % |

These are the games the choices were made on, so these numbers flatter the model. They are here to show what was seen when choosing.

### One more calibration step, tried and not adopted

The table above shows the second version a little too sure between 50 and 100 % and a little too unsure below 20 %, on the very games it was chosen on. One temperature cannot correct both ends, so a second, flatter temperature mixed into the base model was tried, on the selection games only (`node scripts/train-predictor.mjs --calibration-check`, 20 combinations, every other setting searched again for each). The rule was to adopt it only if the selection log loss fell by at least 0.003; that threshold was set before the comparison was run, but was not published before it.

| | Log loss | Calibration error | Given 70 % or more | said | played |
|---|---|---|---|---|---|
| As selected | 2.2449 | 3.1 % | 674 | 84.2 % | 79.5 % |
| Best with two temperatures (share 0.1 at temperature 1.5) | 2.2446 | 3.2 % | 674 | 84.0 % | 79.4 % |

The gain is 0.0003. It was not adopted, and the model is as selected above. The remaining gap between said and played is left as it is and reported, not tuned away.

## Untouched holdout: a blind measurement

83 games of January to August 2026, 4240 decisions. No choice was made on these games, and they were scored once. The published first version was fitted on these very games, so it is not measured here; family A, fitted on the same earlier games as the second version, stands beside it instead.

| | Decisions | Log loss | Brier | First choice right | In the first three | Calibration error |
|---|---|---|---|---|---|---|
| **Second version** | 4240 | 2.205 | 0.775 | 34.7 % | 59.4 % | 2.9 % |
| Family A: the first version's recipe fitted again | 4240 | 2.222 | 0.781 | 34.6 % | 59.9 % | 4.4 % |
| Base model alone (no earlier moves) | 4240 | 2.382 | 0.824 | 29.9 % | 54.7 % | 3.5 % |
| Every legal move equally likely (ties averaged) | 4240 | 3.287 | 0.949 | 5.1 % | 14.2 % | 0.0 % |

The second version, with intervals from drawing whole games again (83 games, 2,000 draws):

| | 95 % interval |
|---|---|
| Log loss | 2.155 to 2.254 |
| Brier | 0.763 to 0.786 |
| First choice right | 33.2 % to 36.3 % |
| In the first three | 57.7 % to 61.1 % |
| Calibration error | 2.3 % to 4.4 % |

The second version minus Family A: the first version's recipe fitted again, on the same decisions and the same draws. Below zero is better for log loss, Brier and calibration error:

| Second version minus the other family | Difference | 95 % interval |
|---|---|---|
| Log loss | -0.017 | -0.025 to -0.009 |
| Brier | -0.006 | -0.009 to -0.003 |
| First choice right | 0.1 % | -0.3 % to 0.6 % |
| In the first three | -0.4 % | -0.8 % to -0.0 % |
| Calibration error | -1.5 % | -2.0 % to -0.5 % |

| First choices | given 70 % or more | said | played | given 90 % or more | said | played |
|---|---|---|---|---|---|---|
| **Second version** | 490 | 84.3 % | 82.0 % | 132 | 95.6 % | 93.2 % |
| Family A: the first version's recipe fitted again | 551 | 86.8 % | 77.0 % | 250 | 95.9 % | 88.4 % |

Said minus played at 70 % and above, second version: 2.3 % (95 % interval -1.0 % to 5.7 %).

The second version: its first choice.

| Said | Decisions | Average said | Played |
|---|---|---|---|
| 0 to 10 % | 434 | 8.2 % | 12.4 % |
| 10 to 20 % | 1176 | 14.6 % | 18.5 % |
| 20 to 30 % | 788 | 24.8 % | 25.5 % |
| 30 to 40 % | 489 | 34.3 % | 35.4 % |
| 40 to 50 % | 349 | 45.1 % | 41.8 % |
| 50 to 60 % | 275 | 54.4 % | 50.2 % |
| 60 to 70 % | 239 | 64.6 % | 59.0 % |
| 70 to 80 % | 176 | 75.3 % | 73.3 % |
| 80 to 90 % | 182 | 84.8 % | 82.4 % |
| 90 to 100 % | 132 | 95.6 % | 93.2 % |

Family A: the first version's recipe fitted again: its first choice.

| Said | Decisions | Average said | Played |
|---|---|---|---|
| 0 to 10 % | 512 | 8.1 % | 11.5 % |
| 10 to 20 % | 1153 | 14.7 % | 20.0 % |
| 20 to 30 % | 856 | 24.7 % | 26.2 % |
| 30 to 40 % | 469 | 34.5 % | 37.7 % |
| 40 to 50 % | 270 | 45.0 % | 43.3 % |
| 50 to 60 % | 249 | 54.9 % | 48.6 % |
| 60 to 70 % | 180 | 64.8 % | 62.8 % |
| 70 to 80 % | 174 | 75.1 % | 60.9 % |
| 80 to 90 % | 127 | 84.8 % | 76.4 % |
| 90 to 100 % | 250 | 95.9 % | 88.4 % |

The second version: the three rows the page shows, pooled. For each row, what it said and whether that move was played.

| Said | Decisions | Average said | Played |
|---|---|---|---|
| 0 to 10 % | 5604 | 6.4 % | 8.1 % |
| 10 to 20 % | 3519 | 14.0 % | 16.7 % |
| 20 to 30 % | 1390 | 24.4 % | 26.0 % |
| 30 to 40 % | 723 | 34.3 % | 35.7 % |
| 40 to 50 % | 409 | 44.9 % | 41.6 % |
| 50 to 60 % | 280 | 54.3 % | 50.7 % |
| 60 to 70 % | 239 | 64.6 % | 59.0 % |
| 70 to 80 % | 176 | 75.3 % | 73.3 % |
| 80 to 90 % | 182 | 84.8 % | 82.4 % |
| 90 to 100 % | 132 | 95.6 % | 93.2 % |

Calibration error of the three rows shown: 2.2 % (1.7 % to 2.8 %).

| The second version on | Decisions | Log loss | First choice right | In the first three | Calibration error |
|---|---|---|---|---|---|
| Gukesh | 2037 | 2.275 | 33.1 % | 57.9 % | 2.6 % |
| Sindarov | 2203 | 2.140 | 36.2 % | 60.8 % | 3.3 % |
| positions the player has had before, by the tables | 396 | 0.968 | 68.7 % | 91.4 % | 5.2 % |
| positions the player has not | 3844 | 2.333 | 31.2 % | 56.1 % | 3.3 % |

## Reused benchmark: not a blind measurement

The 21 games of September 2026, 963 decisions: the ones the first version was measured on. That measurement has been looked at, it led to a change in the first version, and it is the reason the second version exists. Nothing was chosen on these games for the second version either, but they are not a fresh test.

The published first version is scored with its released weights and temperature and with the tables its published numbers were measured with, its 74 fitting games. Its released file's tables, which contain these 21 games, are not used. The script stops unless this reproduces the published numbers.

| | Decisions | Log loss | Brier | First choice right | In the first three | Calibration error |
|---|---|---|---|---|---|---|
| Published first version | 963 | 2.549 | 0.854 | 28.8 % | 53.7 % | 9.5 % |
| **Second version** | 963 | 2.376 | 0.813 | 31.6 % | 56.8 % | 6.2 % |
| Family A: the first version's recipe fitted again | 963 | 2.407 | 0.822 | 31.5 % | 56.8 % | 6.7 % |
| Base model alone (no earlier moves) | 963 | 2.534 | 0.852 | 27.1 % | 51.9 % | 6.3 % |
| Every legal move equally likely (ties averaged) | 963 | 3.398 | 0.956 | 4.4 % | 12.4 % | 0.0 % |

The second version minus the published first version, on the same decisions and the same draws of whole games (21 games):

| Second version minus first | Difference | 95 % interval |
|---|---|---|
| Log loss | -0.172 | -0.209 to -0.135 |
| Brier | -0.040 | -0.052 to -0.028 |
| First choice right | 2.8 % | 0.9 % to 4.6 % |
| In the first three | 3.1 % | 1.5 % to 4.6 % |
| Calibration error | -3.3 % | -5.1 % to 0.0 % |

| First choices | given 70 % or more | said | played | given 90 % or more | said | played |
|---|---|---|---|---|---|---|
| Published first version | 116 | 86.6 % | 54.3 % | 52 | 97.1 % | 61.5 % |
| **Second version** | 92 | 83.3 % | 69.6 % | 22 | 95.1 % | 90.9 % |

Published first version: its first choice.

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

Second version: its first choice.

| Said | Decisions | Average said | Played |
|---|---|---|---|
| 0 to 10 % | 105 | 8.2 % | 3.8 % |
| 10 to 20 % | 261 | 14.1 % | 19.5 % |
| 20 to 30 % | 153 | 24.7 % | 26.8 % |
| 30 to 40 % | 129 | 35.3 % | 37.2 % |
| 40 to 50 % | 98 | 45.4 % | 30.6 % |
| 50 to 60 % | 70 | 54.7 % | 45.7 % |
| 60 to 70 % | 55 | 65.3 % | 61.8 % |
| 70 to 80 % | 37 | 75.1 % | 67.6 % |
| 80 to 90 % | 33 | 84.6 % | 57.6 % |
| 90 to 100 % | 22 | 95.1 % | 90.9 % |

Second version: the three rows the page shows, pooled.

| Said | Decisions | Average said | Played |
|---|---|---|---|
| 0 to 10 % | 1328 | 6.3 % | 7.7 % |
| 10 to 20 % | 744 | 13.7 % | 17.6 % |
| 20 to 30 % | 291 | 24.5 % | 28.2 % |
| 30 to 40 % | 177 | 35.1 % | 34.5 % |
| 40 to 50 % | 115 | 44.8 % | 34.8 % |
| 50 to 60 % | 74 | 54.5 % | 44.6 % |
| 60 to 70 % | 55 | 65.3 % | 61.8 % |
| 70 to 80 % | 37 | 75.1 % | 67.6 % |
| 80 to 90 % | 33 | 84.6 % | 57.6 % |
| 90 to 100 % | 22 | 95.1 % | 90.9 % |

| The second version on | Decisions | Log loss | First choice right | In the first three | Calibration error |
|---|---|---|---|---|---|
| Gukesh | 519 | 2.462 | 29.5 % | 53.4 % | 6.8 % |
| Sindarov | 444 | 2.276 | 34.0 % | 60.8 % | 5.5 % |
| positions the player has had before, by the tables | 89 | 1.211 | 57.3 % | 89.9 % | 9.0 % |
| positions the player has not | 874 | 2.495 | 28.9 % | 53.4 % | 6.7 % |

With 21 games the intervals are wide.

## What can be said

The rule was written down beforehand. "More reliable than the first version" needs every line to be yes.

| Condition | Met |
|---|---|
| Benchmark: log loss lower than the published first version, interval of the difference below zero | yes |
| Benchmark: calibration error lower | yes |
| Benchmark: said and played closer at 70 % and above | yes |
| Holdout: log loss not worse than family A | yes |
| Holdout: calibration error not worse than family A | yes |

**By this rule the second version is more reliable than the first.** Its probabilities are not claimed to be calibrated: the tables above show where they are and are not. The page keeps the label "Deneysel" and quotes the untouched holdout.

## Weights of the second version

| Feature | Shared | Gukesh | Sindarov | Under clock pressure |
|---|---|---|---|---|
| knight | 0.21 | -0.01 | -0.05 | 0.00 |
| bishop | -0.17 | -0.01 | -0.05 | 0.01 |
| rook | -0.27 | 0.00 | 0.06 | 0.07 |
| queen | -0.41 | -0.04 | -0.07 | 0.10 |
| king | -0.05 | -0.02 | -0.00 | 0.01 |
| capture | 1.29 | 0.03 | 0.04 | -0.02 |
| captureValue | 3.11 | 0.07 | 0.07 | 0.00 |
| exchange | 1.91 | 0.06 | 0.03 | -0.02 |
| losesMaterial | -1.40 | -0.03 | 0.02 | 0.04 |
| recapture | 1.10 | 0.01 | 0.00 | -0.03 |
| trade | 0.20 | -0.09 | 0.00 | -0.02 |
| check | 1.41 | 0.02 | 0.14 | 0.13 |
| mate | 0.00 | 0.00 | 0.00 | 0.00 |
| castle | 2.57 | 0.05 | 0.06 | 0.00 |
| promotion | 0.39 | 0.01 | 0.01 | 0.01 |
| leftHanging | -5.45 | -0.18 | -0.08 | -0.05 |
| escape | 0.98 | 0.05 | 0.00 | -0.10 |
| threat | 1.54 | -0.02 | 0.02 | -0.04 |
| forward | 0.26 | -0.05 | 0.05 | 0.06 |
| centre | 1.09 | 0.04 | -0.03 | -0.24 |
| develop | 0.58 | 0.01 | -0.00 | 0.00 |
| pawnDouble | 0.07 | 0.03 | 0.01 | -0.18 |
| pawnAdvanced | 0.93 | 0.01 | 0.03 | 0.06 |
| kingWalk | -0.89 | -0.10 | -0.00 | 0.07 |
| kingActive | 0.89 | 0.04 | -0.01 | 0.02 |
| samePiece | 0.16 | -0.03 | 0.05 | -0.01 |
| undo | 0.33 | -0.02 | -0.03 | 0.04 |
| repPlayer | 0.00 | 0.00 | 0.00 | 0.00 |
| repAny | 0.00 | 0.00 | 0.00 | 0.00 |

The two repertoire features have no weight in this family: earlier moves enter through the blend, not through the weighted sum.

## Limits

- The games before 2023 are missing: broadcasts carry no FIDE IDs before then, and names are not used.
- The earlier games are tournaments. Nothing here teaches what a player does in a match, and the match-score rule on the page is a written rule that nothing here measures.
- The tables that ship count every selected game, aged as of 2026-11-01. The measurements used the same rule as of each tournament's start, so the shipped tables are a little fuller than any that were measured.
- The match's own earlier games are not in the tables.
