const pool = require('../config/db');

/** Organiser views booking summary + revenue across all their events */
async function myEventsSummary(req, res, next) {
  try {
    // Booking stats and seat stats are pre-aggregated in their own
    // subqueries (one row per show_id) before joining to events/shows —
    // joining bookings and show_seats directly on the same query would
    // create a cartesian product (every booking row x every seat row)
    // and silently inflate seats_sold/total_seats/revenue.
    const result = await pool.query(
      `SELECT e.id as event_id, e.title, s.id as show_id, s.show_date, s.show_time,
              v.name as venue_name,
              COALESCE(bstat.confirmed_bookings, 0) as confirmed_bookings,
              COALESCE(bstat.cancelled_bookings, 0) as cancelled_bookings,
              COALESCE(bstat.revenue, 0) as revenue,
              COALESCE(sstat.seats_sold, 0) as seats_sold,
              COALESCE(sstat.total_seats, 0) as total_seats
       FROM events e
       JOIN shows s ON s.event_id = e.id
       JOIN venues v ON v.id = s.venue_id
       LEFT JOIN (
         SELECT show_id,
                COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_bookings,
                COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_bookings,
                COALESCE(SUM(total_amount) FILTER (WHERE status = 'confirmed'), 0) as revenue
         FROM bookings
         GROUP BY show_id
       ) bstat ON bstat.show_id = s.id
       LEFT JOIN (
         SELECT show_id,
                COUNT(*) FILTER (WHERE status = 'booked') as seats_sold,
                COUNT(*) as total_seats
         FROM show_seats
         GROUP BY show_id
       ) sstat ON sstat.show_id = s.id
       WHERE e.organiser_id = $1
       ORDER BY s.show_date DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function myEvents(req, res, next) {
  try {
    const result = await pool.query('SELECT * FROM events WHERE organiser_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { myEventsSummary, myEvents };
