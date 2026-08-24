const router = require('express').Router();
const { myEventsSummary, myEvents } = require('../controllers/organiser.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/events', requireAuth, requireRole('organiser'), myEvents);
router.get('/summary', requireAuth, requireRole('organiser'), myEventsSummary);

module.exports = router;
