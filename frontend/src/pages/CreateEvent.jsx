import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/api';

export default function CreateEvent() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');

  const [eventForm, setEventForm] = useState({ title: '', description: '', type: 'movie' });
  const [eventId, setEventId] = useState(null);

  const [venues, setVenues] = useState([]);
  const [showForm, setShowForm] = useState({ venueId: '', showDate: '', showTime: '' });
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [pricing, setPricing] = useState({});

  useEffect(() => {
    api.get('/venues').then((res) => setVenues(res.data));
  }, []);

  async function handleCreateEvent(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/events', eventForm);
      setEventId(data.id);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create event');
    }
  }

  async function handleSelectVenue(venueId) {
    setShowForm({ ...showForm, venueId });
    if (!venueId) return setSelectedVenue(null);
    const { data } = await api.get(`/venues/${venueId}`);
    setSelectedVenue(data);
    const initialPricing = {};
    data.categories.forEach((c) => (initialPricing[c.id] = ''));
    setPricing(initialPricing);
  }

  async function handleCreateShow(e) {
    e.preventDefault();
    setError('');
    try {
      const pricingArray = Object.entries(pricing).map(([categoryId, price]) => ({ categoryId: Number(categoryId), price: Number(price) }));
      await api.post(`/events/${eventId}/shows`, { ...showForm, pricing: pricingArray });
      navigate('/organiser');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create show');
    }
  }

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <h2>Create Event</h2>
      {error && <div className="error">{error}</div>}

      {step === 1 && (
        <form onSubmit={handleCreateEvent} className="card">
          <label>Title</label>
          <input value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required />
          <label>Description</label>
          <textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} rows={3} />
          <label>Type</label>
          <select value={eventForm.type} onChange={(e) => setEventForm({ ...eventForm, type: e.target.value })}>
            <option value="movie">Movie</option>
            <option value="concert">Concert</option>
          </select>
          <button className="btn" type="submit">Next: Add a Show</button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleCreateShow} className="card">
          <label>Venue</label>
          <select value={showForm.venueId} onChange={(e) => handleSelectVenue(e.target.value)} required>
            <option value="">Select a venue…</option>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>

          <label>Date</label>
          <input type="date" value={showForm.showDate} onChange={(e) => setShowForm({ ...showForm, showDate: e.target.value })} required />
          <label>Time</label>
          <input type="time" value={showForm.showTime} onChange={(e) => setShowForm({ ...showForm, showTime: e.target.value })} required />

          {selectedVenue && (
            <>
              <h4>Per-category pricing</h4>
              {selectedVenue.categories.map((c) => (
                <div key={c.id}>
                  <label>{c.name} price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={pricing[c.id] || ''}
                    onChange={(e) => setPricing({ ...pricing, [c.id]: e.target.value })}
                    required
                  />
                </div>
              ))}
            </>
          )}

          <button className="btn" type="submit" disabled={!selectedVenue}>Create Show</button>
        </form>
      )}
    </div>
  );
}
