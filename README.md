# 🎟️ Ticket Booking System

A full-stack ticket booking platform for movies and concerts: visual seat maps,
TTL-based seat holds with auto-release, waitlists with automatic seat
reassignment, and QR-coded e-tickets delivered by email — built end-to-end
and smoke-tested against a real PostgreSQL database (see "How this was
tested" below).

**Stack:** Node.js/Express · PostgreSQL · Socket.io · React (Vite) · Nodemailer · `qrcode`

---

## 1. Project Structure

```
ticket-booking-system/
├── backend/
│   ├── server.js                     # Express app entrypoint
│   ├── .env.example
│   └── src/
│       ├── config/                   # DB pool, Socket.io setup
│       ├── db/schema.sql             # Full Postgres schema (source of truth)
│       ├── db/migrate.js             # Applies schema.sql -> npm run migrate
│       ├── middleware/                # JWT auth, role guard, error handler
│       ├── routes/                    # Express routers (thin, one per resource)
│       ├── controllers/               # Business logic
│       └── services/                  # QR generation, email, waitlist logic, cron sweepers
└── frontend/
    ├── .env.example
    └── src/
        ├── api/api.js                 # axios instance (attaches JWT)
        ├── socket.js                  # Socket.io client
        ├── context/AuthContext.jsx
        ├── pages/                     # One file per screen
        └── components/                # SeatGrid, Timer, Navbar
```

---

## 2. Setup Guide

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ (local install, Docker, or a hosted instance — Render/Railway/Neon/Supabase all work)
- An SMTP account for sending email. Easiest free options: a Gmail account with an
  [App Password](https://myaccount.google.com/apppasswords), or a free-tier transactional
  email service (Mailtrap for testing, Brevo/Resend for real delivery).

### Backend

```bash
cd backend
cp .env.example .env      # then fill in DATABASE_URL, JWT_SECRET, SMTP_* etc.
npm install
npm run migrate           # creates all tables from src/db/schema.sql
npm run dev                # starts on http://localhost:5000 (nodemon, auto-reload)
# or: npm start            # production start
```

`npm run migrate` is idempotent-unsafe by design (it's a straight `schema.sql`
apply, not a migration framework) — run it once against a fresh database.
If you need to re-run it, drop and recreate the database first, or manually
`DROP TABLE ... CASCADE` before rerunning.

### Frontend

```bash
cd frontend
cp .env.example .env      # point VITE_API_URL / VITE_SOCKET_URL at your backend
npm install
npm run dev                # starts on http://localhost:5173
```

### Creating the first admin account
Public registration only allows `customer` or `organiser` roles (see
`auth.controller.js`) — admin accounts are provisioned directly in the
database, which is standard practice for a role that manages physical venue
infrastructure:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```
(Register a normal account first, then promote it with the query above.)

---

## 3. Environment Variables

### `backend/.env.example`
```
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ticket_booking

JWT_SECRET=change_this_to_a_long_random_string
JWT_EXPIRES_IN=7d

SEAT_HOLD_TTL_MINUTES=10
HOLD_SWEEP_INTERVAL_SECONDS=15

WAITLIST_OFFER_TTL_MINUTES=15

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM="Ticket Booking <no-reply@ticketbooking.com>"

APP_BASE_URL=http://localhost:5173
```

### `frontend/.env.example`
```
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

---

## 4. Database Schema (summary — full DDL in `backend/src/db/schema.sql`)

| Table              | Purpose |
|---------------------|---------|
| `users`              | customer / organiser / admin, role-based auth |
| `venues`             | admin-managed venue with a `rows × cols` layout |
| `seat_categories`    | e.g. Premium / Standard, mapped to a row range within a venue |
| `venue_seats`        | physical seat inventory for a venue (reused across all its shows) |
| `events`             | movie/concert listing (owned by an organiser) |
| `shows`              | a specific date/time/venue instance of an event |
| `show_pricing`       | per-category price for a given show |
| **`show_seats`**     | **one row per seat per show** — the row that gets atomically locked for hold/booking (see §5) |
| `bookings` / `booking_seats` | confirmed/cancelled bookings and the seats they cover |
| `waitlist_entries`   | queue per (show, category); tracks offer token + expiry |

`show_seats` is deliberately denormalized from `venue_seats`: a seat's
availability is scoped to one show, so two different shows at the same venue
have completely independent seat maps even though they share the same
physical layout.

---

## 5. Seat Hold, TTL & Concurrency — how it actually works

**The core problem:** two customers click the same seat within milliseconds
of each other. Exactly one must win; the loser must get a clean, immediate
"unavailable" response — never a stuck UI, a double-booking, or a lost hold.

**The mechanism (compare-and-swap via a single atomic UPDATE):**

```sql
UPDATE show_seats
SET status = 'held', held_by = $customerId, held_until = $now+10min
WHERE id = $seatId AND status = 'available'
RETURNING id;
```

Postgres guarantees this single-statement `UPDATE ... WHERE` is atomic. If
two requests race for the same row, Postgres serializes them internally —
only one `UPDATE` actually matches `status = 'available'` and returns a row
(`rowCount = 1`); the other returns `rowCount = 0`. No explicit
`SELECT ... FOR UPDATE` locking is needed for a single seat, which keeps the
common path fast.

For **multi-seat holds**, each seat in the request is claimed with this same
CAS inside one transaction. If *any* seat in the batch fails (`rowCount = 0`),
the whole transaction is rolled back — the customer never ends up holding a
random subset of what they selected (see `holdSeats` in
`booking.controller.js`).

**TTL enforcement is layered, not single-point-of-failure:**
1. **Lazy expiry** — every read of the seat map, every hold attempt, and
   every checkout first runs `UPDATE show_seats SET status='available' ...
   WHERE status='held' AND held_until < now()`. This guarantees correctness
   even if the sweeper below hasn't run yet.
2. **Active sweeper** (`holdExpiry.job.js`) — a `setInterval` every
   `HOLD_SWEEP_INTERVAL_SECONDS` (default 15s) proactively releases expired
   holds and broadcasts the change over Socket.io, so seats free up in
   real time for everyone viewing the seat map — not just the next person
   who happens to hit an API endpoint.

**Checkout** only succeeds if the requesting customer currently holds the
seat *and* the hold hasn't expired (`status='held' AND held_by=$user AND
held_until > now()`), verified inside a `FOR UPDATE`-locked transaction —
this is what makes "abandon checkout → auto-release → seat re-listed" safe:
an abandoned hold simply ages out and can never be converted into a booking
after expiry.

---

## 6. Waitlist Auto-Assignment & Time-Limited Offers

1. **Join**: a customer can only join the waitlist for a `(show, category)`
   pair that has zero available seats — enforced server-side, not just in
   the UI (`joinWaitlist` in `waitlist.controller.js`).
2. **On cancellation**: `cancelBooking` frees each seat and calls
   `offerSeatToNextInWaitlist(showId, categoryId, seatId)`, which:
   - Locks the oldest `waiting` entry for that show+category with
     `SELECT ... FOR UPDATE` (so two simultaneous cancellations can't both
     offer the same waitlist slot to different people),
   - Puts the seat into `status='held'` with `held_by` = the waitlisted
     customer and `held_until` = now + `WAITLIST_OFFER_TTL_MINUTES` — **the
     offer *is* a hold**, so the seat can't be grabbed by a walk-in browsing
     the seat map while the offer is pending,
   - Generates a random 48-byte `offer_token`, stores it on the
     `waitlist_entries` row, and emails a claim link:
     `{APP_BASE_URL}/waitlist/offer/{token}`.
3. **Claim**: hitting that link (`claimOffer`) converts the held seat
   directly into a confirmed booking, provided `offer_expires_at` hasn't
   passed — same QR + email flow as a normal checkout.
4. **If the offer times out**: `waitlistOffer.job.js` runs every minute,
   finds `offered` entries past `offer_expires_at`, marks them `expired`,
   and calls the *same* `offerSeatToNextInWaitlist` function again — the
   seat cascades to the next person in line automatically, with no manual
   intervention. If the queue is empty, the seat is simply released back to
   `available`.

If a seat is cancelled and nobody is on the waitlist for that category, it's
released back to `available` immediately.

---

## 7. QR Code & Email Delivery

- `qr.service.js` encodes `{ ref: bookingRef, type: 'ticket' }` as a QR
  (not the full booking payload — venue staff scan and look up the booking
  server-side, keeping the QR small and avoiding leaking seat/customer data).
- `email.service.js` sends the confirmation email with the QR embedded
  inline via a `cid:` attachment (renders in the email body, not just as a
  downloadable attachment) using Nodemailer over SMTP — works with any
  free-tier provider (Gmail app password, Mailtrap, Brevo, Resend, etc.).
- Email sending is **best-effort and non-blocking**: it's fired after the
  booking transaction has already committed, so a flaky SMTP connection
  never causes a successful booking to fail or roll back.

---

## 8. API Reference (all routes prefixed `/api`)

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | – | `{name, email, password, role?}` → customer/organiser only |
| POST | `/auth/login` | – | `{email, password}` → `{user, token}` |
| GET  | `/auth/me` | ✅ | Current user profile |
| POST | `/venues` | admin | Create venue + seat categories + auto-generated seat grid |
| GET  | `/venues` / `/venues/:id` | – | List / inspect venues |
| POST | `/events` | organiser | Create an event listing |
| POST | `/events/:eventId/shows` | organiser | Create a show (venue+date+time+pricing), materializes `show_seats` |
| GET  | `/events` | – | Browse/filter events (`?type=`, `?title=`) |
| GET  | `/events/:eventId/shows` | – | Shows for an event |
| GET  | `/shows/:showId/seats` | – | Full seat map with live status |
| POST | `/shows/:showId/hold` | customer | `{seatIds[]}` — atomic CAS hold with TTL |
| POST | `/shows/:showId/release` | customer | `{seatIds[]}` — explicit release (abandon checkout) |
| POST | `/shows/:showId/checkout` | customer | `{seatIds[]}` → confirmed booking + QR + email |
| POST | `/shows/:showId/waitlist` | customer | `{categoryId}` — join waitlist (only if sold out) |
| GET  | `/bookings` | customer | Booking history |
| POST | `/bookings/:id/cancel` | customer | Cancel → triggers waitlist offer or release |
| GET  | `/waitlist` | customer | My waitlist entries |
| GET  | `/waitlist/offer/:token` | customer | Claim a time-limited waitlist offer |
| GET  | `/organiser/events` / `/organiser/summary` | organiser | Bookings & revenue per event/show |

**Socket.io event:** clients `emit('join_show', showId)` after loading a seat
map and receive `seat_update` events (`{showId, seats: [{show_seat_id, status}]}`)
whenever a hold, checkout, cancellation, or TTL expiry changes any seat on
that show — this is what keeps the seat grid live across browser tabs without
polling.

---

## 9. How this was built & tested

The full stack was built and exercised against a **real local PostgreSQL
instance** (not mocked) during development:
- `npm install` on both backend and frontend completed cleanly.
- Every backend file passed `node --check` (syntax validation) and `npm run build` succeeded on the frontend.
- The schema was applied via `npm run migrate` against a live database.
- An end-to-end scripted test exercised: registration across all three
  roles → venue/event/show creation → **two simultaneous hold requests for
  the same seat (only one ever succeeds)** → checkout → QR generation →
  sell-out → waitlist join → booking cancellation → **automatic waitlist
  offer generation** → offer claim via token → organiser revenue summary
  (verified against known ground-truth numbers) → hold TTL visible in the
  live seat map.
- Two real bugs were caught and fixed in this process: Postgres rejects
  `FOR UPDATE` combined with a `LEFT JOIN` (checkout/claim queries were
  restructured to lock the base table only), and the organiser summary
  query had a join fan-out that inflated seat/revenue counts (fixed with
  pre-aggregated subqueries).

For your own run: after `npm run migrate`, start the backend and frontend
per §2, register an organiser + a couple of customer accounts, promote one
user to `admin` via the SQL above, create a venue, an event, and a show, and
walk through the booking flow in two browser tabs to see the real-time seat
map and the concurrency protection yourself.

---

## 10. Deployment Notes

- **Backend**: deploy to Render/Railway (Node web service) with a managed
  Postgres add-on; set all `backend/.env` vars in the platform's dashboard;
  run `npm run migrate` once via a one-off shell/job after first deploy.
- **Frontend**: deploy to Vercel/Netlify/Render as a static build
  (`npm run build` → `dist/`); set `VITE_API_URL`/`VITE_SOCKET_URL` to the
  deployed backend URL.
- Remember to set `CLIENT_ORIGIN` on the backend to the deployed frontend's
  origin so CORS and Socket.io both work in production.

---

## 11. Known Limitations / Possible Extensions

- No payment gateway integration — `checkout` confirms the booking
  directly (a real system would authorize payment before flipping seats to
  `booked`, then confirm/rollback based on the payment result).
- Seat map layout is a simple rectangular grid; irregular venue shapes
  (curved rows, aisles, boxes) would need a richer `venue_seats` schema.
- No admin UI for managing existing venues beyond creation (edit/delete
  omitted for scope).
