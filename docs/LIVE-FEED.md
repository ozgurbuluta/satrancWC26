# The live feed and Lichess' request limits

How moves reach the page, what Lichess allows, what the page does today when
a request is refused, and a proposal to behave better. The proposal is not
built; it is tracked in https://github.com/ozgurbuluta/satrancWC26/issues/5.

The production check recovered a live push connection after duplicate test
tabs were closed. The observed 429 is consistent with a concurrent-request
limit on the shared network address. Other users on that address, or other
upstream limits, can affect a visitor with only one tab too.

## What an open page asks Lichess for

Every request goes from the visitor's browser straight to Lichess, without a
login and without a key. Limits therefore apply to the visitor's network
address, not to this site.

| Request | When | Purpose |
|---|---|---|
| `/api/stream/broadcast/round/{round}.pgn` | once per page, kept open | the push stream: a game's PGN arrives the moment a move is added |
| `/api/broadcast/round/{round}.pgn` | every 20 s while the stream is healthy, every 2.5 s while it is not, and when a hidden tab is shown again | safety net for a stalled stream |
| `/api/broadcast/-/-/{round}` | when a round is opened | when the latest move was played, federations |
| `/api/broadcast/{tour}` | on load, then every 60 s | the round list, to notice the next game |
| `/api/broadcast/{tour}.pgn` | on load, then every 3 min | the earlier games of the match |
| `/api/cloud-eval` | once per position shown, kept for the visit | evaluation lookup |
| `/api/puzzle/…` | one per puzzle, in the puzzle corner | |
| `explorer.lichess.ovh/masters` | once per position, in Benzer and Tahmin | another host with its own limits |

## The limits

- **Published rule.** Lichess asks API users to make one request at a time
  and, after an answer with status 429, to wait a full minute before using
  the API again (https://lichess.org/api, "Rate limiting").
- **Cap on simultaneous streams.** On 25 November 2026, during the
  production check, several test tabs of this site were open on one computer
  and the stream answered `429` with the text "only run 2 requests at a
  time". When the extra tabs were closed, the stream connected and the feed
  was live again. That is evidence of a concurrency limit in this check,
  not a guarantee of an identical limit for every visitor or request.
- **Captured headers.** The response inspected in this production check
  contained no `Retry-After` header; other responses may include one. Three
  simultaneous streams opened from the cloud test container the same day
  were all accepted; that traffic leaves through a proxy, so it does not
  establish a universal cap.

An address-level concurrency limit is shared by tabs and by people behind
the same home, office, school or mobile carrier address.

## What the page does today when it is refused

- The viewer still gets moves: the page polls every 2.5 s, so they arrive up
  to 2.5 s late.
- It does not treat the refusal as a refusal. A refused stream is handled
  like a dropped connection: the page tries again after 0.8 s, 1.6 s and so
  on, up to every 8 s, for as long as it is open. Together with the polls
  that is about 31 requests a minute from a refused tab (24 polls and 7 or 8
  stream attempts). None of them looks at the status code or at
  `Retry-After`, and none of them waits the minute the published rule asks
  for.
- The dot in the header says "Yeniden bağlanıyor", which is the wrong
  description: nothing is broken, the address is at its cap.
- If Lichess refuses the polls as well, the page keeps asking at the same
  pace.
- Only the evaluation lookup treats a 429 as such: it stops for 60 s and the
  engine in the browser takes over.

## Proposal

Fixed rules, no key in the page, no relay. Three steps, each a small pull
request of its own.

### Step 1: one shared cool-off after any 429

**Shared.** A 429 from Lichess on any request (stream, poll, round list,
earlier games, evaluation lookup, puzzle) starts one cool-off for all of
them. While it lasts the page starts no request to Lichess at all: no poll,
no stream attempt, no lookup. A stream that is already open is left as it
is, since keeping it open is not a new request.

**How long.**

- At least 60 s, the published minimum.
- If Lichess sends a valid `Retry-After` (whole seconds, or a date in the
  future) that is longer, the page waits that long, in full. A wait asked
  for by the server is never shortened.
- If 429s follow each other with no successful request in between, the
  page's own wait doubles: 60 s, 2 min, 4 min, then 5 min. That 5 min
  ceiling applies only to this locally chosen wait, never to what the
  server asks for.
- The wait used is the longer of the two.
- Jitter is only ever added: up to 20 % on top, so that tabs refused
  together do not come back together. It never brings a wait under 60 s or
  under what the server asked for.
- A `Retry-After` that cannot be read (not a number or a date, negative, in
  the past) counts as absent.

**Kept across reloads and tabs.** The time the cool-off ends is kept in the
browser's storage as one timestamp, so a reload or another tab of the site
waits as well. Where storage is refused it is kept in memory.

**One at a time.** Requests other than the open stream go through one
queue, so no two are in flight together.

**After the cool-off.** The first request is one poll, so the board catches
up. If that is refused, the cool-off starts again, doubled.

**When it was the stream that was refused.** A 429 can reflect concurrency
or another upstream limit. After the cool-off the page does not go straight back
to the stream, because another refusal would cost another silent minute. It
polls every 6 s and tries the stream again after 5 min, then 10 min, then
every 15 min. These are locally chosen waits with that 15 min ceiling. A
stream that connects ends this, and the page is back on the push feed.

**What the viewer sees.** During a cool-off the board keeps the last
position, and the header says that Lichess is limiting requests and when
the page will try again. While polling it says that moves arrive a few
seconds late, and that closing other tabs of the site brings the live
connection back. Neither is described as a broken connection.

**Evaluation and puzzles during a cool-off.** The engine in the browser
evaluates, and the puzzle corner uses its built-in set. Both already work
this way when Lichess cannot be reached.

**Not refusals.** Network drops and server errors keep today's quick
reconnect, with its ceiling of 8 s. Nothing has asked the page to slow down
there, and speed matters.

**The masters database** is on another host. A 429 from it starts a
cool-off of the same shape for that host only.

What this costs a refused viewer: the board stops for at least a minute,
then moves arrive up to 6 s late, and each later attempt at the stream that
is refused stops it for another minute. That is the price of following the
published rule. Step 2 removes the commonest cause.

### Step 2: one connection per browser

- Tabs of one browser choose a leader with the Web Locks API (one lock per
  round). The leader holds the stream and the safety poll and passes each
  PGN it receives to the other tabs over a `BroadcastChannel`. The other
  tabs open no stream and do not poll.
- When the leader is closed or crashes, the browser releases the lock,
  another tab becomes leader and polls once so that nothing is missed.
- The leader sends a heartbeat every 10 s. A tab that hears none for 25 s
  (a leader frozen in the background, as phones do) polls at 6 s until the
  heartbeat is back. A leader hidden for more than 30 s gives the lock up,
  so a visible tab takes it.
- The cool-off of step 1 holds for every tab: no tab polls during it,
  leader or not.
- The channel carries only what Lichess already publishes, reaches only
  tabs of this site in the same browser, and nothing but the cool-off
  timestamp is stored.
- Browsers keep a framed site's tabs apart by the site that frames them, so
  tabs opened through `ozgurakanay.com/satranc/` share one connection with
  each other, and a tab opened on the deployment's own address does not
  join them.
- Where Web Locks or `BroadcastChannel` is missing or refused, a tab behaves
  as in step 1. Both are in current Chrome, Edge and Firefox and in Safari
  from 15.4.

This removes the case that was seen (one person, several tabs). It does not
help several people behind one address; step 1 is what keeps those within
the rule.

### Step 3: measure before doing more

`feed_fallback` already counts visits that dropped to polling. Give it one
bounded property, `reason`: `refused` for a 429, `dropped` for anything
else. If refused visits turn out to be common, revisit the options below.

### Considered and not proposed

- **A Lichess token in the page.** It would be public, shared by every
  visitor, and would tie all traffic to one account.
- **A general relay** (`/api/lichess?path=…`). An open proxy, and it would
  put every visitor behind the host's few addresses, which makes the cap
  worse.
- **A fixed relay for this one feed.** One upstream stream for the round,
  passed on to visitors from this site's host, would lift the cap for
  everyone. It needs a long-lived connection per visitor, adds a hop to the
  fastest path, and makes this site a point of failure for the feed. The
  smaller version is a poll endpoint for the one tournament id with a second
  or two of CDN cache; it would add that delay and only serve refused
  visitors. Neither is proposed now.

### How it would be tested

- Unit tests with fake timers and a fake `fetch`:
  - after a 429 on any kind of request, no request of any kind for 60 s;
  - `Retry-After: 600` is waited in full, as is a date ten minutes ahead;
    0, a negative number, a past date and garbage give 60 s;
  - consecutive 429s give 60 s, 2 min, 4 min, 5 min, 5 min, and a success
    resets the count;
  - with jitter at its extremes the wait is never under the required
    minimum;
  - a reload during a cool-off sends nothing until it ends;
  - after a refused stream: one poll first, then polls 6 s apart and never
    two requests in flight, and the next stream attempt not before 5 min;
  - the quick retry is kept for network errors.
- Leader election with two simulated tabs: one stream, takeover when the
  leader goes, slow polling when the heartbeat stops, no polling by either
  during a cool-off.
- In a browser: four tabs, with the third simultaneous stream refused by a
  simulated Lichess. Expected: one upstream stream, moves in all four tabs,
  and a new leader within two seconds of closing the first.
