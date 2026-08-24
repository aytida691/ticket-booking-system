const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const OTP_TTL_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

function generateOtpCode() {
  // 6-digit numeric code, zero-padded (e.g. "042917")
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/**
 * Creates a new OTP for the given email + purpose, invalidating any
 * previous unconsumed OTPs for that same email+purpose first (so only
 * the most recently sent code is ever valid). Enforces a resend cooldown
 * to stop someone from hammering the email-send endpoint.
 *
 * Returns { code } on success, or throws { status, message } style error
 * (via a plain Error with .status set) if the cooldown hasn't elapsed.
 */
async function createOtp(email, purpose = 'register') {
  const normalizedEmail = email.trim().toLowerCase();

  const recent = await pool.query(
    `SELECT created_at FROM otp_verifications
     WHERE email = $1 AND purpose = $2
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail, purpose]
  );
  if (recent.rows.length) {
    const secondsSinceLast = (Date.now() - new Date(recent.rows[0].created_at).getTime()) / 1000;
    if (secondsSinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
      const err = new Error(`Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLast)}s before requesting another code`);
      err.status = 429;
      throw err;
    }
  }

  // Invalidate any older, still-unconsumed codes for this email+purpose
  await pool.query(
    `UPDATE otp_verifications SET consumed = true
     WHERE email = $1 AND purpose = $2 AND consumed = false`,
    [normalizedEmail, purpose]
  );

  const code = generateOtpCode();
  const otpHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await pool.query(
    `INSERT INTO otp_verifications (email, otp_hash, purpose, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [normalizedEmail, otpHash, purpose, expiresAt]
  );

  return { code, expiresAt };
}

/**
 * Verifies a submitted OTP against the latest unconsumed code for that
 * email+purpose. On success, marks it consumed (single-use) and returns
 * true. On failure, increments the attempt counter and locks the code
 * out after OTP_MAX_ATTEMPTS wrong guesses (brute-force protection on a
 * 6-digit code, which otherwise only has 1,000,000 possibilities).
 */
async function verifyOtp(email, submittedCode, purpose = 'register') {
  const normalizedEmail = email.trim().toLowerCase();

  const result = await pool.query(
    `SELECT * FROM otp_verifications
     WHERE email = $1 AND purpose = $2 AND consumed = false
     ORDER BY created_at DESC LIMIT 1
     FOR UPDATE`,
    [normalizedEmail, purpose]
  );

  if (!result.rows.length) {
    return { ok: false, reason: 'No verification code found for this email. Please request a new one.' };
  }
  const otp = result.rows[0];

  if (new Date(otp.expires_at) < new Date()) {
    return { ok: false, reason: 'This code has expired. Please request a new one.' };
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: 'Too many incorrect attempts. Please request a new code.' };
  }

  const matches = await bcrypt.compare(submittedCode, otp.otp_hash);
  if (!matches) {
    await pool.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
    return { ok: false, reason: 'Incorrect code. Please try again.' };
  }

  await pool.query('UPDATE otp_verifications SET consumed = true WHERE id = $1', [otp.id]);
  return { ok: true };
}

module.exports = { createOtp, verifyOtp, OTP_TTL_MINUTES };
