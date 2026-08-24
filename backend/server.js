require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');

const { initSocket } = require('./src/config/socket');
const errorHandler = require('./src/middleware/errorHandler');
const { startHoldExpirySweeper } = require('./src/services/holdExpiry.job');
const { startWaitlistOfferSweeper } = require('./src/services/waitlistOffer.job');

const authRoutes = require('./src/routes/auth.routes');
const venueRoutes = require('./src/routes/venue.routes');
const eventRoutes = require('./src/routes/event.routes');
const showRoutes = require('./src/routes/show.routes');
const bookingRoutes = require('./src/routes/booking.routes');
const waitlistRoutes = require('./src/routes/waitlist.routes');
const organiserRoutes = require('./src/routes/organiser.routes');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/shows', showRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/organiser', organiserRoutes);

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

initSocket(server, process.env.CLIENT_ORIGIN || '*');
startHoldExpirySweeper();
startWaitlistOfferSweeper();

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🎟️  Ticket Booking API running on port ${PORT}`);
});
