import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/api';
import socket from '../socket';
import { useAuth } from '../context/AuthContext';
import SeatGrid from '../components/SeatGrid';
import Timer from '../components/Timer';

export default function ShowSeatMap() {
  const { showId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [show, setShow] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selected, setSelected] = useState([]);
  const [holdExpiresAt, setHoldExpiresAt] = useState(null);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);

  const loadSeats = useCallback(async () => {
    const { data } = await api.get(`/shows/${showId}/seats`);
    setShow(data.show);
    setSeats(data.seats);
  }, [showId]);

  useEffect(() => {
    loadSeats();
    socket.emit('join_show', showId);
    const handler = (payload) => {
      if (String(payload.showId) !== String(showId)) return;
      // Merge incremental status updates into the current seat list
      setSeats((prev) =>
        prev.map((s) => {
          const update = payload.seats.find((u) => String(u.show_seat_id) === String(s.show_seat_id));
          return update ? { ...s, status: update.status } : s;
        })
      );
    };
    socket.on('seat_update', handler);
    return () => {
      socket.emit('leave_show', showId);
      socket.off('seat_update', handler);
    };
  }, [showId, loadSeats]);

  function toggleSeat(seat) {
    if (!user) return navigate('/login');
    setError('');
    setSelected((prev) =>
      prev.includes(seat.show_seat_id) ? prev.filter((id) => id !== seat.show_seat_id) : [...prev, seat.show_seat_id]
    );
  }

  async function handleHold() {
    setError('');
    try {
      const { data } = await api.post(`/shows/${showId}/hold`, { seatIds: selected });
      setHoldExpiresAt(data.holdExpiresAt);
      loadSeats();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not hold seats');
      loadSeats();
    }
  }

  async function handleCheckout() {
    setError('');
    try {
      const { data } = await api.post(`/shows/${showId}/checkout`, { seatIds: selected });
      setConfirmation(data);
      setSelected([]);
      setHoldExpiresAt(null);
      loadSeats();
    } catch (err) {
      setError(err.response?.data?.error || 'Checkout failed');
      loadSeats();
    }
  }

  async function handleAbandon() {
    if (!selected.length) return;
    await api.post(`/shows/${showId}/release`, { seatIds: selected });
    setSelected([]);
    setHoldExpiresAt(null);
    loadSeats();
  }

  async function handleExpire() {
    setHoldExpiresAt(null);
    setSelected([]);
    setError('Your hold expired and the seats were auto-released.');
    loadSeats();
  }

  async function handleJoinWaitlist(categoryId) {
    setError('');
    try {
      await api.post(`/shows/${showId}/waitlist`, { categoryId });
      alert('Added to waitlist! You will get an email if a seat opens up.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not join waitlist');
    }
  }

  if (!show) return <div className="container">Loading…</div>;

  if (confirmation) {
    return (
      <div className="container" style={{ maxWidth: 460 }}>
        <div className="card">
          <h2>✅ Booking Confirmed</h2>
          <p>Reference: <b>{confirmation.booking.booking_ref}</b></p>
          <p>Seats: {confirmation.seatLabels.join(', ')}</p>
          <img src={confirmation.qrDataUrl} alt="QR Ticket" width={220} />
          <p style={{ color: '#9aa0ab', fontSize: '0.85rem' }}>A copy of this QR ticket has also been emailed to you.</p>
          <button className="btn" onClick={() => navigate('/my-bookings')}>View My Bookings</button>
        </div>
      </div>
    );
  }

  const categories = [...new Map(seats.map((s) => [s.category_id, { id: s.category_id, name: s.category_name }])).values()];
  const soldOutCategories = categories.filter((c) => !seats.some((s) => s.category_id === c.id && s.status === 'available'));

  return (
    <div className="container">
      <h2>{show.event_title}</h2>
      <p style={{ color: '#9aa0ab' }}>{show.venue_name} · {new Date(show.show_date).toDateString()} · {show.show_time}</p>

      <div className="card">
        <SeatGrid seats={seats} selectedIds={selected} onToggle={toggleSeat} />
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div>Selected: {selected.length} seat(s)</div>
          {holdExpiresAt && <div>Hold expires in <Timer expiresAt={holdExpiresAt} onExpire={handleExpire} /></div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!holdExpiresAt ? (
            <button className="btn" disabled={!selected.length} onClick={handleHold}>Hold Seats</button>
          ) : (
            <>
              <button className="btn secondary" onClick={handleAbandon}>Cancel / Release</button>
              <button className="btn" onClick={handleCheckout}>Confirm & Pay</button>
            </>
          )}
        </div>
      </div>

      {soldOutCategories.length > 0 && user?.role === 'customer' && (
        <div className="card">
          <h4>Sold out categories — join the waitlist</h4>
          {soldOutCategories.map((c) => (
            <button key={c.id} className="btn secondary" style={{ marginRight: 8 }} onClick={() => handleJoinWaitlist(c.id)}>
              Join waitlist: {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
