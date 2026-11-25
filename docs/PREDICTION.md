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

## What this site does instead

There is no model here that predicts human moves, so the site does not show
predicted probabilities. Making them up would be worse than not having them.
What it offers:

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

The second and third are labelled as different things, next to each other,
and the page states that neither is a probability of the player's next move.

## Fairness and spoilers

- Engine lines, the best-move arrow and the "only good move" note are held
  back until the viewer has guessed. Choosing to look at the engine gives up
  the guess for that move.
- A guess is settled only by the next move the viewer is shown. While the
  board is paused, moves already played but still hidden never settle it.
- The other online-player database on Lichess would cover more positions,
  but it now requires a login, so it is not used.

## Research plan: a real human-move predictor

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

### Candidates

| Candidate | Licence | What is known | Open questions |
|---|---|---|---|
| Maia-2 (CSSLab) | MIT | one model for all rating levels; a community port to ONNX exists (`IndieFoundry/maia2-onnx`, for onnxruntime-web, model files of about 23 to 42 MB) | accuracy on elite classical games: it was trained on online games on Lichess, where almost every player is far below the level of this match |
| Maia-3 | AGPL-3.0 | newer | the licence needs a careful read first (AGPL adds a duty to offer the source to everyone who uses a hosted copy); size and browser support unknown |
| Maia-1 | GPL (weights for lc0) | one network per rating band, up to 1900 | needs an lc0 build for the browser; rating bands far below this match |
| Viewers' guesses | own data | the share of viewers who picked each move is a real distribution of human predictions | needs a small backend, a minimum number of guesses before anything is shown, and protection against one person voting many times |
| Kibitz | not open | see the top of this page | not available to use; a reference only |

Accuracy by rating level for the Maia models was looked for and not found in
a form that could be quoted here. It has to be measured (below), not assumed.

### What has to be measured before anything is shown

On a held-out set: classical games between players rated 2700 and above
from 2024 to 2026, none of them from this match, positions after move 10,
forced recaptures and only-legal moves removed.

- **Top-1 and top-3 accuracy**: how often the played move is the model's
  first choice, or among its first three.
- **Log loss and Brier score** over the moves: whether the percentages mean
  anything, not only the ranking.
- **Calibration**: a reliability table (of the moves given 60 to 70 %, how
  many were played) and the expected calibration error.
- **Two baselines on the same positions**: "the engine's first move" and
  "the most played move in the masters database, where there is one".
- **By phase**: opening, middlegame, endgame, and time trouble if clock data
  allows.

A model is worth showing only if it beats both baselines on top-1 accuracy
and log loss, and its percentages are calibrated to within a few points.
The numbers go on the page next to the predictions, with the size of the
test set. If it does not pass, the site stays as it is and this page says
what was measured.

### Hosting and cost

- **In the browser.** Loaded only when the viewer opens the Tahmin tab, never
  on page load. Budget: at most about 25 MB to download, cached after the
  first time, under 300 ms a position on a mid-range phone, in a worker so
  the board never stutters. The content security policy already allows
  WebAssembly; the model files would be served from this site's own origin.
- **On a server.** Not proposed: it would be a service to run and pay for,
  and every prediction would depend on it being up.
- **Privacy.** Positions come from the public broadcast. Nothing about the
  viewer is needed, and a model in the browser sends nothing anywhere.

### Order of work

1. Build the test set and the two baselines; publish the script and the
   baseline numbers.
2. Run Maia-2 through the ONNX port on the test set, offline; publish its
   numbers in this page.
3. If it passes: measure size and speed in real browsers, then propose the
   interface in a pull request of its own.
4. Separately, decide whether a viewers' poll is worth a backend.
