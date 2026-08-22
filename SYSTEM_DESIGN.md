# System Design Write-Up — Ticket Booking System

## 1. Seat Hold & TTL Mechanism

Every seat's lifecycle is tracked per-show in a single table, `show_seats`,
with one row per (show, physical seat) pair and a `status` enum:
`available → held → booked` (or back to `available`). Holding a seat is a
single `UPDATE` that sets `status='held'`, `held_by=<customerId>`, and
`held_until = now() + SEAT_HOLD_TTL_MINUTES`. No separate hold table or
cache layer (e.g. Redis) is used — the TTL lives directly on the seat row,
keeping the source of truth in one place and avoiding drift between stores.

TTL enforcement is deliberately layered so no single mechanism has to be
perfect:

- **Lazy expiry**: every seat-map read, hold attempt, and checkout first
  runs `UPDATE show_seats SET status='available' ... WHERE status='held'
  AND held_until < now()`. This guarantees a client never sees or acts on a
  stale hold, even under heavy load or if the background job is delayed.
- **Active sweep**: a `setInterval` job (`holdExpiry.job.js`) runs every 15
  seconds, releases any expired holds across all shows, and broadcasts the
  change over Socket.io so seats reappear as available in real time for
  everyone viewing that seat map — not just the next person who happens to
  hit an API endpoint. This is what satisfies "held seats auto-release on
  checkout abandonment" without requiring the abandoning customer to take
  any action.

## 2. Concurrency Prevention

The hardest requirement is: two customers click the same seat within
milliseconds, and exactly one must win, with the loser getting an
immediate, correct "unavailable" response. This is solved without explicit
row locking for the common case, using a single atomic compare-and-swap
statement:

```sql
UPDATE show_seats SET status='held', held_by=$user, held_until=$ttl
WHERE id = $seat AND status = 'available'
RETURNING id;
```

Postgres executes `UPDATE ... WHERE` atomically at the row level. If two
transactions race for the same row, Postgres's MVCC engine serializes them
internally: only one `UPDATE` matches `status='available'` and returns a
row; the other sees zero rows affected. The losing request gets an
immediate `409` with the specific seat IDs that failed — no polling, no
retries, no race window for the client to reason about.

For multi-seat selections, each seat in the batch is claimed with this same
CAS inside one database transaction. If any single seat in the batch fails,
the entire transaction rolls back, so a customer never ends up holding a
random subset of the seats they actually selected — the hold is all-or-
nothing. Checkout uses the same discipline: it locks the specific rows with
`SELECT ... FOR UPDATE` and only proceeds if every seat is still `held` by
that exact customer and the hold hasn't expired, closing the window where
an expired hold could otherwise be raced into a booking.

## 3. Waitlist Auto-Assignment Flow

Waitlists are scoped to `(show, seat_category)`, not to a specific physical
seat — a customer waiting for "any Premium seat" shouldn't care which
Premium seat frees up first. A customer may only join when that category
currently has zero available seats, enforced server-side by counting
`show_seats` rows at request time, not just gated in the UI.

When a booking is cancelled, each freed seat triggers
`offerSeatToNextInWaitlist(showId, categoryId, seatId)`:

1. The oldest `waiting` entry for that show+category is selected with
   `SELECT ... FOR UPDATE`, so if two seats in the same category are
   cancelled simultaneously, the row-level lock prevents both cancellations
   from offering a seat to the same waitlisted customer.
2. The freed seat is put into `status='held'` with `held_by` set to the
   waitlisted customer and `held_until` set to the offer expiry — **the
   offer itself is implemented as a hold**, reusing the exact same
   concurrency-safe primitive from §2. This means a walk-in customer
   browsing the live seat map cannot grab the seat out from under the
   waitlisted customer during the offer window.
3. The waitlist entry is updated to `status='offered'` with a random,
   unguessable `offer_token` and the same expiry, and an email is sent with
   a link `/waitlist/offer/{token}`.

If no one is waiting for that category, the seat is simply released back to
`available` — the exact same code path used for a normal cancellation with
no waitlist.

## 4. Time-Limited Offer Handling

Clicking the offer link calls `claimOffer`, which locks the waitlist entry
and the underlying seat row, verifies `offer_expires_at` hasn't passed and
that the seat is still held for that specific customer, and then converts
it directly into a confirmed booking — identical downstream logic (QR
generation, email, seat status flip to `booked`) to a normal checkout.

If the customer doesn't act in time, a second cron job
(`waitlistOffer.job.js`, running every minute) finds `offered` entries past
their expiry, marks them `expired`, and calls
`offerSeatToNextInWaitlist` again for the *same seat* — cascading the offer
to the next person in the queue automatically. This reuses the identical
offer-creation logic from §3, so the "offer → expire → re-offer" cycle is a
single recursive mechanism rather than special-cased code, and will
naturally terminate by releasing the seat once the queue is exhausted.
