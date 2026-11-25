# Test evidence

What was run, where, and what came out. Unit and integration tests run in CI
on every push. The browser checks below need a real browser and are run by
hand; their scripts are in `tests/e2e/`.

## Automated (CI, every push)

`npm test`: pause and catch-up, board sync delay, following the match,
tie-break days, the analytics privacy contract, storage refusal, the
statistics switch (delayed start and page-leave included), nested Twitch
parents, legal-move entry, puzzle rules, guess-the-move logic, the stream
finder and share links: 131 tests.
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

## Share links

Unit tests (`tests/share.test.ts`, `tests/share.button.test.tsx`, 17 cases):
the link is the public address plus `parti` and `hamle`, or `#bulmaca` with
no query; a public address configured with a user name, password, query or
fragment loses all of them; missing or out-of-range numbers are left out; a
link that was built reads back as the same game and move; the address in
the browser never reaches the link; a refused copy shows the link focused
and selected; Escape closes the panel; a press after the board has moved on
shares the new position. One more case in `tests/analytics.test.ts`: the
event carries the kind and whether copying worked, never the link.

Script: `tests/e2e/share.cjs`. Run on 25 November 2026 in headless Chromium
against the preview build made with
`VITE_PUBLIC_URL=https://ozgurakanay.com/satranc/` and the production
headers, with a simulated live game. The clipboard was read back from a
separate page after every copy. 47 of 47 checks passed.

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
| Outcome announced | "Bağlantı kopyalandı." in a polite live region |
| Link also shown | in a labelled, read-only field, with Kopyala and Kapat |

| Copying refused | Result |
|---|---|
| Both ways of copying refused | "Bağlantı kopyalanamadı…", the clipboard left untouched |
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
