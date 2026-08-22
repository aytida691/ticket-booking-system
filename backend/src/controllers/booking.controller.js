const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const { emitSeatUpdate } = require('../config/socket');
const { generateBookingQR } = require('../services/qr.service');
const { sendBookingConfirmation } = require('../services/email.service');
const { offerSeatToNextInWaitlist } = require('../services/waitlist.service');

const HOLD_TTL_MIN = () => Number(process.env.SEAT_HOLD_TTL_MINUTES || 10);

function generateBookingRef() {
  return 'BK-' + uuidv4().split('-')[0].toUpperCase();
}

async function broadcastSeatMap(showId) {
  const result = await pool.query(
    `SELECT id as show_seat_id, status FROM show_seats WHERE show_id = $1`,
    [showId]
  );
  emitSeatUpdate(showId, result.rows);
}

/**
 * Places a hold on one or more seats for the current customer.
 *
 * CONCURRENCY: each seat is claimed with a single atomic
 *   UPDATE show_seats SET status='held', ... WHERE id = $1 AND status = 'available'
 * This is a compare-and-swap done by Postgres itself — if two requests
 * race for the same row, only one UPDATE affects a row (rowCount = 1);
 * the loser gets rowCount = 0 and the whole hold attempt is rolled back
 * so the caller never ends up with a partial set of seats.
 */
async function holdSeats(req, res, next) {
  const client = await pool.connect();
  try {
    const { showId } = req.params;
    const { seatIds } = req.body; // array of show_seat_id
    if (!Array.isArray(seatIds) || !seatIds.length) {
      return res.status(400).json({ error: 'seatIds[] is required' });
    }

    const heldUntil = new Date(Date.now() + HOLD_TTL_MIN() * 60 * 1000);
    const failedSeats = [];

    await client.query('BEGIN');

    // First, auto-release anything expired so a stale hold doesn't block us
    await client.query(
      `UPDATE show_seats SET status='available', held_by=NULL, held_until=NULL, version=version+1
       WHERE show_id = $1 AND status = 'held' AND held_until < now()`,
      [showId]
    );

    for (const seatId of seatIds) {
      const result = await client.query(
        `UPDATE show_seats
         SET status = 'held', held_by = $1, held_until = $2, version = version + 1
         WHERE id = $3 AND show_id = $4 AND status = 'available'
         RETURNING id`,
        [req.user.id, heldUntil, seatId, showId]
      );
      if (result.rowCount === 0) failedSeats.push(seatId);
    }

    if (failedSeats.length) {
      // All-or-nothing: if any seat couldn't be claimed, release everything
      // this request just grabbed so we don't leave the customer holding
      // a random subset of what they selected.
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Some seats are no longer available',
        unavailableSeats: failedSeats,
      });
    }

    await client.query('COMMIT');
    await broadcastSeatMap(showId);

    res.json({ heldSeatIds: seatIds, holdExpiresAt: heldUntil });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/** Explicit release, e.g. user deselects a seat or leaves the checkout page */
async function releaseSeats(req, res, next) {
  try {
    const { showId } = req.params;
    const { seatIds } = req.body;
    if (!Array.isArray(seatIds) || !seatIds.length) {
      return res.status(400).json({ error: 'seatIds[] is required' });
    }
    await pool.query(
      `UPDATE show_seats SET status='available', held_by=NULL, held_until=NULL, version=version+1
       WHERE show_id = $1 AND id = ANY($2::bigint[]) AND held_by = $3`,
      [showId, seatIds, req.user.id]
    );
    await broadcastSeatMap(showId);
    res.json({ released: seatIds });
  } catch (err) {
    next(err);
  }
}

/**
 * Converts a customer's currently-held seats into a confirmed booking.
 * Only seats actively held by this user (and not yet expired) qualify —
 * this is what stops an abandoned/expired hold from ever being booked.
 */
async function checkout(req, res, next) {
  const client = await pool.connect();
  try {
    const { showId } = req.params;
    const { seatIds } = req.body;
    if (!Array.isArray(seatIds) || !seatIds.length) {
      return res.status(400).json({ error: 'seatIds[] is required' });
    }

    await client.query('BEGIN');

    // Lock the show_seats rows first (FOR UPDATE can't be combined with the
    // LEFT JOIN to show_pricing below — Postgres forbids locking the
    // nullable side of an outer join), then fetch pricing separately.
    const lockedSeats = await client.query(
      `SELECT id, category_id
       FROM show_seats
       WHERE show_id = $1 AND id = ANY($2::bigint[])
         AND status = 'held' AND held_by = $3 AND held_until > now()
       FOR UPDATE`,
      [showId, seatIds, req.user.id]
    );

    if (lockedSeats.rows.length !== seatIds.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Your hold on one or more seats has expired. Please reselect.' });
    }

    const pricing = await client.query(
      `SELECT category_id, price FROM show_pricing WHERE show_id = $1`,
      [showId]
    );
    const priceByCategory = Object.fromEntries(pricing.rows.map((p) => [p.category_id, p.price]));
    const heldSeats = { rows: lockedSeats.rows.map((s) => ({ ...s, price: priceByCategory[s.category_id] || 0 })) };

    const totalAmount = heldSeats.rows.reduce((sum, s) => sum + Number(s.price || 0), 0);
    const bookingRef = generateBookingRef();

    const bookingResult = await client.query(
      `INSERT INTO bookings (booking_ref, customer_id, show_id, status, total_amount)
       VALUES ($1,$2,$3,'confirmed',$4) RETURNING *`,
      [bookingRef, req.user.id, showId, totalAmount]
    );
    const booking = bookingResult.rows[0];

    for (const seat of heldSeats.rows) {
      await client.query(
        `INSERT INTO booking_seats (booking_id, show_seat_id, price) VALUES ($1,$2,$3)`,
        [booking.id, seat.id, seat.price || 0]
      );
      await client.query(
        `UPDATE show_seats SET status='booked', held_by=NULL, held_until=NULL, version=version+1 WHERE id = $1`,
        [seat.id]
      );
    }

    await client.query('COMMIT');
    await broadcastSeatMap(showId);

    // Fetch details for the email / QR (outside the transaction — non-critical path)
    const details = await pool.query(
      `SELECT e.title as event_title, s.show_date, s.show_time, u.name, u.email
       FROM bookings b
       JOIN shows s ON s.id = b.show_id
       JOIN events e ON e.id = s.event_id
       JOIN users u ON u.id = b.customer_id
       WHERE b.id = $1`,
      [booking.id]
    );
    const seatLabelsResult = await pool.query(
      `SELECT vs.row_label, vs.seat_number FROM booking_seats bs
       JOIN show_seats ss ON ss.id = bs.show_seat_id
       JOIN venue_seats vs ON vs.id = ss.venue_seat_id
       WHERE bs.booking_id = $1`,
      [booking.id]
    );
    const seatLabels = seatLabelsResult.rows.map((r) => `${r.row_label}${r.seat_number}`);
    const info = details.rows[0];

    const qrDataUrl = await generateBookingQR(bookingRef);
    await pool.query('UPDATE bookings SET qr_code_data = $1 WHERE id = $2', [qrDataUrl, booking.id]);

    // Email is best-effort: a delivery failure shouldn't fail the booking
    // that has already been committed to the database.
    sendBookingConfirmation({
      to: info.email,
      customerName: info.name,
      eventTitle: info.event_title,
      showDate: info.show_date,
      showTime: info.show_time,
      seatLabels,
      bookingRef,
      qrDataUrl,
    }).catch((e) => console.error('Email send failed:', e.message));

    res.status(201).json({ booking, seatLabels, qrDataUrl });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function myBookings(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT b.*, e.title as event_title, s.show_date, s.show_time, v.name as venue_name,
              array_agg(vs.row_label || vs.seat_number::text) as seats
       FROM bookings b
       JOIN shows s ON s.id = b.show_id
       JOIN events e ON e.id = s.event_id
       JOIN venues v ON v.id = s.venue_id
       JOIN booking_seats bs ON bs.booking_id = b.id
       JOIN show_seats ss ON ss.id = bs.show_seat_id
       JOIN venue_seats vs ON vs.id = ss.venue_seat_id
       WHERE b.customer_id = $1
       GROUP BY b.id, e.title, s.show_date, s.show_time, v.name
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * Cancels a booking. Each freed seat is offered to the next customer on
 * the waitlist for that show + category (time-limited offer); if nobody
 * is waiting, the seat simply goes back to 'available'.
 */
async function cancelBooking(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const bookingResult = await client.query(
      `SELECT * FROM bookings WHERE id = $1 AND customer_id = $2 AND status = 'confirmed'`,
      [id, req.user.id]
    );
    if (!bookingResult.rows.length) return res.status(404).json({ error: 'Booking not found or already cancelled' });
    const booking = bookingResult.rows[0];

    const seatsResult = await client.query(
      `SELECT ss.id as show_seat_id, ss.category_id
       FROM booking_seats bs JOIN show_seats ss ON ss.id = bs.show_seat_id
       WHERE bs.booking_id = $1`,
      [id]
    );

    await client.query('BEGIN');
    await client.query(`UPDATE bookings SET status='cancelled', cancelled_at = now() WHERE id = $1`, [id]);
    await client.query('COMMIT');

    // For each freed seat, try to hand it to the waitlist; otherwise free it.
    for (const seat of seatsResult.rows) {
      const offered = await offerSeatToNextInWaitlist(booking.show_id, seat.category_id, seat.show_seat_id);
      if (!offered) {
        await pool.query(
          `UPDATE show_seats SET status='available', held_by=NULL, held_until=NULL, version=version+1 WHERE id = $1`,
          [seat.show_seat_id]
        );
      }
    }

    await broadcastSeatMap(booking.show_id);
    res.json({ message: 'Booking cancelled', bookingId: id });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { holdSeats, releaseSeats, checkout, myBookings, cancelBooking, broadcastSeatMap };
