const router = require('express').Router();
const { myBookings, cancelBooking } = require('../controllers/booking.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('customer'), myBookings);
router.post('/:id/cancel', requireAuth, requireRole('customer'), cancelBooking);

module.exports = router;
