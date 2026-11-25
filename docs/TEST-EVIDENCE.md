# Test evidence

What was run, where, and what came out. Unit and integration tests run in CI
on every push. The browser checks below need a real browser and are run by
hand; their scripts are in `tests/e2e/`.

## Automated (CI, every push)

`npm test`: pause and catch-up, board sync delay, following the match,
tie-break days, the analytics privacy contract, storage refusal, the
statistics switch (delayed start and page-leave included), nested Twitch
parents, legal-move entry, puzzle rules and guess-the-move logic: 101 tests.
Also in CI: the secret check over the whole history, the type check, and
builds for `/` and `/satranc/`.

## Embed in a sandboxed frame on another origin

Script: `tests/e2e/embed.cjs`. Run on 25 November 2026 in headless Chromium
against the preview build with the production headers. The proposed page
(`docs/embed-shell/`) was served from `http://localhost:4174`, the chess
site from `http://127.0.0.1:4173`: different origins and different sites.

Opened: `/?parti=1&hamle=12&internal=1&secret=abc&utm_source=tw&posthog=evil`

| Check | Desktop | Storage refused | Phone size |
|---|---|---|---|
| Address the frame received | `?parti=1&hamle=12&internal=1` | same | same |
| Linked move shown (6… dxc6) | yes | yes | yes |
| Frame reads the parent document | blocked, `SecurityError` | blocked | blocked |
| Frame reads the parent's cookies | blocked, `SecurityError` | blocked | blocked |
| Frame navigates the top window | blocked, `SecurityError` | blocked | blocked |
| Nested YouTube player loads | yes | yes | yes |
| Arrow keys work without a click | yes | yes | not applicable |
| "Open in a new tab" opens a tab | yes | yes | not tested |
| Frame fills the viewport, page does not scroll | 1440×900 | 1440×900 | 390×664 |
| Horizontal overflow inside the frame | none | none | none |
| Content security policy violations | none | none | none |
| Page errors from the chess site | none | none | none |
| Storage inside the frame | works | refused | works |
| Notice that nothing will be remembered | not shown | shown | not shown |
| Language switch in Ayarlar | works | works (in memory) | works |

The only console message was Chrome's generic note that a frame with both
`allow-scripts` and `allow-same-origin` "can escape its sandboxing". That
applies to frames sharing the parent's origin, which this one does not.

## Engine and lookups under the content security policy

Script: `tests/e2e/csp-engine.cjs`. Cloud evaluations were blocked so the
in-browser engine had to run.

| Check | Result |
|---|---|
| Engine source shown | "Yerel" (local), three lines |
| Similar-games tab (masters database) | loaded, novelty found |
| Charts tab | loaded |
| Content security policy violations | none |

## Puzzle corner

Script: `tests/e2e/puzzles.cjs`, with the Lichess puzzle API replaced by
known puzzles. 33 of 33 checks passed on 25 November 2026.

| Check | Result |
|---|---|
| Opens from `#bulmaca`, says who is to play | yes |
| A wrong but legal move | refused, position unchanged, counted as a mistake |
| An illegal typed move | inline error |
| Picking a piece marks its legal destinations | yes |
| A right move, by two clicks | accepted, the reply is played |
| Typed moves in Turkish notation ("Kd8", "d5") | accepted |
| Solve with a mistake | "solved", not "first try" |
| Start over, then solve again | not counted twice |
| Pawn on the last rank | asks which piece: Vezir, Kale, Fil, At |
| First hint, second hint | piece marked, then the move; no third |
| Show solution | whole line played, counted as shown, not as solved |
| Score after a reload | kept |
| Lichess unreachable | built-in puzzle, with a notice |
| Phone size | no sideways scroll, touch targets 40px, taps work |
| Content security policy violations, page errors | none |

## Guess the move

Script: `tests/e2e/guess.cjs`, against a simulated live game (the feed is
replaced; the masters database is the real one). 32 of 32 checks passed on
25 November 2026.

| Check | Result |
|---|---|
| Guess mode off | engine lines and arrow shown, board not playable |
| Guess mode on | asks whose move it is; references held back; arrow, engine lines and the only-move note hidden |
| Guess on the board (Nf3) | shown as an arrow and under the board ("Tahminin: Af3"); the knight does not move |
| After the guess | engine available again; master frequencies with sample size (332,635 games); engine block separate |
| Labels | frequencies say they are past games; engine block says it is not what the player will choose; the page says it has no prediction model and the shares are not probabilities |
| The move arrives and matches | "Tutturdun", score 1 of 1 |
| Typed guess that is wrong | "Bu kez tutmadı", with the move played and the guess |
| Illegal typed guess | refused |
| "Show the engine for this move" | that move can no longer be guessed |
| While paused, with later moves already played | nothing announced; a guess is settled only by the move revealed next |
| Phone size | video and whole board fit together; a guess by tapping works; no sideways scroll |
| Content security policy violations, page errors | none |

## Earlier browser checks (24 November 2026, before this branch)

Run against other broadcasts that were live at the time, since the title
match had not started.

- Live moves arrived without a reload and the running clock ticked.
- Pause, replay from the start, step, auto-play; the pause survived a reload.
- Similar games: master statistics, novelty marker, previewing an earlier
  game on the board.
- Charts: evaluation graph, key moments, time per move.
- A simulated match (Game 1 over, Game 2 goes live): the announcement
  appeared and the page moved to Game 2 after the countdown; "Burada kal"
  kept it on Game 1.

## Not verified

- A real iPhone and real Safari (storage inside a frame on another site).
- The production deployment framed by the real `/satranc/` page.
- Events arriving in the PostHog project (no key is set yet).
- Twitch playing inside the frame (needs the real hostnames).
