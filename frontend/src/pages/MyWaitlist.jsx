import { useEffect, useState } from 'react';
import api from '../api/api';

export default function MyWaitlist() {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    api.get('/waitlist').then((res) => setEntries(res.data));
  }, []);

  return (
    <div className="container">
      <h2>My Waitlist</h2>
      {entries.map((e) => (
        <div key={e.id} className="card">
          <div style={{ fontWeight: 600 }}>{e.event_title} — {e.category_name}</div>
          <div style={{ color: '#9aa0ab', fontSize: '0.85rem' }}>
            {new Date(e.show_date).toDateString()} {e.show_time} · Status: {e.status}
          </div>
          {e.status === 'offered' && (
            <p style={{ fontSize: '0.85rem' }}>
              A seat was offered to you! Check your email for the time-limited claim link
              (expires {new Date(e.offer_expires_at).toLocaleString()}).
            </p>
          )}
        </div>
      ))}
      {!entries.length && <p style={{ color: '#9aa0ab' }}>You're not on any waitlists.</p>}
    </div>
  );
}
