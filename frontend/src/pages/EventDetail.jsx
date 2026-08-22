import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/api';

export default function EventDetail() {
  const { eventId } = useParams();
  const [shows, setShows] = useState([]);

  useEffect(() => {
    api.get(`/events/${eventId}/shows`).then((res) => setShows(res.data));
  }, [eventId]);

  return (
    <div className="container">
      <h2>Available Shows</h2>
      <div className="grid">
        {shows.map((s) => (
          <Link key={s.id} to={`/shows/${s.id}`} style={{ textDecoration: 'none' }}>
            <div className="card">
              <div style={{ fontWeight: 600 }}>{s.venue_name}</div>
              <div style={{ color: '#9aa0ab', fontSize: '0.85rem' }}>{s.address}</div>
              <div style={{ marginTop: 8 }}>{new Date(s.show_date).toDateString()} · {s.show_time}</div>
              <button className="btn" style={{ marginTop: 10 }}>Select Seats</button>
            </div>
          </Link>
        ))}
        {!shows.length && <p style={{ color: '#9aa0ab' }}>No shows scheduled yet.</p>}
      </div>
    </div>
  );
}
