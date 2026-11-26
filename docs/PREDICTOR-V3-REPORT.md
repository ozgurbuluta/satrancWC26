# Move predictor, third version: what was measured

Written by `scripts/train-predictor.mjs --v3 --final`. Do not edit by hand; run the script.

The plan was written down before any fitting: [PREDICTOR-V3-PROTOCOL.md](PREDICTOR-V3-PROTOCOL.md). The second version's report is [PREDICTOR-REPORT.md](PREDICTOR-REPORT.md). This is phase 1 of the plan: theory, the same tournament's earlier games, and the two players' faster games. The board model's weights are the second version's, untouched.

Source of every game: the Lichess broadcast database, CC BY-SA 4.0.

## What was added

| Source | Games | What it gives |
|---|---|---|
| Theory | 10761 classical games between players rated 2600 or more, without the two players' own | what strong players played in a position |
| The same tournament | earlier rounds of the tournament a game is in | in the match: its own games so far |
| Faster games | 709 rapid and blitz games of the two players | more of their repertoire |

## What was chosen, on the selection games (2025, 5733 decisions)

Each source on its own, with every setting searched again, against the second version's log loss of 2.2449:

| Added | Log loss | Settings found |
|---|---|---|
| Theory | 2.1241 | ν 0.5, theory half-life 4 years |
| The same tournament | 2.2406 | weight 4 |
| Faster games | 2.2365 | weight 1 |
| All three | 2.1219 | |

Almost all of the gain is theory. Two things were then weighed against what they cost in the file:

- **Faster games are not adopted.** Without them the log loss is 2.1226 against 2.1219 with them, and they would add 10859 positions to the table.
- **Other players' moves in the two players' games are dropped.** Theory says the same thing from more games: without them 2.1222.

**The theory table had to be cut.** Kept whole it has 243288 positions and the file would be over 4 MB. The plan's rule (the largest minimum that costs under 0.002) fails: every cut costs more than that. The rule used instead: of the tables that keep the whole file under 600 KB, the one with the lowest log loss on the selection games.

| Theory up to half-move | A position needs | Log loss | Positions | File |
|---|---|---|---|---|
| 16 | 1 game | 2.1597 | 27243 | 654 KB |
| 16 | 2 games | 2.1708 | 11338 | 390 KB |
| 16 | 3 games | 2.1746 | 6561 | 300 KB |
| 16 | 5 games | 2.1825 | 3871 | 243 KB |
| 20 | 1 game | 2.1425 | 53280 | 1110 KB |
| 20 | 2 games | 2.1589 | 16931 | 507 KB |
| 20 | 3 games | 2.1664 | 9085 | 358 KB |
| 20 | 5 games | 2.1761 | 4933 | 269 KB |
| 24 | 1 game | 2.1340 | 86301 | 1674 KB |
| 24 | 2 games | 2.1509 | 21100 | 591 KB **chosen** |
| 24 | 3 games | 2.1607 | 10785 | 395 KB |
| 24 | 5 games | 2.1720 | 5534 | 284 KB |
| 30 | 1 game | 2.1268 | 143002 | 2627 KB |
| 30 | 2 games | 2.1453 | 24945 | 667 KB |
| 30 | 3 games | 2.1574 | 12052 | 422 KB |
| 30 | 5 games | 2.1701 | 5882 | 291 KB |
| 40 | 1 game | 2.1229 | 243288 | 4298 KB |
| 40 | 2 games | 2.1434 | 27510 | 716 KB |
| 40 | 3 games | 2.1569 | 12631 | 434 KB |
| 40 | 5 games | 2.1698 | 6020 | 294 KB |

Chosen: theory for the first 12 moves, from positions with at least 2 games; ν 0.5; theory half-life 4 years; the same tournament's games count 2 times; κ 2; the player's own games halve every 0.5 years; ε 0.005; temperature 0.978. Selection log loss 2.1508; with the whole table it would be 2.1219.

| | Decisions | Log loss | Brier | First choice right | In the first three | Calibration error | Said / played at 70 % and above |
|---|---|---|---|---|---|---|---|
| **Third version** | 5733 | 2.151 | 0.762 | 35.7 % | 61.0 % | 3.3 % | 86.3 % / 81.1 % (885) |
| Second version | 5733 | 2.245 | 0.787 | 33.5 % | 58.7 % | 3.1 % | 84.2 % / 79.5 % (674) |

These are the games the choices were made on.

## January to August 2026

83 games, 4240 decisions. The second version was scored here once, and its result has been seen; no choice of the third version was made here.

| | Decisions | Log loss | Brier | First choice right | In the first three | Calibration error | Said / played at 70 % and above |
|---|---|---|---|---|---|---|---|
| **Third version** | 4240 | 2.125 | 0.754 | 36.5 % | 61.2 % | 3.4 % | 86.5 % / 81.5 % (626) |
| Second version | 4240 | 2.205 | 0.775 | 34.7 % | 59.4 % | 2.9 % | 84.3 % / 82.0 % (490) |
| Every legal move equally likely (ties averaged) | 4240 | 3.287 | 0.949 | 5.1 % | 14.2 % | 0.0 % | 100.0 % / 100.0 % (12) |

On the same decisions and the same draws of whole games:

| | Third minus second | 95 % interval |
|---|---|---|
| Log loss | -0.080 | -0.104 to -0.058 |
| First choice right | 1.8 points | 1.1 to 2.7 |
| In the first three | 1.8 points | 1.4 to 2.3 |
| Calibration error | 0.5 points | -0.2 to 1.2 |

| Where | Decisions | Third version | Second version | Difference in log loss |
|---|---|---|---|---|
| First 12 moves | 1008 | 1.470 | 1.807 | -0.337 (-0.430 to -0.247) |
| After that | 3232 | 2.329 | 2.329 | 0.000 (-0.000 to 0.000) |
| Gukesh | 2037 | 2.199 | 2.275 | -0.076 |
| Sindarov | 2203 | 2.057 | 2.140 | -0.083 |

The third version's first choice, by what it said:

| Said | Decisions | Average said | Played |
|---|---|---|---|
| 0 to 10 % | 431 | 8.2 % | 12.8 % |
| 10 to 20 % | 1113 | 14.6 % | 18.8 % |
| 20 to 30 % | 766 | 24.7 % | 24.9 % |
| 30 to 40 % | 449 | 34.4 % | 36.3 % |
| 40 to 50 % | 346 | 45.0 % | 39.9 % |
| 50 to 60 % | 285 | 54.7 % | 49.8 % |
| 60 to 70 % | 224 | 64.7 % | 62.9 % |
| 70 to 80 % | 174 | 74.9 % | 65.5 % |
| 80 to 90 % | 201 | 85.0 % | 81.6 % |
| 90 to 100 % | 251 | 95.8 % | 92.4 % |

## September 2026, the reused benchmark

The 963 decisions every version has been measured on. Not a blind measurement.

| | Decisions | Log loss | Brier | First choice right | In the first three | Calibration error | Said / played at 70 % and above |
|---|---|---|---|---|---|---|---|
| **Third version** | 963 | 2.299 | 0.793 | 33.7 % | 59.0 % | 6.5 % | 84.6 % / 74.8 % (123) |
| Second version | 963 | 2.376 | 0.813 | 31.6 % | 56.8 % | 6.2 % | 83.3 % / 69.6 % (92) |
| Published first version | 963 | 2.549 | 0.854 | 28.8 % | 53.7 % | 9.5 % | 86.6 % / 54.3 % (116) |

| | Third minus second | 95 % interval |
|---|---|---|
| Log loss | -0.078 | -0.111 to -0.047 |
| First choice right | 2.2 points | 1.1 to 3.4 |
| In the first three | 2.2 points | 1.3 to 3.1 |
| Calibration error | 0.3 points | -0.9 to 1.3 |

| Where | Decisions | Third version | Second version | Difference in log loss |
|---|---|---|---|---|
| First 12 moves | 252 | 1.674 | 1.969 | -0.295 (-0.422 to -0.174) |
| After that | 711 | 2.520 | 2.521 | -0.001 (-0.002 to 0.000) |
| Gukesh | 519 | 2.408 | 2.462 | -0.054 |
| Sindarov | 444 | 2.171 | 2.276 | -0.105 |

## The 2026 match so far

2 games, 116 decisions, from the public broadcast (`data/predictor-v3/match-2026.pgn`). No version has seen them and nothing was chosen on them. The third version also reads the match's own earlier games here, as it does on the page. With this few games the numbers say little; they are here because they are the only ones from the match itself, and the file grows by a game at a time.

| | Decisions | Log loss | Brier | First choice right | In the first three | Calibration error | Said / played at 70 % and above |
|---|---|---|---|---|---|---|---|
| **Third version** | 116 | 2.038 | 0.730 | 31.0 % | 60.3 % | 10.3 % | 87.4 % / 87.0 % (23) |
| Second version | 116 | 2.290 | 0.810 | 22.4 % | 56.0 % | 12.1 % | 82.5 % / 83.3 % (12) |

| Where | Decisions | Third version | Second version | Difference in log loss |
|---|---|---|---|---|
| First 12 moves | 48 | 1.274 | 1.883 | -0.610 (-0.993 to -0.227) |
| After that | 68 | 2.578 | 2.578 | 0.001 (0.000 to 0.001) |
| Gukesh | 58 | 2.013 | 2.252 | -0.240 |
| Sindarov | 58 | 2.064 | 2.328 | -0.264 |

## What can be said

The rule was written down beforehand: the third version replaces the second if its log loss is lower on January to August 2026 with the interval of the difference below zero, and its calibration error is not higher.

- Log loss: 2.125 against 2.205, difference -0.080 (-0.104 to -0.058).
- Calibration error: 3.4 % against 2.9 %.

**The conditions are not both met.** The gain is in the first 12 moves, where theory speaks; after that the two versions are the same model. The probabilities are not claimed to be calibrated, and the label stays "Deneysel".

## Limits

- Theory is what was played by players rated 2600 or more in broadcast games since 2020, cut to positions that occurred at least 2 times in the first 12 moves. A rare line, or a new one, is not in it.
- The match's own games are read on the page as they are played. In the measurements that part was chosen on earlier rounds of tournaments, where the opponent changes every round; in a match he does not.
- Nothing here knows the two camps' preparation, and nothing here measures the match-score rule. Those are phases 2 and 3 of the plan.
- The shipped tables count every game up to the end of October 2026, aged as of 2026-11-01.
