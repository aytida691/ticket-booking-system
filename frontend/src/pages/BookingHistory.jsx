import { useEffect, useState } from 'react';
import api from '../api/api';

export default function BookingHistory() {
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    const { data } = await api.get('/bookings');
    setBookings(data);
  }

  useEffect(() => { load(); }, []);

  async function handleCancel(id) {
    setError('');
    if (!confirm('Cancel this booking? The seat will be offered to the next person on the waitlist.')) return;
    try {
      await api.post(`/bookings/${id}/cancel`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Cancel failed');
    }
  }

  return (
    <div className="container">
      <h2>My Bookings</h2>
      {error && <div className="error">{error}</div>}
      {bookings.map((b) => (
        <div key={b.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600 }}>{b.event_title} <span className={`badge ${b.status}`}>{b.status}</span></div>
            <div style={{ color: '#9aa0ab', fontSize: '0.85rem' }}>
              {b.venue_name} · {new Date(b.show_date).toDateString()} {b.show_time} · Seats: {b.seats?.join(', ')}
            </div>
            <div style={{ fontSize: '0.85rem' }}>Ref: {b.booking_ref} · ₹{b.total_amount}</div>
          </div>
          {b.status === 'confirmed' && (
            <button className="btn danger" onClick={() => handleCancel(b.id)}>Cancel</button>
          )}
        </div>
      ))}
      {!bookings.length && <p style={{ color: '#9aa0ab' }}>No bookings yet.</p>}
    </div>
  );
}
