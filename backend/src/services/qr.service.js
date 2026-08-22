const QRCode = require('qrcode');

/**
 * Generates a QR code (as a base64 PNG data URL) that encodes the
 * booking reference. The booking reference alone is sufficient for
 * venue staff to look up the full booking server-side at the gate,
 * which keeps the QR payload small and avoids leaking seat/customer
 * details in a scannable code.
 */
async function generateBookingQR(bookingRef) {
  const payload = JSON.stringify({ ref: bookingRef, type: 'ticket' });
  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 300,
  });
  return dataUrl; // e.g. "data:image/png;base64,...."
}

module.exports = { generateBookingQR };
