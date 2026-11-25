# Engine precision and line selection

Follow-up to [issue 13](https://github.com/ozgurbuluta/satrancWC26/issues/13).

Engine scores now retain two decimal places everywhere that uses the shared
formatter: for example 19 centipawns is `+0.19`, and −120 is `−1.20`.
Mate scores keep their existing notation. This exposes the engine's centipawn
value; it does not imply greater search depth or certainty.

The engine card has a labelled **Varyant sayısı / Analysis lines** selector
with choices 1–5. Three remains the default. The choice is remembered locally,
validated when loaded, and is also used on narrow screens. No analytics event
is added for this preference.

The selected count is sent both to Lichess cloud evaluation and to Stockfish's
MultiPV option. Cache entries are separated by position and requested count.
An incomplete cloud entry may be shown while the local engine fills the
requested lines. Once complete, that local answer takes priority over a deeper
but incomplete cloud entry. A position with fewer legal moves does not wait
for nonexistent alternatives. Changing the count stops the old search before
starting the new one, and late answers cannot overwrite the active request.

Stockfish 19 lite remains a single browser worker with the existing depth/time
limits. Asking for more variations can reach less depth in the same time.
Lichess cached evaluation and local fallback remain free; no hosted compute
service, credentials or new dependency is introduced.

Validation: 262 unit/component tests, typecheck and production build pass.
Added coverage includes precision around zero and large scores, cloud request
counts, count-specific cache reuse, incomplete-cloud fallback, serialised local
search changes, stale responses, one-legal-move positions, persisted settings
and the actual selector interaction. Browser checks and deployment evidence are
recorded on the pull request.
