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

## What would make real predictions possible later

- A fan poll: the share of viewers who guessed each move is a real
  distribution of human predictions. It needs a small backend.
- An open human-move model such as Maia, if one can run in the browser at an
  acceptable size, shown under its own name and with its measured accuracy.
