const rateLimit = require('express-rate-limit');

// Limits how many OTP emails can be requested from one IP in a window —
// on top of the per-email cooldown already enforced in otp.service.js,
// this stops one IP from spamming OTP requests across many different
// email addresses.
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification code requests. Please try again later.' },
});

// Limits login attempts per IP to slow down credential-stuffing / brute force.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

module.exports = { otpRequestLimiter, loginLimiter };
