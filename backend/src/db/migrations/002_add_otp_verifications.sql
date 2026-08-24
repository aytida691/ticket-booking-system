-- ============================================================
-- Incremental migration: adds email OTP verification support to
-- an EXISTING database (one that already ran the original schema.sql).
--
-- Safe to run on a live database with existing users/bookings/etc —
-- it only ADDS a new table, it does not touch or drop anything.
--
-- How to run this against Neon:
--   1. Open your Neon dashboard -> SQL Editor
--   2. Paste this entire file
--   3. Click Run
--
-- Or from your local machine (with DATABASE_URL pointed at Neon):
--   psql "$DATABASE_URL" -f backend/src/db/migrations/002_add_otp_verifications.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS otp_verifications (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(160) NOT NULL,
    otp_hash      VARCHAR(255) NOT NULL,
    purpose       VARCHAR(30) NOT NULL DEFAULT 'register',
    attempts      INT NOT NULL DEFAULT 0,
    consumed      BOOLEAN NOT NULL DEFAULT false,
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_email_purpose
    ON otp_verifications (email, purpose, consumed, created_at DESC);
