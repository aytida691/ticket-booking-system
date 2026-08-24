import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/api';

export default function EventList() {
  const [events, setEvents] = useState([]);
  const [type, setType] = useState('');
  const [title, setTitle] = useState('');

  async function load() {
    const params = {};
    if (type) params.type = type;
    if (title) params.title = title;
    const { data } = await api.get('/events', { params });
    setEvents(data);
  }

  useEffect(() => { load(); }, [type]);

  return (
    <div className="container">
      <h2>Browse Events</h2>
      <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label>Search title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="e.g. Inception" />
        </div>
        <div style={{ width: 160 }}>
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>
            <option value="movie">Movie</option>
            <option value="concert">Concert</option>
          </select>
        </div>
        <button className="btn" style={{ marginBottom: 10 }} onClick={load}>Search</button>
      </div>

      <div className="grid">
        {events.map((ev) => (
          <Link key={ev.id} to={`/events/${ev.id}`} style={{ textDecoration: 'none' }}>
            <div className="card">
              <h3 style={{ margin: '0 0 6px' }}>{ev.title}</h3>
              <div style={{ color: '#9aa0ab', fontSize: '0.85rem' }}>{ev.type} · {ev.venue_name || 'Venue TBA'}</div>
              {ev.next_show_date && (
                <div style={{ marginTop: 6, fontSize: '0.85rem' }}>Next show: {new Date(ev.next_show_date).toDateString()}</div>
              )}
            </div>
          </Link>
        ))}
        {!events.length && <p style={{ color: '#9aa0ab' }}>No events found.</p>}
      </div>
    </div>
  );
}
