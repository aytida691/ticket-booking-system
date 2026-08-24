const router = require('express').Router();
const { createVenue, listVenues, getVenue } = require('../controllers/venue.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', listVenues);
router.get('/:id', getVenue);
router.post('/', requireAuth, requireRole('admin'), createVenue);

module.exports = router;
