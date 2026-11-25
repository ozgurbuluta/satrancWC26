# Guess the move: what it shows and what it does not

## The reference

Vidit Gujrathi's "Kibitz" is a trained model that predicts the move a
grandmaster will actually play, built as an overlay for broadcasts. Its
site says it uses live boards from Lichess broadcasts and is right about six
times in ten. How it produces its numbers is not published, as far as could
be found. Sources: his announcement
(https://x.com/viditchess/status/2071631637792931859) and
https://kibitzchess.app/.

This site is an independent fan project. It is not Kibitz, does not use it,
and is not affiliated with FIDE, with Vidit Gujrathi or with Lichess.

## What this site does

The site has an experimental model of its own for the next move of the two
players. It is described in [PREDICTOR.md](PREDICTOR.md), with everything
that was measured in [PREDICTOR-REPORT.md](PREDICTOR-REPORT.md). It is not
Kibitz, uses no engine and no third-party weights, and its accuracy is
modest and stated.

The Tahmin tab keeps four things apart:

1. **The viewer's own guess.** With guess mode on, the viewer picks the move
   they expect, and when the real move is shown it is a hit or a miss.
2. **What masters played in this position.** Counts from the Lichess masters
   database: how many of the games that reached the position continued with
   each move. These are real frequencies in past games, shown with the
   sample size. They exist only while the position is in the database, which
   is roughly the opening. After that the site says there is no data and
   shows no numbers.
3. **What the engine prefers.** The strongest moves according to the engine.
   This is about quality, not about what a person will choose.
4. **The model estimate.** At the bottom of the tab: three legal moves with a
   share each and the rest as "other", labelled experimental, with its
   measured accuracy one click away.

The second and third are not probabilities of the player's next move, and
the page says so. Only the fourth is an estimate of that, and it is never
built from the other two: an engine score is not renamed a probability, and
neither is a count from the masters database.

## Fairness and spoilers

- A prediction is made only in the Tahmin tab, by picking a move from the
  list of legal moves or typing it. A move on the main board is the viewer's
  own analysis and is never a prediction; picking a prediction moves nothing
  on the board.
- A prediction is about the newest visible position of the game, whatever
  the board shows (an earlier move, a line of the viewer's own).
- Inside the Tahmin tab, what masters played and what the engine prefers
  are held back until the viewer has predicted, or has given the move up to
  see them. Nothing outside that tab is hidden by guess mode: the engine
  beside the board is the viewer's to look at.
- A guess is settled only by the next move the viewer is shown. While the
  board is paused, moves already played but still hidden never settle it.
- The other online-player database on Lichess would cover more positions,
  but it now requires a login, so it is not used.

## Research plan: a real human-move predictor

*Background.* This plan was written before the site had a model of its own,
and looked at third-party models. The site now ships its own experimental
model instead ([PREDICTOR.md](PREDICTOR.md)). The survey of third-party
models and their licences below stays as it was written; none of them is
used.

Nothing in this section is built. It is the plan for finding out whether a
real predictor can be added honestly, and what it would have to show first.
Tracked in https://github.com/ozgurbuluta/satrancWC26/issues/4.

### Three different things

| | What it is | What it says | On the site today |
|---|---|---|---|
| Engine strength | Stockfish's evaluation of each move | which move is best | yes, labelled as the engine's view |
| Historical frequency | counts in the Lichess masters database | what was played in past games from this position, with the sample size | yes, while the position is in the database |
| Human-move prediction | a model trained on human games, or the viewers' own guesses | how likely this player is to choose each move now | no |

A predictor belongs in the third row only. An engine score turned into a
percentage is not a prediction of a person, and neither is a count from old
games. If one is ever shown, it gets its own block, its own name and its own
measured accuracy next to it.

### Candidates: what is verified and what is not

Checked on 25 November 2026 in the repositories and pages linked. "Code
licence" is what the repository's licence file says. Permission to use or
republish the **weights**, or a file **converted** from them, is a separate
question and is listed separately. None of this is legal advice.

**Maia-2**

- Code licence, verified: MIT. `LICENSE` in https://github.com/CSSLab/maia2
  (commit `67bee6c`); the README says "Maia-2 is released under the MIT
  License".
- Weights: two checkpoints, rapid and blitz. The package downloads them from
  two Google Drive links listed in `maia2/model.py`. No licence statement of
  their own was found for these files in the repository; the files
  themselves were not inspected. Whether the repository's MIT licence covers
  them is an assumption until the authors say so.
- Converted file for the browser: none is published. The third-party project
  https://github.com/IndieFoundry/maia2-onnx (code licence, verified: MIT,
  commit `abe12b1`) contains an export script and checksums, not model
  files. An ONNX file would be our own conversion of the Maia-2 weights, and
  serving it from this site would republish a derivative of them. That needs
  the same permission as the weights.
- Training data: rated rapid and blitz games from the Lichess database, May
  2018 to November 2023 (README, "Data"). That database is published under
  CC0 (https://database.lichess.org/).
- Rating groups: under 1100, hundred-point groups up to 1999, and one group
  for 2000 and above (`maia2/utils.py`). It has no way to tell a 2000 from a
  2780.
- Paper: https://arxiv.org/abs/2409.20553.
- Size and speed: the port's README reports converted files of 27 to 85 MB
  depending on precision, and 14.2 MB (3.7 MB compressed) for the ONNX
  runtime's WebAssembly file. Those are its figures, not measured here.

**Maia-3**

- Code licence, verified: AGPL-3.0. `LICENSE` in
  https://github.com/CSSLab/maia3 (commit `1e13597`). The repository is
  Python inference code that runs the weights as a UCI engine.
- Weights: on Hugging Face as `UofTCSSLab/Maia3-5M`, `Maia3-23M` and
  `Maia3-79M`. Their pages state no licence (the licence field was empty
  when checked). Permission is unknown.
- Converted file for the browser: none known.
- Paper: https://arxiv.org/abs/2605.19091. Its training range has to be read
  from the paper before any test set is fixed.

**Maia-1**

- Code licence, verified: GPL-3.0. `LICENSE` in
  https://github.com/CSSLab/maia-chess (commit `749204c`).
- Weights: nine networks for ratings 1100 to 1900, published in the same
  repository (`maia_weights/`) and as its release files, with no separate
  terms stated.
- They run in lc0. No browser build of that is known, and the rating bands
  are far below this match.
- Training data: Lichess games, January 2017 to November 2019 (README).
- Paper: https://arxiv.org/abs/2006.01855.

**Viewers' guesses.** Own data: the share of viewers who picked each move is
a real distribution of human predictions. It needs a small backend, a
minimum number of guesses before anything is shown, and protection against
one person voting many times.

**Kibitz.** Not open; a reference only (see the top of this page).

Before any weights or converted file are served from this site, the authors
are asked in writing whether that is allowed and under which terms, and
their answer is linked here. Without an answer, evaluation can still be run
offline with the weights fetched by the authors' own package, and nothing is
republished.

Accuracy by rating level for these models was looked for and not found in a
form that could be quoted here. It has to be measured, not assumed.

### Data for the evaluation

- **Source:** the Lichess broadcast database
  (https://database.lichess.org/#broadcasts), monthly PGN files of official
  broadcasts, released under CC BY-SA 4.0. Anything published from it (a
  test set, a list of game ids) carries that licence and credits Lichess.
- **Games:** classical time controls, both players rated 2700 or above.
  Nothing from this match.
- **Positions:** every position of those games in which there is more than
  one legal move.

### Splitting without leakage

- **By game.** All positions of a game are in the same set, and all games of
  an event are in the same set.
- **By time.** Two sets, in order:
  - a *fitting set* of games that ended before a cut-off date. It is used
    only to fit the few constants below.
  - a *test set* of games that started after a later date, with a gap of at
    least a month between the two.
- **After the model's own training data.** The test set starts after the
  last month of training data of every model evaluated on it. For Maia-2
  that is after November 2023. A model whose training range cannot be
  established is not compared on it.
- **The frequency baseline must not see the future.** For a test position
  the masters counts are taken only from games of earlier years than the
  test game, so neither that game nor anything after it counts toward its
  own prediction. (The explorer's date filter works in whole years; this is
  to be confirmed when the script is written.)
- **Repeated positions.** Opening positions recur. A test position that
  also occurs in the fitting set is marked, and results are given for all
  positions and for the unmarked ones.
- **Used once.** The test set is fixed before any model is run on it, and
  the list of its game ids and the script are published with the numbers.

### Probabilities for every method

Log loss needs a probability for the move that was played. A method that
puts everything on one move scores infinitely badly the first time the
player chooses another, so no method is evaluated that way. Each one gives
a distribution over the legal moves that sums to 1, with a small floor so
that every legal move has some probability:
p(m) = (1 − ε) · q(m) + ε / n, with n legal moves and ε = 0.01 for all
methods alike.

| Method | q(m) before the floor |
|---|---|
| Uniform | 1 / n. The level everything has to beat; its log loss is ln n. |
| Engine | Every legal move evaluated at the same fixed node count, turned into an expected score w(m) between 0 and 1. q(m) ∝ exp((w(m) − w(best)) / τ). τ is fitted on the fitting set. |
| Masters frequency | (c(m) + α / n) / (N + α), with N earlier games in the position and c(m) of them continuing with m. α is fitted on the fitting set. With no games it is the uniform, so it is defined for every position. |
| Model | Its output restricted to the legal moves and renormalised. Reported as published, and again with one temperature fitted on the fitting set. |

The constants τ, α and the model's temperature are fitted by minimising log
loss on the fitting set and are then frozen. Top-1 and top-3 accuracy do
not depend on them.

### What is reported

- **Top-1 and top-3 accuracy.**
- **Log loss:** the mean of −ln p(played move).
- **Brier score:** the mean over positions of the sum over legal moves of
  (p − y)², with y = 1 for the played move.
- **Calibration:** a reliability table of the first-choice probability in
  ten equal bins with the number of positions in each, and the expected
  calibration error.
- **Split** by opening, middlegame and endgame, for all positions and for
  those with at least 20 earlier games in the masters database.
- **Uncertainty:** 95 % intervals from resampling whole games, since
  positions of one game are not independent. Differences between methods
  are computed position by position.

### The bar

A model is worth showing only if, on the test set, it beats both the engine
and the masters-frequency baseline on log loss and on top-1 accuracy, with
the 95 % interval of each difference clear of zero, and its expected
calibration error is at most 3 points with no more than the one fitted
temperature. The numbers
go on the page next to the predictions, with the size of the test set. If
it does not pass, the site stays as it is and this page says what was
measured.

### Hosting and cost

- **In the browser.** Loaded only when the viewer opens the Tahmin tab, never
  on page load. Budget: at most about 25 MB to download, cached after the
  first time, under 300 ms a position on a mid-range phone, in a worker so
  the board never stutters. The content security policy already allows
  WebAssembly; the model files would be served from this site's own origin,
  which is why the permission above comes first.
- **On a server.** Not proposed: it would be a service to run and pay for,
  and every prediction would depend on it being up.
- **Privacy.** Positions come from the public broadcast. Nothing about the
  viewer is needed, and a model in the browser sends nothing anywhere.

### Order of work

1. Fix the fitting and test sets and publish their definition.
2. Build the three baselines and publish their numbers.
3. Run Maia-2 offline on the test set; publish its numbers here.
4. Ask the authors about serving the weights or a conversion.
5. If it passes and permission is given: measure size and speed in real
   browsers, then propose the interface in a pull request of its own.
6. Separately, decide whether a viewers' poll is worth a backend.
