# Player history for the custom next-move model

Source: [Lichess official broadcast database](https://database.lichess.org/#broadcasts), January–October 2026. This selected PGN dataset is licensed **CC BY-SA 4.0**, separately from the application code. Credit Lichess and link this source and licence when redistributing it. See [the licence](https://creativecommons.org/licenses/by-sa/4.0/).

`games.pgn` contains 331 distinct exported games involving exact FIDE IDs **46616543** (Gukesh D) and **14205483** (Javokhir Sindarov): 118 and 217 appearances respectively, with four games shared. Original PGN headers, dates and clock annotations are retained. Changes from the source are player/date filtering and duplicate removal. `manifest.json` records every source URL, archive SHA-256, selection counts and the corpus SHA-256.

Reproduce with Python 3, curl and zstd:

```sh
python3 scripts/prepare-player-history.py
```

Raw archives (about 205 MB) stay in the ignored `.cache/player-history/` directory. The PGN is training material, not a browser download.

## Requirements for training

This is a **mixed-time-control and mixed-variant source corpus**, not an already curated classical training set. Exclude Chess960/Freestyle and non-standard starting positions, identify classical games conservatively, and record inclusion/exclusion counts and reasons. Some broadcast TimeControl tags use minutes in informal strings, so do not blindly interpret every numeric value as seconds. Clock annotations and explicitly documented event selection can corroborate the classification. Canonicalize parsed mainline moves to deduplicate again if necessary.

Keep whole games and events together. Freeze a chronological fitting/calibration/test split before measuring the model: suggested fitting through July, August for calibration, September–October held out. Verify each player's counts and sample sizes; if an event spans a boundary, assign the whole event consistently. No November championship games belong in training or calibration. Compute features from information available before each move only. Preserve the held-out test set; do not tune on it.

Publish measured top-1/top-3 accuracy, probability loss and calibration results with the script, sample counts and limitations. Scores are experimental model estimates, never a claim to know the player's intentions. Current match score and clock pressure may be explicit documented contextual adjustments if this small corpus cannot support learning them reliably.
