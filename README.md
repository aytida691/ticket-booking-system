# 🎟️ Ticket Booking System

A full-stack ticket booking platform for movies and concerts: visual seat maps,
TTL-based seat holds with auto-release, waitlists with automatic seat
reassignment, and QR-coded e-tickets delivered by email.

**Stack:** Node.js/Express · PostgreSQL (Neon) · Socket.io · React (Vite) · Nodemailer · `qrcode`
**Hosting:** Backend on Render · Frontend on Vercel · Database on Neon

---

## 🔗 Live Deployment

| Component | URL |
|---|---|
| **Live site** | `https://ticket-booking-system-pearl.vercel.app` |
| **API health check** | `https://ticket-booking-api.onrender.com/health` |

> ⚠️ The backend is hosted on Render's free tier, which sleeps after 15 minutes
> of inactivity. The first request after a period of no traffic may take
> 30–60 seconds to respond while it wakes up — this is expected, not a bug.

---

## 1. Project Structure

```
ticket-booking-system/
├── backend/
│   ├── server.js                     # Express app entrypoint
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── config/
│       │   ├── db.js                 # PostgreSQL connection pool
│       │   └── socket.js             # Socket.io setup + broadcast helper
│       ├── db/
│       │   ├── schema.sql            # Full Postgres schema (source of truth)
│       │   └── migrate.js            # Applies schema.sql -> npm run migrate
│       ├── middleware/
│       │   ├── auth.js               # JWT auth + role-based access guard
│       │   └── errorHandler.js
│       ├── routes/                   # Express routers (one per resource)
│       │   ├── auth.routes.js
│       │   ├── venue.routes.js
│       │   ├── event.routes.js
│       │   ├── show.routes.js
│       │   ├── booking.routes.js
│       │   ├── waitlist.routes.js
│       │   └── organiser.routes.js
│       ├── controllers/              # Business logic
│       │   ├── auth.controller.js
│       │   ├── venue.controller.js
│       │   ├── event.controller.js
│       │   ├── show.controller.js
│       │   ├── booking.controller.js
│       │   ├── waitlist.controller.js
│       │   └── organiser.controller.js
│       ├── services/
│       │   ├── qr.service.js         # QR code generation
│       │   ├── email.service.js      # Booking + waitlist offer emails
│       │   ├── waitlist.service.js   # Shared waitlist auto-assignment logic
│       │   ├── holdExpiry.job.js     # Cron: sweeps expired seat holds
│       │   └── waitlistOffer.job.js  # Cron: sweeps expired waitlist offers
│       └── utils/
│           └── jwt.js
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── .env.example
    └── src/
        ├── main.jsx
        ├── App.jsx                   # Routes + role-based route guards
        ├── api/api.js                 # axios instance (attaches JWT)
        ├── socket.js                  # Socket.io client
        ├── context/AuthContext.jsx
        ├── components/
        │   ├── Navbar.jsx
        │   ├── SeatGrid.jsx
        │   └── Timer.jsx
        ├── pages/
        │   ├── Login.jsx
        │   ├── Register.jsx
        │   ├── EventList.jsx
        │   ├── EventDetail.jsx
        │   ├── ShowSeatMap.jsx        # Core booking UI: live seat map, hold, checkout
        │   ├── BookingHistory.jsx
        │   ├── MyWaitlist.jsx
        │   ├── WaitlistOffer.jsx      # Destination of the emailed claim link
        │   ├── OrganiserDashboard.jsx
        │   ├── CreateEvent.jsx
        │   └── AdminVenues.jsx
        └── styles.css
```

---

## 2. Running Locally

### Prerequisites
- Node.js 18+
- A PostgreSQL database — local install, or a free cloud instance (Neon, Supabase, Render Postgres)
- An SMTP account for sending email (Gmail App Password, Mailtrap, Brevo, Resend, etc.)

### Backend

```bash
cd backend
cp .env.example .env      # fill in DATABASE_URL, JWT_SECRET, SMTP_* — see §4
npm install
npm run migrate           # creates all tables from src/db/schema.sql
npm run dev                # http://localhost:5000 (nodemon, auto-reload)
```

### Frontend

Open a second terminal:

```bash
cd frontend
cp .env.example .env      # point VITE_API_URL / VITE_SOCKET_URL at your backend
npm install
npm run dev                # http://localhost:5173
```

### Creating the first admin account

Public registration only allows `customer` or `organiser` roles — admin
accounts are provisioned directly in the database, since that role manages
physical venue infrastructure and shouldn't be self-serve:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```
Register a normal account first, run this against your database, then log
out and back in on the site.

---

## 3. Deployment (how the live version above was set up)

This project is deployed across three free-tier services. Steps to reproduce:

### 3a. Database — Neon

1. Sign up at [neon.tech](https://neon.tech), create a project
2. Copy the connection string it provides (includes `?sslmode=require`)
3. Use it as `DATABASE_URL` in both local `.env` (temporarily, to run the
   migration) and in Render's environment variables (permanently)

### 3b. Backend — Render

1. Push the repo to GitHub (public, `main` branch)
2. On [render.com](https://render.com): **New → Web Service** → connect the repo
3. Settings:
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add all environment variables from `backend/.env.example` (see §4) —
   `CLIENT_ORIGIN` and `APP_BASE_URL` can be added once the Vercel URL exists
5. Deploy, then confirm `https://<your-render-url>/health` returns `{"status":"ok"}`

**Applying the schema to Neon:** Render's free tier doesn't include Shell
access. Instead, run the migration from your own machine by temporarily
pointing local `backend/.env`'s `DATABASE_URL` at the Neon string and
running `npm run migrate` — this applies `schema.sql` to Neon directly, no
Render shell required. (Alternatively, paste `schema.sql`'s contents into
Neon's own SQL Editor and run it there.)

### 3c. Frontend — Vercel

1. On [vercel.com](https://vercel.com): **Add New → Project** → import the same repo
2. Root Directory: `frontend` (Framework auto-detects as Vite)
3. Environment variables:
   - `VITE_API_URL` = `https://<your-render-url>/api`
   - `VITE_SOCKET_URL` = `https://<your-render-url>`
4. Deploy — Vercel provides the live frontend URL

### 3d. Connect them (CORS)

Back in Render → Environment tab, set:
- `CLIENT_ORIGIN` = your Vercel URL
- `APP_BASE_URL` = your Vercel URL

Save — Render redeploys automatically. Without this, the browser blocks API
calls from the deployed frontend, and waitlist offer emails would link to
the wrong place.

---

## 4. Environment Variables

### `backend/.env.example`
```env
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

> For Gmail, `SMTP_PASS` must be a 16-character **App Password**
> (myaccount.google.com/apppasswords), not your normal login password.

### `frontend/.env.example`
```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

---

## 5. Database Schema (summary — full DDL in `backend/src/db/schema.sql`)

| Table | Purpose |
|---|---|
| `users` | customer / organiser / admin, role-based auth |
| `venues` | admin-managed venue with a `rows × cols` layout |
| `seat_categories` | e.g. Premium / Standard, mapped to a row range within a venue |
| `venue_seats` | physical seat inventory for a venue (reused across all its shows) |
| `events` | movie/concert listing (owned by an organiser) |
| `shows` | a specific date/time/venue instance of an event |
| `show_pricing` | per-category price for a given show |
| **`show_seats`** | **one row per seat per show** — the row atomically locked for hold/booking (see §6) |
| `bookings` / `booking_seats` | confirmed/cancelled bookings and the seats they cover |
| `waitlist_entries` | queue per (show, category); tracks offer token + expiry |

`show_seats` is deliberately denormalized from `venue_seats`: availability is
scoped to one show, so two different shows at the same venue have fully
independent seat maps even though they share the same physical layout.

---

## 6. Seat Hold, TTL & Concurrency

**The problem:** two customers click the same seat within milliseconds of
each other — exactly one must win, and the loser must get an immediate,
correct "unavailable" response.

**The mechanism** — a single atomic compare-and-swap `UPDATE`:

```sql
UPDATE show_seats
SET status = 'held', held_by = $customerId, held_until = $now+10min
WHERE id = $seatId AND status = 'available'
RETURNING id;
```

Postgres executes this atomically at the row level. If two requests race
for the same row, only one `UPDATE` matches `status='available'` and
returns a row (`rowCount = 1`); the loser gets `rowCount = 0`. No explicit
locking needed for a single seat. For multi-seat holds, each seat in the
batch is claimed with this same CAS inside one transaction — if any seat
fails, the whole hold rolls back, so a customer never ends up holding a
random subset of what they selected.

**TTL enforcement is layered:**
1. **Lazy expiry** — every seat-map read, hold attempt, and checkout first
   flips any `held` seat past its `held_until` back to `available`.
2. **Active sweeper** (`holdExpiry.job.js`) — runs every
   `HOLD_SWEEP_INTERVAL_SECONDS` (default 15s), releases expired holds
   proactively, and broadcasts the change over Socket.io so seats free up
   live for everyone viewing that seat map.

**Checkout** only succeeds if the requesting customer currently holds the
seat and the hold hasn't expired, verified inside a `FOR UPDATE`-locked
transaction — this is what makes "abandon checkout → auto-release" safe.

---

## 7. Waitlist Auto-Assignment & Time-Limited Offers

1. **Join**: a customer can only join the waitlist for a `(show, category)`
   pair with zero available seats — enforced server-side.
2. **On cancellation**: each freed seat calls
   `offerSeatToNextInWaitlist(showId, categoryId, seatId)`, which:
   - Locks the oldest `waiting` entry with `SELECT ... FOR UPDATE`
   - Puts the seat into `status='held'` with `held_by` = the waitlisted
     customer and `held_until` = now + `WAITLIST_OFFER_TTL_MINUTES` — **the
     offer itself is implemented as a hold**, reusing the same
     concurrency-safe primitive from §6
   - Emails a claim link: `{APP_BASE_URL}/waitlist/offer/{token}`
3. **Claim**: the link converts the held seat directly into a confirmed
   booking, provided the offer hasn't expired.
4. **If the offer times out**: `waitlistOffer.job.js` (runs every minute)
   marks it `expired` and re-offers the same seat to the next person in
   line automatically — cascading until claimed or the queue is empty, at
   which point the seat is released back to `available`.

---

## 8. QR Code & Email Delivery

- QR encodes `{ ref: bookingRef, type: 'ticket' }` — venue staff scan and
  look up the booking server-side, keeping the payload small and avoiding
  leaking seat/customer data in a scannable code.
- Confirmation emails embed the QR inline via a `cid:` attachment using
  Nodemailer over SMTP.
- Email sending is **best-effort and non-blocking** — fired after the
  booking transaction has already committed, so a flaky SMTP connection
  never rolls back a successful booking.

---

## 9. API Reference (all routes prefixed `/api`)

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | – | `{name, email, password, role?}` → customer/organiser only |
| POST | `/auth/login` | – | `{email, password}` → `{user, token}` |
| GET | `/auth/me` | ✅ | Current user profile |
| POST | `/venues` | admin | Create venue + seat categories + auto-generated seat grid |
| GET | `/venues`, `/venues/:id` | – | List / inspect venues |
| POST | `/events` | organiser | Create an event listing |
| POST | `/events/:eventId/shows` | organiser | Create a show (venue+date+time+pricing), materializes `show_seats` |
| GET | `/events` | – | Browse/filter events (`?type=`, `?title=`) |
| GET | `/events/:eventId/shows` | – | Shows for an event |
| GET | `/shows/:showId/seats` | – | Full seat map with live status |
| POST | `/shows/:showId/hold` | customer | `{seatIds[]}` — atomic CAS hold with TTL |
| POST | `/shows/:showId/release` | customer | `{seatIds[]}` — explicit release (abandon checkout) |
| POST | `/shows/:showId/checkout` | customer | `{seatIds[]}` → confirmed booking + QR + email |
| POST | `/shows/:showId/waitlist` | customer | `{categoryId}` — join waitlist (only if sold out) |
| GET | `/bookings` | customer | Booking history |
| POST | `/bookings/:id/cancel` | customer | Cancel → triggers waitlist offer or release |
| GET | `/waitlist` | customer | My waitlist entries |
| GET | `/waitlist/offer/:token` | customer | Claim a time-limited waitlist offer |
| GET | `/organiser/events`, `/organiser/summary` | organiser | Bookings & revenue per event/show |

**Socket.io event:** clients `emit('join_show', showId)` after loading a seat
map and receive `seat_update` events whenever a hold, checkout,
cancellation, or TTL expiry changes any seat on that show.

---

## 10. How this was built & tested

Built and exercised against a real local PostgreSQL instance during
development, then against Neon in production:
- `npm install` clean on both backend and frontend; every backend file
  passed `node --check`; `npm run build` succeeded on the frontend
- Schema applied via `npm run migrate` against a live database
- An end-to-end scripted test covered: registration across all three roles
  → venue/event/show creation → **two simultaneous hold requests for the
  same seat (only one ever succeeds)** → checkout → QR generation →
  sell-out → waitlist join → booking cancellation → **automatic waitlist
  offer generation** → offer claim via token → organiser revenue summary
  (verified against known ground-truth numbers) → hold TTL visible live in
  the seat map
- Two real bugs were caught and fixed during this process: Postgres
  rejects `FOR UPDATE` combined with a `LEFT JOIN` (checkout/claim queries
  restructured to lock the base table only), and the organiser summary
  query had a join fan-out inflating seat/revenue counts (fixed with
  pre-aggregated subqueries)

---

## 11. Known Limitations / Possible Extensions

- No payment gateway integration — `checkout` confirms the booking
  directly (a real system would authorize payment before flipping seats to
  `booked`, then confirm/rollback based on the payment result)
- Seat map layout is a simple rectangular grid; irregular venue shapes
  (curved rows, aisles, boxes) would need a richer `venue_seats` schema
- No admin UI for editing/deleting existing venues, only creation
- Render's free tier sleeps after inactivity, causing a cold-start delay
  on the first request after idle periods — a paid tier or an alternative
  host (Railway, Fly.io) would remove this
