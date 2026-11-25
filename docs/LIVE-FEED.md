# The live feed and Lichess' request limits

How moves reach the page, what Lichess allows, what the page does today when
it is refused, and a proposal to behave better. The proposal is not built;
it is tracked in https://github.com/ozgurbuluta/satrancWC26/issues/5.

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
  and, after an answer with status 429, to wait a full minute before asking
  again (https://lichess.org/api, "Rate limiting").
- **Seen on 25 November 2026.** During the integration check, with several
  test tabs of this site open on one computer, the feed answered `429` with
  the text "only run 2 requests at a time". Closing the extra tabs cleared
  it. This reads as a cap of two simultaneous streams per address.
- **Not confirmed.** Three simultaneous streams opened from the cloud test
  container on the same day were all accepted. That traffic leaves through a
  proxy, so it says nothing either way. Whether the refusal carries a
  `Retry-After` header is not known.

The cap counts connections per address, not per tab. A third tab hits it,
and so do three people watching from one home, office or school connection,
or behind a mobile carrier's shared address.

## What the page does today when it is refused

- A refused stream is treated like any dropped connection. The page tries
  again after 0.8 s, 1.6 s and so on, up to every 8 s, for as long as it is
  open. Meanwhile it polls every 2.5 s. That is about 31 requests a minute
  from a refused tab (24 polls and 7 or 8 stream attempts). None of them
  looks at the status code or at `Retry-After`.
- The viewer still gets moves, up to 2.5 s late, and the dot in the header
  says "Yeniden bağlanıyor".
- If Lichess starts refusing the polls as well, the page keeps asking at the
  same pace. That is the opposite of the published rule.
- Only the evaluation lookup treats a 429 as such: it stops for 60 s and the
  engine in the browser takes over.

## Proposal

Fixed limits, no key in the page, no relay. Three steps, each a small pull
request of its own.

### Step 1: back off when refused

- A 429 on a Lichess request starts a cool-off for that kind of request
  (stream, poll, round list).
- Length of the cool-off: `Retry-After` when Lichess sends it (seconds or a
  date), but never less than 60 s and never more than 5 min. Without the
  header, 60 s. Each further 429 in a row doubles it, up to the same 5 min.
  A success resets it. Every wait gets ±20 % of jitter, so tabs refused
  together do not come back together.
- While the stream is cooling off, the poll continues at 6 s instead of
  2.5 s. A refused stream means too many connections, not a broken network.
  That is at most 10 polls and 1 stream attempt a minute, down from about 31.
- While the poll is cooling off, nothing is sent. The board keeps the last
  position, and the header says that Lichess is limiting requests and when
  the page will try again.
- Network drops and server errors keep today's quick reconnect, since speed
  matters there and nothing has asked the page to slow down.

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
- The channel carries only what Lichess already publishes, reaches only
  tabs of this site in the same browser, and nothing is stored.
- Browsers keep a framed site's tabs apart by the site that frames them, so
  tabs opened through `ozgurakanay.com/satranc/` share one connection with
  each other, and a tab opened on the deployment's own address does not
  join them.
- Where Web Locks or `BroadcastChannel` is missing or refused, a tab behaves
  as in step 1. Both are in current Chrome, Edge and Firefox and in Safari
  from 15.4.

This removes the case that was seen (one person, several tabs). It does not
help several people behind one address; step 1 is what keeps those polite.

### Step 3: measure before doing more

`feed_fallback` already counts visits that dropped to polling. Give it one
bounded property, `reason`: `refused` for a 429, `dropped` for anything
else. If refused visits turn out to be common, revisit the options below.

### Considered and not proposed

- **A Lichess token in the page.** It would be public, shared by every
  visitor, and would tie all traffic to one account.
- **A general relay** (`/api/lichess?path=…`). An open proxy, and it would
  put every visitor behind the host's few addresses, which makes the limit
  worse.
- **A fixed relay for this one feed.** One upstream stream for the round,
  passed on to visitors from this site's host, would lift the limit for
  everyone. It needs a long-lived connection per visitor, adds a hop to the
  fastest path, and makes this site a point of failure for the feed. The
  smaller version is a poll endpoint for the one tournament id with a second
  or two of CDN cache; it would add that delay and only serve refused
  visitors. Neither is proposed now.

### How it would be tested

- Unit tests with fake timers and a fake `fetch`: 429 with and without
  `Retry-After`; values of 0, a day and garbage end up between 60 s and
  5 min; doubling and reset; no more than 11 requests a minute while the
  stream is refused; none during a poll cool-off; the quick retry is kept
  for network errors.
- Leader election with two simulated tabs: one stream, takeover when the
  leader goes, slow polling when the heartbeat stops.
- In a browser: four tabs, with the third simultaneous stream refused by a
  simulated Lichess. Expected: one upstream stream, moves in all four tabs,
  and a new leader within two seconds of closing the first.
