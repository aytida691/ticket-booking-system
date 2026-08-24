const router = require('express').Router();
const { createEvent, createShow, listEvents, getEventShows, deleteEvent } = require('../controllers/event.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', listEvents);
router.get('/:eventId/shows', getEventShows);
router.post('/', requireAuth, requireRole('organiser'), createEvent);
router.post('/:eventId/shows', requireAuth, requireRole('organiser'), createShow);
router.delete('/:eventId', requireAuth, requireRole('organiser'), deleteEvent);

module.exports = router;
