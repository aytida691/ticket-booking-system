const cron = require('node-cron');
const pool = require('../config/db');
const { emitSeatUpdate } = require('../config/socket');
const { reassignExpiredOffer } = require('./waitlist.service');

/**
 * Runs every minute. Finds waitlist offers whose time-limited link has
 * expired without being claimed, marks them 'expired', and cascades the
 * seat to the next customer in the queue (or releases it if empty).
 */
function startWaitlistOfferSweeper() {
  cron.schedule('* * * * *', async () => {
    try {
      const expiredOffers = await pool.query(
        `SELECT * FROM waitlist_entries WHERE status = 'offered' AND offer_expires_at < now()`
      );
      for (const entry of expiredOffers.rows) {
        const showId = await reassignExpiredOffer(entry);
        const seats = await pool.query(`SELECT id as show_seat_id, status FROM show_seats WHERE show_id = $1`, [showId]);
        emitSeatUpdate(showId, seats.rows);
      }
      if (expiredOffers.rows.length) {
        console.log(`[waitlist-sweep] reassigned ${expiredOffers.rows.length} expired offer(s)`);
      }
    } catch (err) {
      console.error('[waitlist-sweep] error:', err.message);
    }
  });
}

module.exports = { startWaitlistOfferSweeper };
