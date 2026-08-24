const pool = require('../config/db');

async function createEvent(req, res, next) {
  try {
    const { title, description, type } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const result = await pool.query(
      `INSERT INTO events (organiser_id, title, description, type) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, title, description || null, type || 'movie']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a show (a specific date/time/venue instance of an event), sets
 * per-category pricing, and materializes one show_seats row per venue
 * seat — this snapshot is what gets held/booked, keeping each show's
 * seat map independent even if the same venue hosts multiple shows.
 */
async function createShow(req, res, next) {
  const client = await pool.connect();
  try {
    const { eventId } = req.params;
    const { venueId, showDate, showTime, pricing } = req.body;
    // pricing: [{ categoryId, price }, ...]
    if (!venueId || !showDate || !showTime || !Array.isArray(pricing) || !pricing.length) {
      return res.status(400).json({ error: 'venueId, showDate, showTime, pricing[] are required' });
    }

    const eventCheck = await client.query('SELECT * FROM events WHERE id = $1 AND organiser_id = $2', [eventId, req.user.id]);
    if (!eventCheck.rows.length) return res.status(404).json({ error: 'Event not found or not owned by you' });

    await client.query('BEGIN');

    const showResult = await client.query(
      `INSERT INTO shows (event_id, venue_id, show_date, show_time) VALUES ($1,$2,$3,$4) RETURNING *`,
      [eventId, venueId, showDate, showTime]
    );
    const show = showResult.rows[0];

    for (const p of pricing) {
      await client.query(
        `INSERT INTO show_pricing (show_id, category_id, price) VALUES ($1,$2,$3)`,
        [show.id, p.categoryId, p.price]
      );
    }

    const venueSeats = await client.query('SELECT * FROM venue_seats WHERE venue_id = $1', [venueId]);
    for (const seat of venueSeats.rows) {
      await client.query(
        `INSERT INTO show_seats (show_id, venue_seat_id, category_id, status) VALUES ($1,$2,$3,'available')`,
        [show.id, seat.id, seat.category_id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(show);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/** Browse / filter events (public). Supports ?type=movie&title=&city= */
async function listEvents(req, res, next) {
  try {
    const { type, title } = req.query;
    const conditions = [];
    const params = [];
    let query = `
      SELECT e.*, MIN(s.show_date) as next_show_date, v.name as venue_name, v.address
      FROM events e
      LEFT JOIN shows s ON s.event_id = e.id
      LEFT JOIN venues v ON v.id = s.venue_id
    `;
    if (type) { params.push(type); conditions.push(`e.type = $${params.length}`); }
    if (title) { params.push(`%${title}%`); conditions.push(`e.title ILIKE $${params.length}`); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY e.id, v.name, v.address ORDER BY e.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getEventShows(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT s.*, v.name as venue_name, v.address
       FROM shows s JOIN venues v ON v.id = s.venue_id
       WHERE s.event_id = $1 ORDER BY s.show_date, s.show_time`,
      [req.params.eventId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { createEvent, createShow, listEvents, getEventShows };
