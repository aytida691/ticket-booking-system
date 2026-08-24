import { useEffect, useState } from 'react';
import api from '../api/api';

export default function AdminVenues() {
  const [venues, setVenues] = useState([]);
  const [form, setForm] = useState({ name: '', address: '', rows: 5, cols: 8 });
  const [categories, setCategories] = useState([{ name: 'Premium', rowFrom: 1, rowTo: 2 }, { name: 'Standard', rowFrom: 3, rowTo: 5 }]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    const { data } = await api.get('/venues');
    setVenues(data);
  }
  useEffect(() => { load(); }, []);

  function updateCategory(idx, field, value) {
    const next = [...categories];
    next[idx] = { ...next[idx], [field]: field === 'name' ? value : Number(value) };
    setCategories(next);
  }
  function addCategory() {
    setCategories([...categories, { name: '', rowFrom: 1, rowTo: 1 }]);
  }
  function removeCategory(idx) {
    setCategories(categories.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await api.post('/venues', { ...form, categories });
      setSuccess('Venue created!');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create venue');
    }
  }

  return (
    <div className="container">
      <h2>Admin: Venue Management</h2>

      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 520 }}>
        <label>Venue Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <label>Address</label>
        <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label>Rows</label>
            <input type="number" min="1" value={form.rows} onChange={(e) => setForm({ ...form, rows: Number(e.target.value) })} required />
          </div>
          <div style={{ flex: 1 }}>
            <label>Seats per row</label>
            <input type="number" min="1" value={form.cols} onChange={(e) => setForm({ ...form, cols: Number(e.target.value) })} required />
          </div>
        </div>

        <h4>Seat Categories (map row ranges → category)</h4>
        {categories.map((c, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input placeholder="Name" value={c.name} onChange={(e) => updateCategory(idx, 'name', e.target.value)} style={{ marginBottom: 0 }} required />
            <input type="number" min="1" placeholder="Row from" value={c.rowFrom} onChange={(e) => updateCategory(idx, 'rowFrom', e.target.value)} style={{ marginBottom: 0 }} required />
            <input type="number" min="1" placeholder="Row to" value={c.rowTo} onChange={(e) => updateCategory(idx, 'rowTo', e.target.value)} style={{ marginBottom: 0 }} required />
            <button type="button" className="btn danger" onClick={() => removeCategory(idx)}>×</button>
          </div>
        ))}
        <button type="button" className="btn secondary" onClick={addCategory} style={{ marginBottom: 10 }}>+ Add category</button>

        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
        <button className="btn" type="submit">Create Venue</button>
      </form>

      <h3>Existing Venues</h3>
      <div className="grid">
        {venues.map((v) => (
          <div key={v.id} className="card">
            <div style={{ fontWeight: 600 }}>{v.name}</div>
            <div style={{ color: '#9aa0ab', fontSize: '0.85rem' }}>{v.address}</div>
            <div style={{ fontSize: '0.85rem', marginTop: 6 }}>{v.rows} rows × {v.cols} seats</div>
          </div>
        ))}
      </div>
    </div>
  );
}
