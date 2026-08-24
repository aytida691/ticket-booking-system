const pool = require('../config/db');
const { broadcastSeatMap } = require('./booking.controller');
const { generateBookingQR } = require('../services/qr.service');
const { sendBookingConfirmation } = require('../services/email.service');
const { v4: uuidv4 } = require('uuid');

/**
 * Customer joins the waitlist for a specific seat category on a sold-out
 * show. Only allowed when that category genuinely has zero available
 * seats — prevents jumping the waitlist when seats are actually free.
 */
async function joinWaitlist(req, res, next) {
  try {
    const { showId } = req.params;
    const { categoryId } = req.body;
    if (!categoryId) return res.status(400).json({ error: 'categoryId is required' });

    const available = await pool.query(
      `SELECT COUNT(*) FROM show_seats WHERE show_id = $1 AND category_id = $2 AND status = 'available'`,
      [showId, categoryId]
    );
    if (Number(available.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Seats are still available in this category — no need to waitlist' });
    }

    const result = await pool.query(
      `INSERT INTO waitlist_entries (show_id, category_id, customer_id, status)
       VALUES ($1,$2,$3,'waiting')
       ON CONFLICT (show_id, category_id, customer_id) DO NOTHING
       RETURNING *`,
      [showId, categoryId, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(409).json({ error: 'You are already on the waitlist for this category' });
    }
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function myWaitlist(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT w.*, e.title as event_title, s.show_date, s.show_time, sc.name as category_name
       FROM waitlist_entries w
       JOIN shows s ON s.id = w.show_id
       JOIN events e ON e.id = s.event_id
       JOIN seat_categories sc ON sc.id = w.category_id
       WHERE w.customer_id = $1
       ORDER BY w.joined_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * Customer clicks the time-limited link from the waitlist offer email.
 * Converts the offered (held) seat directly into a confirmed booking,
 * provided the offer hasn't expired.
 */
async function claimOffer(req, res, next) {
  const client = await pool.connect();
  try {
    const { token } = req.params;

    await client.query('BEGIN');

    const entryResult = await client.query(
      `SELECT * FROM waitlist_entries WHERE offer_token = $1 AND status = 'offered' FOR UPDATE`,
      [token]
    );
    if (!entryResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Offer not found or already used' });
    }
    const entry = entryResult.rows[0];

    if (new Date(entry.offer_expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'This offer has expired' });
    }

    const seatResult = await client.query(
      `SELECT id, category_id FROM show_seats
       WHERE id = $1 AND status = 'held' AND held_by = $2 FOR UPDATE`,
      [entry.offered_seat_id, entry.customer_id]
    );
    if (!seatResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Seat is no longer held for you' });
    }
    const priceResult = await client.query(
      `SELECT price FROM show_pricing WHERE show_id = $1 AND category_id = $2`,
      [entry.show_id, seatResult.rows[0].category_id]
    );
    const seat = { id: seatResult.rows[0].id, price: priceResult.rows[0]?.price || 0 };

    const bookingRef = 'BK-' + uuidv4().split('-')[0].toUpperCase();
    const bookingResult = await client.query(
      `INSERT INTO bookings (booking_ref, customer_id, show_id, status, total_amount)
       VALUES ($1,$2,$3,'confirmed',$4) RETURNING *`,
      [bookingRef, entry.customer_id, entry.show_id, seat.price || 0]
    );
    const booking = bookingResult.rows[0];

    await client.query(`INSERT INTO booking_seats (booking_id, show_seat_id, price) VALUES ($1,$2,$3)`, [
      booking.id, seat.id, seat.price || 0,
    ]);
    await client.query(
      `UPDATE show_seats SET status='booked', held_by=NULL, held_until=NULL, version=version+1 WHERE id = $1`,
      [seat.id]
    );
    await client.query(`UPDATE waitlist_entries SET status='fulfilled' WHERE id = $1`, [entry.id]);

    await client.query('COMMIT');
    await broadcastSeatMap(entry.show_id);

    const details = await pool.query(
      `SELECT e.title as event_title, s.show_date, s.show_time, u.name, u.email, vs.row_label, vs.seat_number
       FROM bookings b
       JOIN shows s ON s.id = b.show_id JOIN events e ON e.id = s.event_id
       JOIN users u ON u.id = b.customer_id
       JOIN booking_seats bs ON bs.booking_id = b.id
       JOIN show_seats ss ON ss.id = bs.show_seat_id
       JOIN venue_seats vs ON vs.id = ss.venue_seat_id
       WHERE b.id = $1`,
      [booking.id]
    );
    const info = details.rows[0];
    const qrDataUrl = await generateBookingQR(bookingRef);
    await pool.query('UPDATE bookings SET qr_code_data = $1 WHERE id = $2', [qrDataUrl, booking.id]);

    sendBookingConfirmation({
      to: info.email,
      customerName: info.name,
      eventTitle: info.event_title,
      showDate: info.show_date,
      showTime: info.show_time,
      seatLabels: [`${info.row_label}${info.seat_number}`],
      bookingRef,
      qrDataUrl,
    }).catch((e) => console.error('Email send failed:', e.message));

    res.status(201).json({ booking, qrDataUrl });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { joinWaitlist, myWaitlist, claimOffer };
