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
- **Visitor opt-out:** the switch in Ayarlar writes `analytics-off=1` to
  localStorage; that browser then sends nothing.

## What the scrub removes

- this site's own URLs keep only `utm_*`, `tour` and `round`, and lose the
  `#fragment`;
- a referrer from another site keeps only its address and path;
- a link to another site loses credentials, ad-click and share ids;
- anything that looks like an email address becomes `[redacted]`.

A pasted stream link is never sent: only its platform is.

## Every event carries

| Property | Values |
|---|---|
| `page_lang` | `tr`, `en` |
| `layout` | `phone`, `desktop` |
| `game_no` | game number being viewed (1–14, higher for tie-breaks) |
| `game_state` | `upcoming`, `live`, `finished`, `paused` |
| `traffic_type` | `internal` or `test`, when set |

## Events

| Event | When | Properties |
|---|---|---|
| `$pageview` | the page loads | |
| `$pageleave` | leaving the page: time on page | |
| `tab_open` | a tab is opened | `tab`: `analysis`, `similar`, `charts`, `match`, `settings` |
| `game_select` | another game is opened | `how`: `manual` or `auto`, `game_no` (or `board` on tie-break days) |
| `next_game_dismiss` | "Burada kal" on the next-game announcement | |
| `move_browse` | first time earlier moves are browsed in a game | |
| `stream_select` | a stream preset is chosen | `stream`: preset id or `custom` |
| `stream_link_paste` | a pasted link is accepted | `platform`: `youtube`, `twitch`, `kick` |
| `stream_toggle` | the video is hidden or shown | `hidden` |
| `stream_uncover` | the video is shown while the board is paused | |
| `sync_delay_set` | the board delay comes to rest on a value | `seconds` |
| `pause_start` | the board is paused | `at_move`, `game_over` |
| `pause_autoplay` | auto-play is switched on | `seconds` |
| `pause_restart` | "Baştan izle" | |
| `pause_end` | the pause ends | `reason`: `go_live` or `caught_up`, `moves_revealed` |
| `similar_game_open` | an earlier master game is expanded | `year` |
| `similar_preview` | a move of an earlier game is shown on the board | |
| `chart_jump` | a chart or list is used to jump to a move | `chart`: `eval`, `time`, `key_moment`, `longest_think`; `quality` for key moments |
| `setting_change` | a setting changes | `setting`, `value` |
| `outbound_click` | a link to another site | `link_url`, `link_domain` |
| `feed_fallback` | the live feed dropped to polling (once per visit) | |

## Questions these answer

- Where visitors come from: `$referrer` on `$pageview`.
- What they open: `tab_open`, `game_select`, `stream_select`.
- What they use: the `pause_*` events, `sync_delay_set`, `similar_*`,
  `chart_jump`, `setting_change`.
- How long they stay: `$pageleave`, split by `game_state`.
- Whether the live feed holds up: `feed_fallback` against `$pageview`.
