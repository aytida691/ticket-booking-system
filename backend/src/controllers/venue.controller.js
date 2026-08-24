const pool = require('../config/db');

/**
 * Admin creates a venue with a rectangular grid layout (rows x cols) and
 * one or more seat categories mapped to a contiguous row range, e.g.
 * rows A-C = Premium, rows D-H = Standard. venue_seats are generated
 * once here and reused for every show hosted at this venue.
 */
async function createVenue(req, res, next) {
  const client = await pool.connect();
  try {
    const { name, address, rows, cols, categories } = req.body;
    // categories: [{ name: 'Premium', rowFrom: 1, rowTo: 3 }, { name: 'Standard', rowFrom: 4, rowTo: 8 }]
    if (!name || !rows || !cols || !Array.isArray(categories) || !categories.length) {
      return res.status(400).json({ error: 'name, rows, cols, categories[] are required' });
    }

    await client.query('BEGIN');

    const venueResult = await client.query(
      `INSERT INTO venues (name, address, rows, cols, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, address || null, rows, cols, req.user.id]
    );
    const venue = venueResult.rows[0];

    const categoryRows = [];
    for (const c of categories) {
      const catResult = await client.query(
        `INSERT INTO seat_categories (venue_id, name, row_from, row_to) VALUES ($1,$2,$3,$4) RETURNING *`,
        [venue.id, c.name, c.rowFrom, c.rowTo]
      );
      categoryRows.push(catResult.rows[0]);
    }

    // Generate the physical seat grid, assigning each row to its category
    const rowLabel = (n) => String.fromCharCode(64 + n); // 1 -> A, 2 -> B ...
    for (let r = 1; r <= rows; r++) {
      const category = categoryRows.find((c) => r >= c.row_from && r <= c.row_to);
      if (!category) continue; // row not covered by any category is left unseated
      for (let s = 1; s <= cols; s++) {
        await client.query(
          `INSERT INTO venue_seats (venue_id, category_id, row_label, seat_number) VALUES ($1,$2,$3,$4)`,
          [venue.id, category.id, rowLabel(r), s]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ venue, categories: categoryRows });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function listVenues(req, res, next) {
  try {
    const result = await pool.query('SELECT * FROM venues ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getVenue(req, res, next) {
  try {
    const venue = await pool.query('SELECT * FROM venues WHERE id = $1', [req.params.id]);
    if (!venue.rows.length) return res.status(404).json({ error: 'Venue not found' });
    const categories = await pool.query('SELECT * FROM seat_categories WHERE venue_id = $1', [req.params.id]);
    const seats = await pool.query('SELECT * FROM venue_seats WHERE venue_id = $1 ORDER BY row_label, seat_number', [req.params.id]);
    res.json({ venue: venue.rows[0], categories: categories.rows, seats: seats.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes a venue, but only if no show has ever been scheduled there —
 * a venue with shows (past or upcoming) is load-bearing for booking
 * history, so deletion is blocked with a clear error instead of silently
 * cascading. A brand-new venue that was created by mistake, with no
 * shows yet, can be deleted freely; ON DELETE CASCADE on seat_categories
 * and venue_seats handles cleanup of the seat layout automatically.
 */
async function deleteVenue(req, res, next) {
  try {
    const { id } = req.params;

    const venueCheck = await pool.query('SELECT * FROM venues WHERE id = $1', [id]);
    if (!venueCheck.rows.length) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    const showCount = await pool.query('SELECT COUNT(*) FROM shows WHERE venue_id = $1', [id]);
    if (Number(showCount.rows[0].count) > 0) {
      return res.status(409).json({
        error: `Cannot delete this venue — it has ${showCount.rows[0].count} show(s) scheduled (past or upcoming).`,
      });
    }

    await pool.query('DELETE FROM venues WHERE id = $1', [id]);
    res.json({ message: 'Venue deleted', venueId: Number(id) });
  } catch (err) {
    next(err);
  }
}

module.exports = { createVenue, listVenues, getVenue, deleteVenue };
