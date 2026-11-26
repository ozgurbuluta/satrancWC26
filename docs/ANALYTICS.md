# Analytics (PostHog)

Set up the same way as on ozgurakanay.com, but writing to **this site's own
PostHog project**. The two sites never share a project or a key: the key is
read from `VITE_POSTHOG_KEY`, and without it nothing is loaded or sent.

Code:
- `src/lib/analytics.ts`: PostHog's settings, the scrub that cleans every
  event before it leaves, `track()` and `setContext()`.
- `vercel.json`: the `/olay/` rewrite to `eu.i.posthog.com`.
- `src/components/SettingsPanel.tsx`: the visitor's statistics switch and
  what the site tells visitors. **Change that text with any change below.**

## Setting it up (once)

1. In PostHog Cloud EU, create a **new project** for this site.
2. In that project's settings turn on **cookieless tracking** (events are
   dropped without it) and **discard client IP data**.
3. In Vercel, add the project's key as `VITE_POSTHOG_KEY` for the
   **Production** environment only, then redeploy. Optionally set
   `VITE_ANALYTICS_HOST` to the production hostname.

## How it loads

- **Only with a key.** Local dev and previews without the variable send
  nothing; the library is not even part of that build.
- **Production host only** when `VITE_ANALYTICS_HOST` is set. To check
  another host, open it with `?posthog=test`: that tab sends events marked
  `traffic_type=test` until `?posthog=off`.
- **Cookieless.** `cookieless_mode: 'always'`, `person_profiles: 'never'`:
  no analytics cookies and no PostHog persistence in the browser. PostHog
  counts visitors with a hash that resets daily, so someone who returns the
  next day is a new visitor. No GeoIP in this mode.
- **Off by design:** autocapture, rage and dead clicks, heatmaps, exception
  capture, web vitals, session replay, surveys, product tours, feature
  flags, and loading anything from PostHog's servers.
- **Through this site.** Events go to `/olay/e/`, which Vercel rewrites to
  PostHog's EU host.
- **After the board.** The library is the slim build, bundled with the site
  and loaded about two seconds after the page, when the browser is idle.
- **Bots are dropped** by PostHog's own user-agent filter (headless browsers
  included, so automated tests send nothing).
- **Own visits:** open the site once with `?internal=1` in every browser you
  use (`?internal=0` undoes it). Those events carry `traffic_type=internal`.
- **Visitor opt-out:** the switch in Ayarlar stops recording at once and
  stores `satranc:analytics-off=1`; that browser then sends nothing.
- **Storage keys are namespaced** (`satranc:…`), so they cannot collide with
  another site's keys.

## The privacy contract

Enforced twice: when an event is recorded, and again in `before_send`, the
last step before anything leaves the page (`gate` in `src/lib/analytics.ts`).

- **Only listed events exist** (`EVENTS`). Each names the properties it may
  carry, and every property has a bounded type: one of a fixed set of words,
  a whole number in a range, true/false, or a bare hostname. Unknown events,
  unknown properties and out-of-bounds values are dropped.
- **Addresses.** This page's own address is sent without its query string and
  fragment. A referrer and a clicked link are reduced to their origin: no
  path, no query, no credentials. Campaign tags are not sent.
- **Nothing typed or pasted.** No stream link, no move text, no position, no
  game notation. A pasted stream link is recorded as its platform only.
- **PostHog's own properties** are an explicit short list (`SYSTEM_KEYS`).
  The page title, language list, screen size and the rest are removed.
  `$raw_user_agent`, `$host` and `$timezone` stay because cookieless counting
  is computed from them on PostHog's servers.
- **No person data:** `$set` and `$set_once` are deleted.
- **The visitor's switch acts at once.** Turning statistics off stops
  recording immediately and drops events already on their way out, whether
  or not the browser lets the page save the choice. If it does not, the
  site says the choice only lasts while the page is open.

`tests/analytics.test.ts` and `tests/storage.test.ts` cover this, including
credentials in paths and query strings and a browser that refuses storage.

## Every event carries

| Property | Values |
|---|---|
| `page_lang` | `tr`, `en` |
| `layout` | `phone`, `desktop` |
| `game_no` | game number being viewed (1–14, higher for tie-breaks) |
| `game_state` | `upcoming`, `live`, `finished`, `paused` |
| `traffic_type` | `internal` or `test`, when set |
| `embed` | `framed` when shown inside another page, else `direct` |
| `referrer_domain` | host the embedding page says the visitor came from |
| `view` | `live`, `puzzles` |

## Events

| Event | When | Properties |
|---|---|---|
| `$pageview` | the page loads | |
| `$pageleave` | leaving the page: time on page | |
| `view_open` | switching between the match and the puzzle corner | `view`: `live`, `puzzles` |
| `tab_open` | a tab is opened | `tab`: `analysis`, `predict`, `similar`, `charts`, `match`, `settings` |
| `game_select` | another game is opened | `how`: `manual` or `auto`, `game_no` (or `board` on tie-break days) |
| `next_game_dismiss` | "Burada kal" on the next-game announcement | |
| `move_browse` | first time earlier moves are browsed in a game | |
| `stream_select` | a stream preset is chosen | `stream`: preset id |
| `stream_toggle` | the video is hidden or shown | `hidden` |
| `stream_uncover` | the video is shown while the board is paused | |
| `sync_delay_set` | the board delay comes to rest on a value | `seconds` |
| `pause_start` | the board is paused | `at_move`, `game_over` |
| `pause_autoplay` | auto-play is switched on | `interval_ms` |
| `pause_restart` | "Baştan izle" | |
| `pause_end` | the pause ends | `reason`: `go_live` or `caught_up`, `moves_revealed` |
| `similar_game_open` | an earlier master game is expanded | `year` |
| `similar_preview` | a move of an earlier game is shown on the board | |
| `chart_jump` | a chart or list is used to jump to a move | `chart`: `eval`, `time`, `key_moment`, `longest_think`; `quality` for key moments |
| `setting_change` | a setting changes | `setting`, `value` |
| `outbound_click` | a link to another site | `link_domain` (host only) |
| `feed_fallback` | the live feed dropped to polling (once per visit) | |
| `analysis_start` | the viewer plays a first move of their own on the main board | `from`: `newest`, `earlier` |
| `guess_mode` | guess mode is switched on or off | `on` |
| `guess_result` | a guess is settled by the move that was played | `hit`, `quality` (currently always `unknown`) |
| `puzzle_start` | a puzzle is shown | `source`: `daily`, `lichess`, `builtin`; `theme`: `mix`, `mateIn1`, `mateIn2`, `short`, `endgame` |
| `share_link` | the share button is pressed | `kind`: `position`, `puzzles`; `copied`: whether the browser allowed the copy |
| `puzzle_end` | a puzzle is finished or left | `result`: `first_try`, `solved`, `revealed`, `skipped`; `rating_band`; `hint_used` |

## Questions these answer

- Where visitors come from: `$referring_domain` and `referrer_domain` on `$pageview`.
- What they open: `tab_open`, `game_select`, `stream_select`.
- What they use: the `pause_*` events, `sync_delay_set`, `similar_*`,
  `chart_jump`, `setting_change`, `guess_*`, `puzzle_*`.

Moves, positions and puzzle ids are never part of an event: a guess is
recorded as right or wrong, a puzzle as its rating band and how it ended.
A shared link is recorded as its kind and whether copying worked. The link
itself, the game number and the move are not sent.
- How long they stay: `$pageleave`, split by `game_state`.
- Whether the live feed holds up: `feed_fallback` against `$pageview`.
