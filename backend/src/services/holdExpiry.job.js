const pool = require('../config/db');
const { emitSeatUpdate } = require('../config/socket');

/**
 * Proactive TTL enforcement. Even though every read/hold/checkout path
 * also lazily expires stale holds, this sweep guarantees seats free up
 * (and the seat map broadcasts) even if nobody happens to hit an API
 * endpoint for that show right when a hold times out.
 */
function startHoldExpirySweeper() {
  const intervalSec = Number(process.env.HOLD_SWEEP_INTERVAL_SECONDS || 15);
  // node-cron needs a cron expression; for sub-minute granularity we use setInterval instead.
  setInterval(async () => {
    try {
      const expired = await pool.query(
        `UPDATE show_seats
         SET status = 'available', held_by = NULL, held_until = NULL, version = version + 1
         WHERE status = 'held' AND held_until < now()
         RETURNING id, show_id`
      );
      if (expired.rows.length) {
        const byShow = {};
        for (const row of expired.rows) {
          byShow[row.show_id] = byShow[row.show_id] || [];
          byShow[row.show_id].push(row.id);
        }
        for (const showId of Object.keys(byShow)) {
          emitSeatUpdate(showId, byShow[showId].map((id) => ({ show_seat_id: id, status: 'available' })));
        }
        console.log(`[hold-sweep] released ${expired.rows.length} expired seat hold(s)`);
      }
    } catch (err) {
      console.error('[hold-sweep] error:', err.message);
    }
  }, intervalSec * 1000);
}

module.exports = { startHoldExpirySweeper };
