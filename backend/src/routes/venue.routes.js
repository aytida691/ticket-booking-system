const router = require('express').Router();
const { createVenue, listVenues, getVenue, deleteVenue } = require('../controllers/venue.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', listVenues);
router.get('/:id', getVenue);
router.post('/', requireAuth, requireRole('admin'), createVenue);
router.delete('/:id', requireAuth, requireRole('admin'), deleteVenue);

module.exports = router;
