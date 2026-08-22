const router = require('express').Router();
const { getShowSeatMap } = require('../controllers/show.controller');
const { holdSeats, releaseSeats, checkout } = require('../controllers/booking.controller');
const { joinWaitlist } = require('../controllers/waitlist.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/:showId/seats', getShowSeatMap);
router.post('/:showId/hold', requireAuth, requireRole('customer'), holdSeats);
router.post('/:showId/release', requireAuth, requireRole('customer'), releaseSeats);
router.post('/:showId/checkout', requireAuth, requireRole('customer'), checkout);
router.post('/:showId/waitlist', requireAuth, requireRole('customer'), joinWaitlist);

module.exports = router;
