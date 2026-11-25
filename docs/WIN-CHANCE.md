# Win, draw and loss by evaluation

Written by `scripts/fit-win-chance.py`. Do not edit by hand; run the script.

The "Kazanma şansı" card turns the engine's evaluation into three
percentages. They used to come from a formula shaped like an engine's own
guess, which said 100 % from about four pawns up. They now come from how
real games ended.

## Data

Classical games between two players rated 2600 or more, from the Lichess
broadcast database (https://database.lichess.org/#broadcasts, CC BY-SA 4.0),
every monthly archive from January 2020 to October 2026: standard chess from
the initial position, first clock readings of 45 minutes or more, a result,
and at least 20 positions evaluated by Lichess's analysis. Each game once.

| | Games | White won | Draw | Black won | Evaluated positions |
|---|---|---|---|---|---|
| Before 2026: the table is made from these | 8754 | 2231 | 5415 | 1108 | 815873 |
| 2026: the table is checked on these | 1557 | 441 | 948 | 168 | 158812 |

`python3 scripts/prepare-eval-outcomes.py` counts, for each position, the
evaluation it had (from White's side, in steps of a quarter of a pawn up to
ten pawns either way, forced mates apart) and how the game ended. Only the
counts are kept: `data/eval-outcomes/counts.json`, with the archives' URLs
and checksums.

## Method

No curve is assumed. For each evaluation the table holds the share of
positions from which White won, and from which Black won; the draw is the
rest. One thing is asked of the counts: a better evaluation for a side never
gives that side fewer wins. Where the counts break that, neighbouring groups
are pooled until they keep it. Between two groups the page reads off a
straight line.

At −4.50, for example, the table gives Black 92.9 %, a draw 6.6 % and White 0.6 %.
The formula before gave Black 99.9 %.

## The counts, the table and the check

Evaluations from White's side, in pawns. "Said" is what the table, made from
the earlier games, gives for the positions of 2026; "before" is the old
formula on the same positions. Each cell: White won / draw / Black won.

| Evaluation | Positions before 2026 | White won | Draw | Black won | Positions in 2026 | Ended, 2026 | Said by the table | Said by the formula before |
|---|---|---|---|---|---|---|---|---|
| −10.00 to −8.00 | 2190 | 0.2 % | 1.5 % | 98.3 % | 286 | 0.0 % / 2.8 % / 97.2 % | 0.1 % / 1.5 % / 98.4 % | 0.0 % / 0.0 % / 100.0 % |
| −8.00 to −6.00 | 4327 | 0.1 % | 1.5 % | 98.4 % | 680 | 0.1 % / 4.1 % / 95.7 % | 0.1 % / 1.7 % / 98.2 % | 0.0 % / 0.0 % / 100.0 % |
| −6.00 to −5.00 | 4455 | 0.2 % | 3.3 % | 96.4 % | 774 | 0.0 % / 10.1 % / 89.9 % | 0.2 % / 3.3 % / 96.5 % | 0.0 % / 0.0 % / 100.0 % |
| −5.00 to −4.00 | 6651 | 0.4 % | 6.3 % | 93.3 % | 1073 | 0.9 % / 12.2 % / 86.9 % | 0.4 % / 6.3 % / 93.3 % | 0.0 % / 0.1 % / 99.9 % |
| −4.00 to −3.00 | 7800 | 1.7 % | 9.3 % | 89.0 % | 1172 | 0.7 % / 11.2 % / 88.1 % | 1.6 % / 9.2 % / 89.2 % | 0.0 % / 0.5 % / 99.5 % |
| −3.00 to −2.00 | 9066 | 2.8 % | 18.0 % | 79.2 % | 1417 | 3.5 % / 16.7 % / 79.8 % | 2.8 % / 17.8 % / 79.4 % | 0.1 % / 3.8 % / 96.2 % |
| −2.00 to −1.50 | 5750 | 4.9 % | 28.5 % | 66.7 % | 848 | 2.6 % / 26.2 % / 71.2 % | 4.5 % / 28.8 % / 66.7 % | 0.3 % / 14.2 % / 85.5 % |
| −1.50 to −1.00 | 8329 | 4.9 % | 37.9 % | 57.2 % | 1033 | 7.9 % / 42.1 % / 50.0 % | 5.2 % / 37.6 % / 57.2 % | 0.8 % / 31.7 % / 67.5 % |
| −1.00 to −0.50 | 17093 | 6.4 % | 54.4 % | 39.2 % | 1788 | 9.7 % / 45.6 % / 44.7 % | 6.4 % / 54.3 % / 39.3 % | 2.1 % / 55.2 % / 42.7 % |
| −0.50 to −0.25 | 14983 | 9.2 % | 61.0 % | 29.8 % | 1661 | 11.1 % / 52.0 % / 36.9 % | 9.2 % / 61.0 % / 29.8 % | 4.2 % / 69.7 % / 26.1 % |
| −0.25 to +0.25 | 257039 | 11.7 % | 78.4 % | 9.9 % | 53360 | 12.6 % / 79.0 % / 8.4 % | 11.8 % / 78.3 % / 10.0 % | 10.8 % / 77.7 % / 11.5 % |
| +0.25 to +0.50 | 184661 | 21.9 % | 68.0 % | 10.0 % | 31737 | 24.7 % / 66.2 % / 9.1 % | 21.9 % / 69.0 % / 9.1 % | 17.3 % / 75.8 % / 6.9 % |
| +0.50 to +1.00 | 117643 | 28.7 % | 63.6 % | 7.7 % | 18119 | 28.0 % / 66.8 % / 5.2 % | 29.1 % / 63.4 % / 7.5 % | 30.8 % / 65.7 % / 3.5 % |
| +1.00 to +1.50 | 59762 | 51.3 % | 45.8 % | 2.9 % | 17041 | 51.2 % / 47.4 % / 1.4 % | 50.6 % / 46.4 % / 3.0 % | 53.9 % / 44.7 % / 1.3 % |
| +1.50 to +2.00 | 22959 | 70.6 % | 26.3 % | 3.1 % | 4986 | 84.2 % / 13.8 % / 2.0 % | 70.6 % / 26.5 % / 2.9 % | 77.7 % / 21.8 % / 0.4 % |
| +2.00 to +3.00 | 26684 | 78.4 % | 19.3 % | 2.3 % | 5281 | 87.9 % / 10.2 % / 1.9 % | 78.4 % / 19.3 % / 2.3 % | 93.4 % / 6.5 % / 0.1 % |
| +3.00 to +4.00 | 18402 | 88.7 % | 9.8 % | 1.5 % | 3838 | 92.4 % / 6.1 % / 1.5 % | 88.7 % / 9.8 % / 1.5 % | 99.1 % / 0.8 % / 0.0 % |
| +4.00 to +5.00 | 14941 | 94.1 % | 5.1 % | 0.8 % | 3495 | 93.9 % / 4.6 % / 1.5 % | 94.1 % / 5.1 % / 0.8 % | 99.9 % / 0.1 % / 0.0 % |
| +5.00 to +6.00 | 10402 | 96.6 % | 3.1 % | 0.3 % | 2511 | 97.5 % / 2.1 % / 0.4 % | 96.6 % / 3.1 % / 0.3 % | 100.0 % / 0.0 % / 0.0 % |
| +6.00 to +8.00 | 9604 | 98.1 % | 1.8 % | 0.1 % | 2474 | 99.0 % / 0.8 % / 0.2 % | 98.1 % / 1.8 % / 0.1 % | 100.0 % / 0.0 % / 0.0 % |
| +8.00 to +10.00 | 5858 | 99.1 % | 0.9 % | 0.1 % | 1773 | 99.5 % / 0.5 % / 0.0 % | 99.1 % / 0.9 % / 0.1 % | 100.0 % / 0.0 % / 0.0 % |

Forced mates before 2026: for White 6148 positions, White won 99.5 %; for Black 1126 positions, Black won 97.9 %.

Log loss on the positions of 2026 (lower is better): the table 0.6474, the formula before 0.6830.

## Limits

- Positions of one game are not independent: a game that was won from +5
  contributes many positions at +5 and above. The shares say how positions
  with an evaluation ended, which is the question, but the far ends rest on
  fewer games than their position counts suggest.
- The evaluation alone. Not the move number, not the clocks, not the players:
  the same evaluation is easier to convert in some positions than in others.
- The evaluations in the archive are from Lichess's analysis. The page's own
  evaluation comes from a cloud lookup or from Stockfish in the browser, at
  another depth, so the two do not agree to the hundredth.
- Players rated 2600 and more, at classical time controls. A world
  championship match is played by two of the very best, with more at stake.
- The 2026 check is on games the table has not seen, but they come from the
  same source and the same kind of event.
