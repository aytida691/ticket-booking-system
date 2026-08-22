import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Same rule as the backend: requires a real domain + TLD (rejects "a@b").
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'customer' });
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!EMAIL_REGEX.test(form.email)) {
      setError('Please enter a valid email address (e.g. name@example.com)');
      return;
    }
    try {
      const user = await register(form.name, form.email, form.password, form.role);
      navigate(user.role === 'organiser' ? '/organiser' : '/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    }
  }

  return (
    <div className="container" style={{ maxWidth: 400 }}>
      <h2>Register</h2>
      <form onSubmit={handleSubmit} className="card">
        <label>Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <label>Email</label>
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" required />
        <label>Password</label>
        <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" required minLength={6} />
        <label>Register as</label>
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="customer">Customer</option>
          <option value="organiser">Organiser</option>
        </select>
        <p style={{ fontSize: '0.75rem', color: '#9aa0ab' }}>
          Admin accounts are provisioned manually (see README) — not available via self-registration.
        </p>
        {error && <div className="error">{error}</div>}
        <button className="btn" type="submit">Create account</button>
      </form>
      <p>Already have an account? <Link to="/login">Login</Link></p>
    </div>
  );
}
