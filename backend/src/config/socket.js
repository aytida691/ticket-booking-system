let ioInstance = null;

function initSocket(server, corsOrigin) {
  const { Server } = require('socket.io');
  ioInstance = new Server(server, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  });

  ioInstance.on('connection', (socket) => {
    // Clients join a room per show so updates only reach relevant viewers
    socket.on('join_show', (showId) => {
      socket.join(`show_${showId}`);
    });
    socket.on('leave_show', (showId) => {
      socket.leave(`show_${showId}`);
    });
  });

  return ioInstance;
}

// Broadcast a seat status change to everyone viewing that show's seat map
function emitSeatUpdate(showId, seats) {
  if (!ioInstance) return;
  ioInstance.to(`show_${showId}`).emit('seat_update', { showId, seats });
}

module.exports = { initSocket, emitSeatUpdate };
