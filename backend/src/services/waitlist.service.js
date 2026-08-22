const crypto = require('crypto');
const pool = require('../config/db');
const { sendWaitlistOffer } = require('./email.service');

const OFFER_TTL_MIN = () => Number(process.env.WAITLIST_OFFER_TTL_MINUTES || 15);

/**
 * Core auto-assignment flow: given a seat that just became free, find the
 * longest-waiting customer on the waitlist for that show + category and
 * make them a time-limited offer.
 *
 * The seat is put into 'held' status (held_by = the offered customer,
 * held_until = offer expiry) so it cannot be grabbed by a walk-in browsing
 * the seat map while the offer is pending — the offer *is* a hold.
 *
 * Returns true if an offer was made, false if the waitlist for that
 * category is empty (caller should then release the seat normally).
 */
async function offerSeatToNextInWaitlist(showId, categoryId, showSeatId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const nextInLine = await client.query(
      `SELECT * FROM waitlist_entries
       WHERE show_id = $1 AND category_id = $2 AND status = 'waiting'
       ORDER BY joined_at ASC
       LIMIT 1
       FOR UPDATE`,
      [showId, categoryId]
    );

    if (!nextInLine.rows.length) {
      await client.query('ROLLBACK');
      return false;
    }

    const entry = nextInLine.rows[0];
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + OFFER_TTL_MIN() * 60 * 1000);

    await client.query(
      `UPDATE show_seats SET status='held', held_by=$1, held_until=$2, version=version+1 WHERE id = $3`,
      [entry.customer_id, expiresAt, showSeatId]
    );

    await client.query(
      `UPDATE waitlist_entries
       SET status='offered', offered_seat_id=$1, offer_token=$2, offer_expires_at=$3
       WHERE id = $4`,
      [showSeatId, token, expiresAt, entry.id]
    );

    await client.query('COMMIT');

    // Fetch details for the email (outside the transaction)
    const details = await pool.query(
      `SELECT e.title as event_title, s.show_date, s.show_time, sc.name as category_name, u.name, u.email
       FROM waitlist_entries w
       JOIN shows s ON s.id = w.show_id
       JOIN events e ON e.id = s.event_id
       JOIN seat_categories sc ON sc.id = w.category_id
       JOIN users u ON u.id = w.customer_id
       WHERE w.id = $1`,
      [entry.id]
    );
    const info = details.rows[0];

    sendWaitlistOffer({
      to: info.email,
      customerName: info.name,
      eventTitle: info.event_title,
      showDate: info.show_date,
      showTime: info.show_time,
      category: info.category_name,
      offerToken: token,
      expiresAt,
    }).catch((e) => console.error('Waitlist offer email failed:', e.message));

    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Called by the sweep job when a waitlist offer's time-limited link
 * expires unused: marks the entry 'expired' and cascades the same seat
 * to the *next* person in line (or releases it if the queue is empty).
 */
async function reassignExpiredOffer(entry) {
  await pool.query(`UPDATE waitlist_entries SET status='expired' WHERE id = $1`, [entry.id]);
  const offered = await offerSeatToNextInWaitlist(entry.show_id, entry.category_id, entry.offered_seat_id);
  if (!offered) {
    await pool.query(
      `UPDATE show_seats SET status='available', held_by=NULL, held_until=NULL, version=version+1 WHERE id = $1`,
      [entry.offered_seat_id]
    );
  }
  return entry.show_id;
}

module.exports = { offerSeatToNextInWaitlist, reassignExpiredOffer };
