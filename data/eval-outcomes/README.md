# How games ended, by engine evaluation

`counts.json` counts, for classical games between two players rated 2600 or
more, how the game ended (White won, draw, Black won) from positions with a
given engine evaluation. It holds counts only, no games.

Source: [Lichess official broadcast database](https://database.lichess.org/#broadcasts),
every monthly archive from January 2020 to October 2026, licensed
**CC BY-SA 4.0**. Credit Lichess and link the source and
[the licence](https://creativecommons.org/licenses/by-sa/4.0/) when
redistributing these counts. `counts.json` lists each archive's URL and
SHA-256 and how many games were counted from it.

```sh
python3 scripts/prepare-eval-outcomes.py
python3 scripts/fit-win-chance.py
```

The first reads the archives (cached in `.cache/player-history/`, about
770 MB) and writes `counts.json`. The second turns the counts of the games
before 2026 into the table the page uses, `src/data/winchance.json`, checks
it on the games of 2026 and writes `docs/WIN-CHANCE.md`, which says what was
counted, how, and what the numbers cannot tell.
