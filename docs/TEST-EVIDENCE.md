# Test evidence

## Production integration verified — 25 November 2026

The core release is live at https://ozgurakanay.com/satranc/ (puzzles: `#bulmaca`). Chess commit `d0daa5a0a84f0f6e75621cd902c7abf78641da61` was deployed as `dpl_9PZSGCBYEcpAsrB3sY9ueAh81z96`; personal-site shell PR #8 is merged at `f39a04cfcde30086291dc0d524ad5882421daaeb`.

- Native Mac Safari and the in-app browser loaded the sandboxed chess frame and nested YouTube player. A real legal move guess, historical-frequency labels and puzzle interactions were checked.
- The production Stockfish WASM responds with HTTP 200 and `application/wasm`; production security headers match the reviewed configuration. Worker execution under that CSP is covered by the browser evidence below.
- Production-only analytics and public-URL variables are configured in Vercel, outside source control. The separate PostHog `satrancWC26` project received real framed pageviews and named feature events, marked `test` or `internal`, with cookieless mode and stripped query strings/fragments/referrer paths.
- Statistics opt-out survived reload; changing views and loading another puzzle afterward produced no further marked test events. Internal/test traffic is excluded from default reports. IP storage, replay, autocapture, console/performance capture, exceptions, surveys and heatmaps are disabled.
- The observed stream 429 cleared after duplicate test pages were closed. This is an observed concurrency limit, not a guarantee that a single-tab visitor cannot encounter upstream limits.

Earlier unchecked integration lists below are historical, from before this production check. Real iPhone storage persistence and Twitch playback remain unverified. Post-deployment sharing verification is recorded on https://github.com/ozgurbuluta/satrancWC26/pull/6. Full integration trail: https://github.com/ozgurbuluta/satrancWC26/issues/1.


What was run, where, and what came out. Unit and integration tests run in CI
on every push. The browser checks below need a real browser and are run by
hand; their scripts are in `tests/e2e/`.

## Automated (CI, every push)

`npm test`: pause and catch-up, board sync delay, following the match,
tie-break days, the analytics privacy contract, storage refusal, the
statistics switch (delayed start and page-leave included), nested Twitch
parents, legal-move entry, puzzle rules, prediction logic, the stream
finder, share links and the copy helper, the board's lifecycle, the
viewer's own line, the engine following the board, keyboard shortcuts, the
Turkish wording, time controls and move times, the workspace panels, the
engine's lines and decimals, the move predictor (features, the blend of
earlier moves with the base model worked out by hand, the score of the
match worked out by hand, rounding, the shipped model's tables, counts,
measurements and the score weights from the knockout study) and its panel (the score it may
use, every hidden and refused state), the wording of the page, the time
control said in the viewer's language, and what the engine card says about
the choice of move, who is winning, the win chances counted from real
games, the list of broadcasts (and what a choice that is no longer offered
falls back to), the moves as a table, the button that turns the board in
its two places, the top bar's mark and title and what is on its right, and
the settings tab as one block for each setting, the page asking for the
keyboard back from a frame on a press, and the match as a scoreboard (a row
for each player, a tile for each game, nothing said of a result the viewer
has not reached): 331 tests.
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

## Board, analysis, prediction and the workspace (issue 7)

Script: `tests/e2e/board.cjs`, against a simulated match (the feed is
replaced; the engine is the real one in the browser). Run on 25 November
2026 in headless Chromium against the preview build. 83 of 83 checks passed.

The script remembers the board node and every piece node, and records each
piece that is animated, added or removed, so the checks below are about the
board's own DOM and not only about the final position.

| One board, pieces that only move when a move is made | Result |
|---|---|
| One step back | same board node, exactly one piece animated, none added or removed |
| One step back over castling | exactly two pieces animated (king and rook) |
| 20 quick steps back, far past the start | same board, 32 pieces, first position |
| Back at the first position, six more times | nothing animated, added or removed; the control is disabled |
| Up arrow from the first position to the newest | shown at once, no piece animated |
| Home, End, quick steps back and forward | first position, newest position, same board |

| Moves of the viewer's own | Result |
|---|---|
| Dragging d2 to d3 at the newest position | the pawn stays; the strip shows "Analiz ● 6. d3"; the board is marked; sharing is gone |
| Engine | lines for the position on the board (Black to play move 6); the evaluation above the board has a score |
| A second move by two clicks | legal squares marked; the move joins the line |
| Two new moves of the game arrive | "Oyunda 2 yeni hamle oynandı."; the line and its position untouched |
| Left arrow | steps back inside the line |
| Up arrow, the button, the last-move control | each drops the line and shows the newest move; sharing is back |
| A line from an earlier move | starts there; "Analizi kapat" returns to where it started |
| An illegal drag | nothing changes |

| Prediction | Result |
|---|---|
| Guess mode on | asked in the Tahmin tab only; nothing about a guess in the board column |
| Engine beside the board | not hidden by guess mode |
| A move on the board | starts a line, makes no guess |
| A move picked from the list | becomes the guess; the board keeps the viewer's line |
| Arrow keys in the move field | do not drive the board |

| Promotion on the main board | Result |
|---|---|
| Pawn to the last rank | asks which piece |
| Arrow keys while the choice is open | nothing happens |
| Cancel | the pawn is back, nothing played |
| Rook | played into the line as an underpromotion |
| A game set up from a position | no invented clock ("–:––") |

| Puzzle | Result |
|---|---|
| The right move and the reply | same board node; at most two pieces animated; every other piece is the node it was |
| Start over | first position shown at once, nothing animated |

| Top bar, game list, broadcast | Result |
|---|---|
| The scoreboard | inside the 60 px bar: a row for each player, the name on the left and the total on the right in the title's serif, read as "Gukesh 1½, Sindarov ½" before the list of games |
| Game tiles | 14, each named ("1. oyun: Sindarov – Gukesh, ½–½"); played, live and coming told apart; the open one marked |
| A played game | a tile of two halves, each in its player's row, in the colour of the pieces that player had: ½ and ½ for a draw, 1 and 0 for a win |
| The game in progress | the pieces each has, no points, a red light |
| A game to come | one tall tile with its number; the second half of the match starts after a wider gap |
| At 1280 px | all fourteen tiles, clear of the title and of the view switch |
| Phone | the two rows of names and totals, no tiles |
| A square, and a row of the full list | opens its game |
| The full list | a dialog that takes the focus; Escape closes it and returns the focus |
| Broadcast | a labelled dropdown of the three listed channels; choosing changes the video; works from the keyboard; no link of the viewer's own and no button to another tab (both removed on 26 November 2026) |
| Time per move | both players named, longest think shown, one bar per move with a known time |

| Phone (390 px) and tablet (1024 px) | Result |
|---|---|
| Sideways scrolling | none at either width |
| Board on the phone | within 24 px of the full width |
| Controls | at least 40 px tall |
| A swipe that starts on a piece | scrolls the page, moves no piece |
| Two taps | play a move of the viewer's own |
| Way back to live on the phone | a full-width button of its own, 44 px tall |
| Game list on the phone | a drawer that fits the screen |
| Tablet | board and broadcast side by side, engine in the first tab |

The other scripts were updated to the new markup and run again on the same
build: `share.cjs` 61 of 61, `puzzles.cjs` 33 of 33, `embed.cjs` (desktop,
storage refused, phone) and `csp-engine.cjs` as before, with no page errors
and no content security policy violations. `guess.cjs` was removed: it
tested guessing on the board, which no longer exists; its place is taken by
the prediction checks above and by `tests/store.guess.test.ts`.

Not covered by this run: real Safari and a real phone for the new layout
and for tapping moves on the board.

## The model estimate (issues 4 and 13)

Run on 26 November 2026 in headless Chromium against the preview build, in
`tests/e2e/board.cjs` (136 of 136 checks), against a simulated match in
which Sindarov is to play move 6 of a Ruy Lopez.

| Model estimate, under the board | Result |
|---|---|
| Rows | three different legal moves and "Diğer hamleler"; 65 + 27 + 5 + 3 = 100 with the third version of the model |
| Title line | "Model tahmini" and "Sindarov için, 6. hamle"; no "Deneysel" label any more |
| Place | in the board column, below the board and its controls, in the flow of the page, not fixed or sticky; on a phone (390 px) under the board and above the tabs, inside the screen width |
| Its moves | text, not buttons: they cannot be mistaken for a guess |
| Explanation | none: no details block and no link |
| Guess panel | no estimate and no note under the masters' moves |
| Guess mode on, no guess yet | shown at once, all four rows, with no button and nothing to wait for |
| After a guess | as it was |
| A move of the viewer's own on the board | leaves the estimate about the game, not about the board |
| Board column | apart from the model's card, nothing there asks for a guess |
| Page errors | none |

Unit tests cover what the browser run does not: a paused viewer (the
estimate is for the position on the viewer's board, with that position's
clock), a finished game and a player who is not Gukesh or Sindarov (nothing
is shown), the match score (earlier games only, never the open game or a
later one, also while paused), and a legal move with a share under one
percent, which reads "<1 %" and never 0.

`share.cjs` 61 of 61 and `puzzles.cjs` 33 of 33 on the same build, and
`embed.cjs` in its three modes (desktop, storage refused, phone) with no
page errors: the outbound link it opens from inside the frame is now the
footer's, and the language switch is read off the last tab.

## The layout of 26 November 2026

Same run, same script.

| Columns and tabs (1440 × 900) | Result |
|---|---|
| Beside the board | win chance, the guess panel where the engine was, then time per move; no engine card there |
| Tabs | Stockfish, Benzer, Grafik, Maç, Ayarlar; Stockfish open by default; guessing is not a tab |
| First tab | the engine's lines, and under them the moves as a table of three columns (number, White, Black): ten moves in five rows |
| Guess mode | asks in its own card; the engine in its tab is not hidden by it |

| The right side made wider (1600 × 820) | Result |
|---|---|
| Free room beside the board | the buttons that turn the board and share sit there in a small rail, between the board and the divider; neither is under the board |
| The board with the rail | 546 × 546, exactly as without it |
| The rail's buttons | the first turns the board; sharing shows the link under the board, inside the column |
| Divider dragged as far left as it goes | the right side grows from 480 to 752 px; the board stops at 480 × 480 and stays square; nothing overflows |
| No room left beside the board | the two buttons are back under it |
| A saved width of 1400 px, after a reload | held to the same limit: board 480 × 480, nothing overflows |

Before this change the same drag left a board 323 px wide at 1728 × 1000
and 226 px at 1440 × 900. In Chromium it stayed square; in Özgür's
screenshot it did not (a board about half as wide as it was tall). The
board is now a plain block with a square aspect ratio rather than a
stretched flex item, which is the part that differs between browsers.

| Top bar | Result |
|---|---|
| Title | set in Fraunces, loaded from the site's own origin under the production content security policy (`font-src 'self'`) |
| 1728 px | one line, the place under it in capitals |
| 1280 px | exactly two lines ("Dünya Satranç" / "Şampiyonası 2026"), running into nothing |
| Phone | guessing is a tab after Stockfish; the two board buttons stay under the board |

| Tabs and top bar, second round of 26 November | Result |
|---|---|
| Top bar, right side | the status and the language; no connection dot |
| Benzer, how the games in the position ended | written out above the bar for all three results: "Beyaz 26% Berabere 60% Siyah 13%" for 14, 32 and 7 of 53 games (the masters database answered by the test) |
| Benzer, the small bars of the moves | a share is shown wherever its part of the bar is wide enough, Black's included (20 % shown in 43 px, 9 % in 19 px), and never cut off. Looked at separately on a 390 px phone: a 9 % share in 16 px is left out rather than clipped |
| Benzer, removed | no "Bu maçta" block, and no line while every move is a known one |
| Grafik | the chart's title with no line under it |
| Ayarlar | one block for each setting with its note inside; a rule above every block but the first, none under any, so none between a row and its note; the same padding in every block |

| The keyboard after a click in the video | Result |
|---|---|
| A click in the video | the keyboard is the video's: the focus is in its frame and the arrow keys do not reach the board (this is the browser's doing, and stays so) |
| Then a click on an empty square of the board | the focus is back on the page and ← steps a move. Before the fix it stayed in the frame, because the board cancels the press it receives and the browser then leaves the focus where it was |
| Then a click on a card, the footer or the list of moves | the same |
| A piece dragged straight after a click in the video | is played as usual, and ← then steps back through that line |
| A control that has the keyboard (the broadcast dropdown) | keeps it: the page takes the keyboard back from a frame and from nothing else |
| Inside the sandboxed frame of `/satranc/`, with the real video (`embed.cjs`, both desktop modes) | focus in the video, arrows held by it; after a click on the board the focus is on the page and the arrow moves the board again |

Looked at by eye in screenshots at 1024, 1280, 1440, 1600 and 1728 px and
on a 390 px phone. Not covered: real Safari (the board's shape there rests
on the stylesheet change above, not on a test), and a real phone.

The model file loads after the page as a part of its own (612 KB, 316 KB
compressed, with the third version's theory table); the page's own script
is unchanged in size. A unit test replays the two finished games of the
match through the browser's own code, with the score of the match passed
as the page passes it, and gets the numbers the training script measured,
to within the three weeks between the two ageing dates.

Not covered: real Safari, a real phone, and the estimate against the
production feed.

## Share links

Unit tests, 30 cases:

- `tests/share.test.ts` (9): the link is the public address plus `parti` and
  `hamle`, or `#bulmaca` with no query; a public address configured with a
  user name, password, query or fragment loses all of them; missing or
  out-of-range numbers are left out; a link that was built reads back as the
  same game and move.
- `tests/share.button.test.tsx` (10): the address in the browser never
  reaches the link; a refused copy shows the link focused and selected, also
  when the copy command throws; Escape closes the panel; a press after the
  board has moved on shares the new position; when the share action goes
  away or the game changes, its open panel goes with it.
- `tests/clipboard.test.ts` (6): the copy helper removes its hidden field
  and returns focus whether the copy command succeeds, says no, throws or
  does not exist.
- `tests/store.share.test.ts` (4): a round with one game can be shared; a
  round with several boards cannot, also after picking a board by hand; the
  action goes the moment a second board appears.
- `tests/analytics.test.ts` (1): the event carries the kind and whether
  copying worked, never the link.

Script: `tests/e2e/share.cjs`. Run on 25 November 2026 in headless Chromium
against the preview build made with
`VITE_PUBLIC_URL=https://ozgurakanay.com/satranc/` and the production
headers, with a simulated live game. The clipboard was read back from a
separate page after every copy. 61 of 61 checks passed.

Opened: `/?parti=1&hamle=4&internal=1&posthog=test&ref=x.com&utm_source=tw&utm_campaign=wc&secret=abc`

| Check | Result |
|---|---|
| Clipboard after pressing Paylaş | `https://ozgurakanay.com/satranc/?parti=1&hamle=4` |
| Anything else from the visitor's address, or the deployment's hostname, in the link | nothing |
| After one step forward on the board | `…?parti=1&hamle=5`; the open panel kept showing the first link until the next press |
| Start of the game | `…?parti=1&hamle=0` |
| Opening the copied link's query on the build | the same position is on the board |
| Puzzle corner | `https://ozgurakanay.com/satranc/#bulmaca` |
| A test broadcast (`?tour=…`) | no share button |
| A round with two boards (a tie-break day) | no share button, also after picking the other board; the puzzle corner keeps its own |
| Outcome announced | "Bağlantı kopyalandı." in a polite live region |
| Link also shown | in a labelled, read-only field, with Kopyala and Kapat |

| Copying refused | Result |
|---|---|
| Both ways of copying refused (the copy command says no) | "Bağlantı kopyalanamadı…", the clipboard left untouched |
| The same with a copy command that throws | the same; no hidden field is left in the page |
| The link | focused, all of it selected |
| Ctrl+C on that selection | the clipboard holds the public link |
| Arrow keys inside the field | move the caret; the game does not step |
| Escape | closes the panel, focus back on the button |

| Inside the sandboxed frame on another origin (`docs/embed-shell/`) | Result |
|---|---|
| Clipboard interface | refused by the browser (`NotAllowedError`): the frame has no clipboard permission |
| What the visitor gets | the older copy command did the copy; "Bağlantı kopyalandı." and the clipboard holds the public link |
| Older copy command refused too | says not copied, clipboard untouched, link focused and selected; Ctrl+C gives the link |
| Link shown | the public one in both cases |

| Keyboard only | Result |
|---|---|
| Tab reaches the button; focus indicator | yes |
| Enter | shares |
| Tab order in the panel | link, Kopyala, Kapat |
| Escape from inside the panel | closes it, focus back on the button |

| Phone size (390 px wide) | Result |
|---|---|
| Share button | icon only, named "Paylaş" for screen readers, 39×44 px |
| Following live | six controls and Duraklat on one row, no label cut off |
| Stepped back from live | "Canlıya dön" on a row of its own, no label cut off (before this change it was squeezed and ran off the edge) |
| Panel | fits the screen, no sideways scroll, 16 px text in the field, 40 px buttons |

After the change to the phone controls the other scripts were run again:
`puzzles.cjs` 33 of 33, `guess.cjs` 32 of 32, `embed.cjs` at phone size as
before.

Not covered by this run: real Safari, on a Mac and on an iPhone, inside the
real `/satranc/` page. Safari has its own rules for copying from a frame;
whichever way it goes, the page either copies or shows the selected link.

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

## Independent integration review (25 November 2026)

Codex ran the full suite locally on Node 22.23.5: **113 tests passed**,
with a clean type check, production build, and full-history secret scan.
Five added regression cases cover delayed puzzle fetches, cancellation of
already scheduled replies, promotion dismissal on puzzle changes/resets,
and pending guesses/engine peeks when switching zero-move games or rounds.
The live Lichess daily-puzzle response was also checked: it includes the
`fen`, `lastMove`, and `solution` fields used by the importer.

The personal-site wrapper in ozgurbuluta/ozgurakanay.com PR #8 passes four
URL privacy/deep-link tests and its Astro production build. Its Vercel preview
loaded the current production board, analysis, and nested YouTube player in
the in-app browser. Final Safari and hardened production frame checks remain
pending because native app control stopped responding. Analytics is still
disabled until the production variables are configured and ingestion verified.
