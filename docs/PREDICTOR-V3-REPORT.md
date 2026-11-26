# Move predictor, third version: what was measured

Written by `scripts/train-predictor.mjs --v3 --final`. Do not edit by hand; run the script.

The plan was written down before any fitting: [PREDICTOR-V3-PROTOCOL.md](PREDICTOR-V3-PROTOCOL.md). The second version's report is [PREDICTOR-REPORT.md](PREDICTOR-REPORT.md). Phase 1 of the plan is theory, the same tournament's earlier games, and the two players' faster games; the board model's weights are the second version's, untouched. Phases 2 and 3, the score of the match and the title match itself, are further down.

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

## The score, learned from knockout matches

In a FIDE World Cup the second classical game of a two-game match is played by one who must win, having lost the first, and one for whom a draw is enough. The World Cups of 2021, 2023 and 2025, open and women, have 468 such second games. A correction to the board model's weights was fitted for that situation: added for the player who must win, taken off for the other. Entering with opposite signs for the two sides of the same game, it cannot pick up what merely distinguishes those players from the two finalists.

Fitted on 2021 and 2023 (30670 decisions; penalty 0.1, chosen there by leaving one event out at a time), measured on 2025 (13514 decisions, 148 games):

| On the World Cups of 2025 | Log loss | Against no correction |
|---|---|---|
| No correction | 2.4048 | |
| The written rule of the first two versions (0.35 off an even trade) | 2.4055 | +0.0007 (-0.0004 to +0.0019) |
| Learned | 2.4041 | -0.0007 (-0.0012 to -0.0002) |

Learned against the written rule: -0.0014 (-0.0024 to -0.0004). The rule set beforehand was that the learned correction replaces the written one only if it lowers log loss on the 2025 games with the interval below zero. **It does, and it replaces the written rule.** The written rule did nothing that can be measured.

The effect is real and very small. Its largest weights, for the player who must win: capture -0.041, samePiece -0.029, undo -0.028, threat -0.023, rook +0.022, leftHanging -0.019. So he takes a little less, and moves a piece again or straight back a little less; the player a draw is enough for does the opposite. At its strongest, in a last game that must be won, a capture becomes about 4 % less likely than the board alone would have it. The first choice is the same move as before in almost every position (first choice right 29.2 % against 29.2 %).

On the page it is scaled by urgency: the points the mover is behind, for each game still to be played. That a fourteen-game match scales like that is an assumption; nothing here measures it. With the score level it does nothing, and a point behind with twelve games to go it is a twelfth of the above. In the match so far the score has been level before every game, so it has done nothing yet.

## Does a title match change the opening?

Of the title matches in the archives, 5 have earlier games of their players: 60 games, 1800 decisions in the first fifteen moves. Beside them, the same players' other classical events of the twelve months before each match: 314 games, 4757 decisions. One more, the Women's World Chess Championship 2020, is in the first month of the archives and has nothing before it. The estimate is the third version's, from what could be known at the time, with the shared board model (the two finalists' own corrections are theirs alone).

| In the first fifteen moves | Title matches | Other events |
|---|---|---|
| The player has had the position before, in an earlier event | 20.3 % | 22.9 % |
| and then plays the move he played there most | 67.1 % | 69.3 % |
| His game leaves his own earlier games at move | 3.9 | 4.3 |
| He has had the position in an earlier game of the same event | 14.9 % | 7.9 % |
| and then plays a move he played there | 81.0 % | 70.1 % |
| Theory has the position | 45.3 % | 47.8 % |
| and he plays its most played move | 70.1 % | 70.6 % |
| Log loss of the estimate | 1.749 | 1.696 |

Match by match, with the players' other events of the year before in brackets:

| Match | Decisions | Had the position before | Then repeats his most played move | Best weight of the base, as a multiple | Chosen without this match |
|---|---|---|---|---|---|
| Nepomniachtchi and Carlsen, 2021-11 | 330 (684) | 26.1 % (14.9 %) | 82.6 % (73.5 %) | 1 (8) | 4 |
| Nepomniachtchi and Ding, 2023-04 | 420 (675) | 20.5 % (18.8 %) | 79.1 % (73.2 %) | 2 (2) | 2 |
| Lei and Ju, 2023-07 | 360 (494) | 16.9 % (22.5 %) | 65.6 % (76.6 %) | 4 (0.5) | 2 |
| Gukesh and Ding, 2024-11 | 420 (1809) | 20.5 % (27.5 %) | 55.8 % (69.2 %) | 8 (1) | 2 |
| Ju and Tan, 2025-04 | 270 (1095) | 17.0 % (23.0 %) | 39.1 % (62.7 %) | 4 (4) | 2 |

**The weight of the base against the player's own games.** If a title match made players leave their own lines, the base would deserve more weight in a match than in a tournament. Over all title matches the best multiple is 2; over the same players' other events it is 2. Leaving each match out in turn gives 4, 2, 2, 2, 2. The rule set beforehand asked for every one of those to be on the same side of what the tournaments ask for. **They are not, so nothing is changed.** In 3 of the 5 matches the players repeated themselves less than in their tournaments of the year before, in 2 more; 5 matches cannot tell a habit of title matches from the habits of 7 players.

**The match's own earlier games.** Not in the plan; looked at because the table shows it. In a title match a player is back in a position of an earlier game of the same match about twice as often as he meets one again within a tournament, and he then repeats his move more often. The weight of those games on the page (2, chosen on the two finalists' tournaments) is only ever used for the match, so the question put to it was direct: is another weight better in title matches? Over all of them the best multiple of it is 1, and leaving each match out in turn gives 1, 1, 1, 1, 1. In the same players' other events the best is 0.5: log loss in title matches 1.7492 with the page's weight, 1.7513 with that (-0.0021, -0.0048 to +0.0002). **The weight on the page is the one title matches ask for; nothing is changed.**

What this cannot see is what a player has prepared and not yet shown. A new line is new to the tables as well, and the estimate for it comes from theory and the board.

## What can be said

The rule was written down beforehand: the third version replaces the second if its log loss is lower on January to August 2026 with the interval of the difference below zero, and its calibration error is not higher.

- Log loss: 2.125 against 2.205, difference -0.080 (-0.104 to -0.058).
- Calibration error: 3.4 % against 2.9 %.

**The conditions are not both met.** The gain is in the first 12 moves, where theory speaks; after that the two versions are the same model. The probabilities are not claimed to be calibrated. The plan kept the "Deneysel" label on the page; it was taken off on 26 November 2026 at Özgür's request, which changes nothing that was measured here.

## Limits

- Theory is what was played by players rated 2600 or more in broadcast games since 2020, cut to positions that occurred at least 2 times in the first 12 moves. A rare line, or a new one, is not in it.
- The match's own games are read on the page as they are played. In the measurements that part was chosen on earlier rounds of tournaments, where the opponent changes every round; in a match he does not.
- Nothing here knows the two camps' preparation.
- The score correction comes from two-game knockout matches of other players. That it carries over to a fourteen-game title match, scaled by urgency, is an assumption.
- The title-match study has 5 matches and 7 players, none of them Sindarov.
- The shipped tables count every game up to the end of October 2026, aged as of 2026-11-01.
