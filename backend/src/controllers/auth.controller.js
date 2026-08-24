const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { signToken } = require('../utils/jwt');
const { createOtp, verifyOtp, OTP_TTL_MINUTES } = require('../services/otp.service');
const { sendOtpEmail } = require('../services/email.service');

// Requires: local-part @ domain-label(s) . TLD(2+ letters)
// Rejects things like "a@b" (no dot / TLD) while allowing normal addresses,
// including subdomains and +tags (e.g. name+tag@sub.example.co.in).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_REGEX.test(email);
}

/**
 * Step 1 of registration: send a 6-digit verification code to the given
 * email. Does NOT create an account — this only proves the person can
 * actually receive mail at that address before we let them register.
 * Rejects addresses already tied to an existing account so people can't
 * spam OTP emails at accounts they don't own.
 */
async function sendRegistrationOtp(req, res, next) {
  try {
    const { email } = req.body;
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address (e.g. name@example.com)' });
    }
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const { code, expiresAt } = await createOtp(normalizedEmail, 'register');

    try {
      await sendOtpEmail({ to: normalizedEmail, code, ttlMinutes: OTP_TTL_MINUTES });
    } catch (emailErr) {
      console.error('OTP email send failed:', emailErr.message);
      return res.status(502).json({ error: 'Could not send verification email. Please check the address and try again.' });
    }

    res.json({ message: 'Verification code sent', expiresAt });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

/**
 * Step 2 of registration: creates the account, but ONLY if a valid,
 * unexpired, unconsumed OTP for this email was verified via /verify-otp
 * (or is submitted directly here — see verifyOtp call below). The OTP is
 * consumed on success so it can't be reused for a second account.
 */
async function register(req, res, next) {
  try {
    const { name, email, password, role, otp } = req.body;
    if (!name || !email || !password || !otp) {
      return res.status(400).json({ error: 'name, email, password, otp are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address (e.g. name@example.com)' });
    }
    const normalizedEmail = email.trim().toLowerCase();

    const otpCheck = await verifyOtp(normalizedEmail, otp, 'register');
    if (!otpCheck.ok) {
      return res.status(400).json({ error: otpCheck.reason });
    }

    // Only allow self-registration as customer or organiser; admin accounts
    // are provisioned manually / seeded, never via the public endpoint.
    const allowedRole = role === 'organiser' ? 'organiser' : 'customer';

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, role`,
      [name, normalizedEmail, passwordHash, allowedRole]
    );
    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me, sendRegistrationOtp };
