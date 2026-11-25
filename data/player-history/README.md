# Player history for the custom next-move model

Source: [Lichess official broadcast database](https://database.lichess.org/#broadcasts), January–October 2026. This selected PGN dataset is licensed **CC BY-SA 4.0**, separately from the application code. Credit Lichess and link this source and licence when redistributing it. See [the licence](https://creativecommons.org/licenses/by-sa/4.0/).

`games.pgn` contains 331 distinct exported games involving exact FIDE IDs **46616543** (Gukesh D) and **14205483** (Javokhir Sindarov): 118 and 217 appearances respectively, with four games shared. Original PGN headers, dates and clock annotations are retained. Changes from the source are player/date filtering and duplicate removal. `manifest.json` records every source URL, archive SHA-256, selection counts and the corpus SHA-256.

Reproduce with Python 3, curl and zstd:

```sh
python3 scripts/prepare-player-history.py
```

Raw archives (about 205 MB) stay in the ignored `.cache/player-history/` directory. The PGN is training material, not a browser download.

## Which archive each game came from

`archive-months.json` gives, for every game of `games.pgn` by its `GameURL`, the month of the archive it was in. A game is in the archive of the month its round was played, while its `Date` tag is sometimes the first day of the tournament. `games.pgn` and `manifest.json` are not changed by this file.

```sh
python3 scripts/prepare-player-history.py --archive-months
```

## Earlier games, 2023 to 2025

`earlier/games.pgn` holds 351 classical games of the same two players from before 2026: 190 appearances of Gukesh D and 161 of Javokhir Sindarov. Same source and the same licence, **CC BY-SA 4.0**: credit Lichess and link the source and the licence when redistributing it.

```sh
python3 scripts/prepare-player-history.py --earlier
```

- Every monthly archive from January 2020 to December 2025 is read (72 archives, about 560 MB, cached in `.cache/player-history/`). `earlier/manifest.json` records each archive's URL and SHA-256 and what was read, matched, kept and left out in it, and the SHA-256 of the result.
- Players are matched by exact FIDE ID only. No game before 2023 carries either of the two IDs (few broadcasts carried FIDE IDs at all then: 123 games of 203,131 in 2020 to 2022), so nothing from those years is matched. 925 games whose player tags contain "Gukesh" or "Sindarov" without either ID are counted in the manifest and never used: a name does not tell one Sindarov from another.
- Of the 963 games matched by ID, only those the trainer can use are kept: standard chess from the initial position whose first clock readings are at least 45 minutes. Left out: 105 another variant or a set-up starting position, 11 no clock readings with the first moves, 496 faster than classical by its first clock readings. A time-control tag alone never admits a game.
- A game that occurs twice (same white ID, black ID and moves) is kept once.
- Each game is the original PGN text with one tag added after `Event`: `Archive`, the month of the archive it came from. Many of these games have no usable `Date` tag.

How these games are split and used: `docs/PREDICTOR-V2-PROTOCOL.md`.

## Requirements for training

This is a **mixed-time-control and mixed-variant source corpus**, not an already curated classical training set. Exclude Chess960/Freestyle and non-standard starting positions, identify classical games conservatively, and record inclusion/exclusion counts and reasons. Some broadcast TimeControl tags use minutes in informal strings, so do not blindly interpret every numeric value as seconds. Clock annotations and explicitly documented event selection can corroborate the classification. Canonicalize parsed mainline moves to deduplicate again if necessary.

Keep whole games and events together. Freeze a chronological fitting/calibration/test split before measuring the model: suggested fitting through July, August for calibration, September–October held out. Verify each player's counts and sample sizes; if an event spans a boundary, assign the whole event consistently. No November championship games belong in training or calibration. Compute features from information available before each move only. Preserve the held-out test set; do not tune on it.

Publish measured top-1/top-3 accuracy, probability loss and calibration results with the script, sample counts and limitations. Scores are experimental model estimates, never a claim to know the player's intentions. Current match score and clock pressure may be explicit documented contextual adjustments if this small corpus cannot support learning them reliably.
