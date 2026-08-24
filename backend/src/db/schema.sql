-- ============================================================
-- Ticket Booking System — PostgreSQL Schema
-- ============================================================

CREATE TYPE user_role AS ENUM ('customer', 'organiser', 'admin');
CREATE TYPE seat_status AS ENUM ('available', 'held', 'booked');
CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled');
CREATE TYPE waitlist_status AS ENUM ('waiting', 'offered', 'expired', 'fulfilled', 'cancelled');

-- ---------------------------------------------------------------
-- Users (customer / organiser / admin — role based auth)
-- ---------------------------------------------------------------
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    email         VARCHAR(160) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          user_role NOT NULL DEFAULT 'customer',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Venues (created/managed by admin) with seat layout
-- ---------------------------------------------------------------
CREATE TABLE venues (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(160) NOT NULL,
    address     VARCHAR(255),
    rows        INT NOT NULL,       -- layout: number of rows
    cols        INT NOT NULL,       -- layout: seats per row
    created_by  INT REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seat categories per venue, e.g. Premium / Standard, with base layout mapping
CREATE TABLE seat_categories (
    id          SERIAL PRIMARY KEY,
    venue_id    INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    name        VARCHAR(60) NOT NULL,       -- 'Premium', 'Standard'
    row_from    INT NOT NULL,               -- which physical rows belong to this category
    row_to      INT NOT NULL,
    UNIQUE (venue_id, name)
);

-- Physical seat inventory of a venue (independent of any specific show)
CREATE TABLE venue_seats (
    id            SERIAL PRIMARY KEY,
    venue_id      INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    category_id   INT NOT NULL REFERENCES seat_categories(id) ON DELETE CASCADE,
    row_label     VARCHAR(5) NOT NULL,   -- 'A', 'B', ...
    seat_number   INT NOT NULL,          -- 1, 2, 3 ...
    UNIQUE (venue_id, row_label, seat_number)
);

-- ---------------------------------------------------------------
-- Events & Shows (organiser creates listings)
-- events = movie/concert title; shows = a specific date/time/venue instance
-- ---------------------------------------------------------------
CREATE TABLE events (
    id            SERIAL PRIMARY KEY,
    organiser_id  INT NOT NULL REFERENCES users(id),
    title         VARCHAR(200) NOT NULL,
    description   TEXT,
    type          VARCHAR(20) NOT NULL DEFAULT 'movie',  -- movie | concert
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shows (
    id            SERIAL PRIMARY KEY,
    event_id      INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    venue_id      INT NOT NULL REFERENCES venues(id),
    show_date     DATE NOT NULL,
    show_time     TIME NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-category pricing for a show
CREATE TABLE show_pricing (
    id            SERIAL PRIMARY KEY,
    show_id       INT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    category_id   INT NOT NULL REFERENCES seat_categories(id),
    price         NUMERIC(10,2) NOT NULL,
    UNIQUE (show_id, category_id)
);

-- ---------------------------------------------------------------
-- Show seats — ONE ROW PER SEAT PER SHOW. This is the row that gets
-- atomically compare-and-swapped for hold/booking, which is the crux
-- of the concurrency-safety requirement.
-- ---------------------------------------------------------------
CREATE TABLE show_seats (
    id            BIGSERIAL PRIMARY KEY,
    show_id       INT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    venue_seat_id INT NOT NULL REFERENCES venue_seats(id),
    category_id   INT NOT NULL REFERENCES seat_categories(id),
    status        seat_status NOT NULL DEFAULT 'available',
    held_by       INT REFERENCES users(id),
    held_until    TIMESTAMPTZ,          -- TTL expiry for the hold
    version       INT NOT NULL DEFAULT 0,  -- optimistic-lock counter (defence in depth)
    UNIQUE (show_id, venue_seat_id)
);

-- Fast lookup of expiring holds for the sweeper job
CREATE INDEX idx_show_seats_held_until ON show_seats (held_until) WHERE status = 'held';
CREATE INDEX idx_show_seats_show_status ON show_seats (show_id, status);

-- ---------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------
CREATE TABLE bookings (
    id              SERIAL PRIMARY KEY,
    booking_ref     VARCHAR(20) UNIQUE NOT NULL,   -- encoded in QR
    customer_id     INT NOT NULL REFERENCES users(id),
    show_id         INT NOT NULL REFERENCES shows(id),
    status          booking_status NOT NULL DEFAULT 'confirmed',
    total_amount    NUMERIC(10,2) NOT NULL,
    qr_code_data    TEXT,               -- base64 QR payload (cached)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at    TIMESTAMPTZ
);

CREATE TABLE booking_seats (
    id          SERIAL PRIMARY KEY,
    booking_id  INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    show_seat_id BIGINT NOT NULL REFERENCES show_seats(id),
    price       NUMERIC(10,2) NOT NULL
);

-- ---------------------------------------------------------------
-- Waitlist — queue per (show, seat category)
-- ---------------------------------------------------------------
CREATE TABLE waitlist_entries (
    id            SERIAL PRIMARY KEY,
    show_id       INT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    category_id   INT NOT NULL REFERENCES seat_categories(id),
    customer_id   INT NOT NULL REFERENCES users(id),
    status        waitlist_status NOT NULL DEFAULT 'waiting',
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    offered_seat_id BIGINT REFERENCES show_seats(id),
    offer_token   VARCHAR(64),          -- time-limited link token
    offer_expires_at TIMESTAMPTZ,
    UNIQUE (show_id, category_id, customer_id)
);

CREATE INDEX idx_waitlist_queue ON waitlist_entries (show_id, category_id, status, joined_at);

-- ============================================================
-- Notes:
-- * Seat hold / booking concurrency is handled with a single atomic
--   UPDATE ... WHERE status = 'available' RETURNING * (compare-and-swap),
--   see bookingController / seatService. No pessimistic locking needed
--   for the common path; FOR UPDATE is used only for multi-seat bookings
--   inside one transaction to avoid partial holds.
-- * held_until expiry is enforced both lazily (checked whenever a seat
--   is read/attempted) and proactively via a node-cron sweep job
--   (holdExpiry.job.js) every 15s that flips expired 'held' rows back
--   to 'available' and emits a socket event.
-- ============================================================
