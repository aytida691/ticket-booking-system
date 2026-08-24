const router = require('express').Router();
const { myWaitlist, claimOffer } = require('../controllers/waitlist.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('customer'), myWaitlist);
router.get('/offer/:token', claimOffer);

module.exports = router;
