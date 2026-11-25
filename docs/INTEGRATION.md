# Hosting and the `/satranc/` page

## Production integration verified — 25 November 2026

The core release is live at https://ozgurakanay.com/satranc/ (puzzles: `#bulmaca`). Chess commit `d0daa5a0a84f0f6e75621cd902c7abf78641da61` was deployed as `dpl_9PZSGCBYEcpAsrB3sY9ueAh81z96`; personal-site shell PR #8 is merged at `f39a04cfcde30086291dc0d524ad5882421daaeb`.

- Native Mac Safari and the in-app browser loaded the sandboxed chess frame and nested YouTube player. A real legal move guess, historical-frequency labels and puzzle interactions were checked.
- The production Stockfish WASM responds with HTTP 200 and `application/wasm`; production security headers match the reviewed configuration. Worker execution under that CSP is covered by the browser evidence below.
- Production-only analytics and public-URL variables are configured in Vercel, outside source control. The separate PostHog `satrancWC26` project received real framed pageviews and named feature events, marked `test` or `internal`, with cookieless mode and stripped query strings/fragments/referrer paths.
- Statistics opt-out survived reload; changing views and loading another puzzle afterward produced no further marked test events. Internal/test traffic is excluded from default reports. IP storage, replay, autocapture, console/performance capture, exceptions, surveys and heatmaps are disabled.
- The observed stream 429 cleared after duplicate test pages were closed. This is an observed concurrency limit, not a guarantee that a single-tab visitor cannot encounter upstream limits.

Earlier unchecked integration lists below are historical, from before this production check. Real iPhone storage persistence and Twitch playback remain unverified. Post-deployment sharing verification is recorded on https://github.com/ozgurbuluta/satrancWC26/pull/6. Full integration trail: https://github.com/ozgurbuluta/satrancWC26/issues/1.


Visitors use `https://ozgurakanay.com/satranc/`. The chess site itself runs as
its own Vercel project on its own origin, and the personal site shows it in a
frame. Nothing in this repository deploys anything, and the personal site is
not changed from here: `docs/embed-shell/` is a proposal for that page.

## Why a frame and not a sub-folder proxy

Serving the chess site from the personal site's origin (a `/satranc/*`
rewrite) would put it on the same origin as the newsletter panel. The panel's
session cookie is `HttpOnly`, `SameSite=Lax`, `path=/`, and the panel's write
check compares the request's origin with the site's. A script flaw in the
chess site, or in one of its dependencies, would then run with the panel's
session. A content security policy lowers that risk but is not an origin
boundary.

A frame on another origin is one:

- the chess site cannot read the parent page, its cookies or its storage;
- the panel cookie is never sent to the chess deployment;
- the frame is sandboxed without top navigation, so it cannot send the
  visitor anywhere;
- chess deploys never redeploy the personal site, and each site keeps its own
  environment variables and its own analytics project.

## The Vercel project

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Root directory | `./` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node | 22.x |
| Production branch | `main` |

`api/streams.js` is picked up as a function without configuration.

Environment variables, **Production scope only**:

| Variable | Value |
|---|---|
| `VITE_POSTHOG_KEY` | public key of the chess site's own PostHog project |
| `VITE_ANALYTICS_HOST` | the production hostname Vercel assigns, exactly |
| `VITE_PUBLIC_URL` | `https://ozgurakanay.com/satranc/` |
| `VITE_BASE_PATH` | unset (the site is served from `/`) |
| `VITE_POSTHOG_HOST` | unset (defaults to `/olay`) |

Analytics goes from the chess origin to `/olay` on the same origin, which
`vercel.json` forwards to `eu.i.posthog.com`: one hop, so PostHog sees the
visitor's address, which cookieless counting is computed from. The personal
site's `/olay` route and project are not involved.

## What the chess deployment sends with every response

Set in `vercel.json`, and served by `vite preview` as well so local tests run
under the same policy:

- `Content-Security-Policy` with `frame-ancestors 'self' https://ozgurakanay.com
  https://www.ozgurakanay.com https://staging.ozgurakanay.com`: no other site
  can frame it. Scripts only from itself (plus WebAssembly for the engine),
  connections only to itself and Lichess, frames only from YouTube, Twitch
  and Kick, no form targets, no `<base>`, no plugins.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, and a `Permissions-Policy` that closes
  camera, microphone, location, payment and device APIs.
- `X-Robots-Tag: noindex` on `*.vercel.app`, and a canonical link to
  `VITE_PUBLIC_URL`, so search engines list the public address only.

## The page on the personal site

`docs/embed-shell/index.html` and `shell.js` are the proposed page. Replace
`APP_ORIGIN` with the production origin.

- **Standalone document.** It must not use the shared layout: no navigation,
  no personal-site analytics, no other scripts.
- **Sandbox:** `allow-scripts allow-same-origin allow-popups
  allow-popups-to-escape-sandbox`.
  - `allow-scripts` runs the app.
  - `allow-same-origin` lets the frame keep its own origin (storage, engine
    worker, its analytics route). It is safe here because that origin is not
    the parent's. Chrome prints a generic warning about this pair of tokens;
    it applies to frames that share the parent's origin.
  - The two popup tokens let "open in a new tab" links open as normal tabs.
  - Left out: top navigation in any form, forms, modals, downloads, pointer
    lock, storage access. The app does not submit forms.
- **Allow:** `fullscreen; encrypted-media; picture-in-picture`, for the video
  player. No autoplay, clipboard, camera or microphone.
  - The share button works without a clipboard permission. In Chromium the
    frame is refused the clipboard interface, and the older copy command,
    which needs no permission, does the copy. Where that is refused as well,
    the link is shown selected and the visitor copies it by hand.
  - Adding `clipboard-write` to this list would let the clipboard interface
    work inside the frame. It only allows writing, and only after a click.
    It is not needed; whether real Safari wants it is not checked yet.
- **Referrer policy:** `strict-origin`, so the frame learns the site, not the
  address.
- **Deep links.** `shell.js` copies an allowlist from the page's address into
  the frame's: `parti` (game number), `hamle` (half-move), `internal`,
  `posthog`, and `ref` set to the host of an external referrer. Nothing else
  is passed on, and the page and the frame exchange no messages.
- **Shared links.** The share button builds its links on `VITE_PUBLIC_URL`
  and adds only `parti` and `hamle`, or the fragment `#bulmaca`. It never
  reads the frame's own address, so `internal`, `posthog`, `ref`, a test
  broadcast or the deployment's hostname cannot end up in a link. Without
  `VITE_PUBLIC_URL` the links point at the deployment itself. A link says
  which round and which half-move, not which board, so the button is shown
  only when the round has exactly one game. The address contract is not
  widened for tie-break days.
- **Height.** The frame is fixed to the viewport and scrolls inside. Safe-area
  padding keeps the notch and home bar clear.
- **Title.** Static. The tab title does not follow the game, because that
  would need messages from the frame.
- **Without the frame.** The frame has a title for screen readers. A link
  "Uygulamayı yeni sekmede aç" appears on keyboard focus, when the frame has
  not loaded after eight seconds, and in `<noscript>`.
- **Its own policy.** A `<meta>` CSP allows one frame, one script and the
  inline style, and nothing else.
- **Privacy page.** It should say that `/satranc/` shows an embedded app with
  its own anonymous statistics and YouTube players.
- **Colours.** The app is light now (page `#f1e9dd`). A wrapper that still
  paints `#262421` behind the frame and as its theme colour shows a dark
  flash before the app loads and dark safe-area bars on a phone; both should
  become `#f1e9dd`.

## Checked locally

The proposed page was served on one origin and the preview build, with the
production headers, on another.

| Check | Result |
|---|---|
| Address forwarded to the frame for `?parti=1&hamle=12&internal=1&secret=abc&utm_source=tw&posthog=evil` | `?parti=1&hamle=12&internal=1` |
| Deep link shows the linked move | yes |
| Frame reads the parent's document or cookies | blocked (`SecurityError`) |
| Frame navigates the top window | blocked (`SecurityError`) |
| Nested YouTube player loads inside the sandbox | yes |
| "Open in a new tab" link | opens a normal tab |
| Arrow keys work without a first click | yes |
| Frame fills the viewport, page itself does not scroll | yes, desktop and phone size |
| Content security policy violations | none |
| Engine (WebAssembly worker), masters lookup and charts under the policy | work |
| Storage refused for the chess origin | app works, settings keep working in memory, a notice says nothing will be remembered |

## Not checked yet

- **A real iPhone.** Storage inside a frame on another site is partitioned,
  and Safari may clear it between sessions. If it does, the pause point,
  settings and scores reset when Safari is closed. The app keeps working in
  memory and says so in Ayarlar; whether that is acceptable needs one test on
  a device.
- **Production.** The function at `/api/streams` and events arriving in the
  PostHog project.
- **Twitch inside the frame.** The player gets every ancestor host as a
  `parent`, as Twitch requires; it has unit tests but no browser test, since
  it needs the real hostnames.

## Order of work

1. Create the Vercel project from `main` and note the production hostname.
2. Merge the pull request, set the three variables, redeploy.
3. Open the production address directly and check: moves arrive, the stream
   plays, `/api/streams` answers, events arrive in PostHog marked
   `embed=direct`.
4. Add the page to the personal site on its staging host, check it framed,
   then publish.

Rolling back is removing that one page. The chess deployment stays where it is.

## Serving from a sub-folder instead

Not recommended, for the reason at the top. It is supported for other hosts:
set `VITE_BASE_PATH=/satranc/` and every asset, the engine and the function
resolve under that path. CI builds this variant on every push.
