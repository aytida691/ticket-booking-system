import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/api';

export default function OrganiserEvents() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    const { data } = await api.get('/organiser/events');
    setEvents(data);
  }
  useEffect(() => { load(); }, []);

  async function handleDelete(eventId, title) {
    setError('');
    setSuccess('');
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/events/${eventId}`);
      setSuccess('Event deleted.');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete event');
    }
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>My Events</h2>
        <Link to="/organiser/create-event" className="btn">+ New Event</Link>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="grid">
        {events.map((e) => (
          <div key={e.id} className="card">
            <div style={{ fontWeight: 600 }}>{e.title}</div>
            <div style={{ color: '#9aa0ab', fontSize: '0.85rem' }}>{e.type}</div>
            {e.description && <p style={{ fontSize: '0.85rem', marginTop: 6 }}>{e.description}</p>}
            <button className="btn danger" style={{ marginTop: 10 }} onClick={() => handleDelete(e.id, e.title)}>
              Delete
            </button>
          </div>
        ))}
        {!events.length && <p style={{ color: '#9aa0ab' }}>No events yet — create one to get started.</p>}
      </div>

      <p style={{ color: '#9aa0ab', fontSize: '0.8rem', marginTop: 16 }}>
        Note: an event can only be deleted if it has no booking history (confirmed or cancelled) on any of
        its shows — this protects customer records from being erased. If deletion is blocked, that event has
        activity you'll need to keep.
      </p>
    </div>
  );
}
