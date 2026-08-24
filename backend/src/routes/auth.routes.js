const router = require('express').Router();
const { register, login, me, sendRegistrationOtp } = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const { otpRequestLimiter, loginLimiter } = require('../middleware/rateLimit');

router.post('/send-otp', otpRequestLimiter, sendRegistrationOtp);
router.post('/register', register);
router.post('/login', loginLimiter, login);
router.get('/me', requireAuth, me);

module.exports = router;
