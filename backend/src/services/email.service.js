const nodemailer = require('nodemailer');

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Sends the confirmed-booking email with the QR ticket embedded inline.
 * qrDataUrl is a "data:image/png;base64,..." string from qr.service.js
 */
async function sendBookingConfirmation({ to, customerName, eventTitle, showDate, showTime, seatLabels, bookingRef, qrDataUrl }) {
  const transporter = buildTransport();
  const base64 = qrDataUrl.split(',')[1];

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `Booking Confirmed: ${eventTitle} — ${bookingRef}`,
    html: `
      <h2>Your booking is confirmed 🎟️</h2>
      <p>Hi ${customerName},</p>
      <p><b>${eventTitle}</b><br/>
      Date: ${showDate} &nbsp; Time: ${showTime}<br/>
      Seats: ${seatLabels.join(', ')}<br/>
      Booking Reference: <b>${bookingRef}</b></p>
      <p>Show this QR code at the venue entrance:</p>
      <img src="cid:qrcode" alt="QR Ticket" width="220" height="220" />
      <p>Thank you for booking with us!</p>
    `,
    attachments: [
      {
        filename: 'ticket-qr.png',
        content: Buffer.from(base64, 'base64'),
        cid: 'qrcode',
      },
    ],
  });
}

/**
 * Sends a time-limited waitlist offer email with a link the customer
 * must click within WAITLIST_OFFER_TTL_MINUTES to claim the freed seat.
 */
async function sendWaitlistOffer({ to, customerName, eventTitle, showDate, showTime, category, offerToken, expiresAt }) {
  const transporter = buildTransport();
  const claimUrl = `${process.env.APP_BASE_URL}/waitlist/offer/${offerToken}`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `A seat opened up for ${eventTitle}! Claim it now`,
    html: `
      <h2>Good news, ${customerName}! 🎉</h2>
      <p>A <b>${category}</b> seat for <b>${eventTitle}</b> (${showDate} ${showTime}) has become available
      and you're next on the waitlist.</p>
      <p><a href="${claimUrl}" style="padding:10px 18px;background:#4f46e5;color:#fff;
      text-decoration:none;border-radius:6px;">Claim your seat</a></p>
      <p>This offer expires at <b>${new Date(expiresAt).toLocaleString()}</b>. If you don't complete
      the booking before then, the seat will be offered to the next person in line.</p>
    `,
  });
}

module.exports = { sendBookingConfirmation, sendWaitlistOffer };
