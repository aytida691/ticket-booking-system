const pool = require('../config/db');

/**
 * Returns the full seat map for a show. Before reading, we lazily flip
 * any seats whose hold has expired back to 'available' — this guarantees
 * correctness even if the periodic sweep job (holdExpiry.job.js) hasn't
 * run yet, without the client ever seeing a stale 'held' seat.
 */
async function getShowSeatMap(req, res, next) {
  try {
    const { showId } = req.params;

    await pool.query(
      `UPDATE show_seats
       SET status = 'available', held_by = NULL, held_until = NULL, version = version + 1
       WHERE show_id = $1 AND status = 'held' AND held_until < now()`,
      [showId]
    );

    const show = await pool.query(
      `SELECT s.*, v.name as venue_name, v.rows, v.cols, e.title as event_title
       FROM shows s JOIN venues v ON v.id = s.venue_id JOIN events e ON e.id = s.event_id
       WHERE s.id = $1`,
      [showId]
    );
    if (!show.rows.length) return res.status(404).json({ error: 'Show not found' });

    const seats = await pool.query(
      `SELECT ss.id as show_seat_id, ss.status, ss.category_id, sc.name as category_name,
              vs.row_label, vs.seat_number, sp.price
       FROM show_seats ss
       JOIN venue_seats vs ON vs.id = ss.venue_seat_id
       JOIN seat_categories sc ON sc.id = ss.category_id
       LEFT JOIN show_pricing sp ON sp.show_id = ss.show_id AND sp.category_id = ss.category_id
       WHERE ss.show_id = $1
       ORDER BY vs.row_label, vs.seat_number`,
      [showId]
    );

    res.json({ show: show.rows[0], seats: seats.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { getShowSeatMap };
