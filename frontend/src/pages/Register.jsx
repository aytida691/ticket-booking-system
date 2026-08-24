import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Same rule as the backend: requires a real domain + TLD (rejects "a@b").
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const RESEND_COOLDOWN_SECONDS = 60;

export default function Register() {
  const { sendOtp, register } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('details'); // 'details' | 'otp'
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'customer' });
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function handleSendOtp(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!EMAIL_REGEX.test(form.email)) {
      setError('Please enter a valid email address (e.g. name@example.com)');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setSending(true);
    try {
      await sendOtp(form.email);
      setInfo(`Verification code sent to ${form.email}. It expires in 10 minutes.`);
      setStep('otp');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send verification code');
    } finally {
      setSending(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setError('');
    setInfo('');
    try {
      await sendOtp(form.email);
      setInfo('A new code has been sent.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not resend code');
    }
  }

  async function handleVerifyAndRegister(e) {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code from your email');
      return;
    }
    try {
      const user = await register(form.name, form.email, form.password, form.role, otp);
      navigate(user.role === 'organiser' ? '/organiser' : '/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    }
  }

  return (
    <div className="container" style={{ maxWidth: 400 }}>
      <h2>Register</h2>

      {step === 'details' && (
        <form onSubmit={handleSendOtp} className="card">
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
          <button className="btn" type="submit" disabled={sending}>
            {sending ? 'Sending code…' : 'Send Verification Code'}
          </button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={handleVerifyAndRegister} className="card">
          <p style={{ fontSize: '0.88rem' }}>
            Enter the 6-digit code sent to <b>{form.email}</b>.
          </p>
          <label>Verification Code</label>
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="123456"
            maxLength={6}
            autoFocus
            required
          />
          {info && <div className="success">{info}</div>}
          {error && <div className="error">{error}</div>}
          <button className="btn" type="submit" style={{ marginBottom: 10 }}>Verify & Create Account</button>
          <button
            type="button"
            className="btn secondary"
            onClick={handleResend}
            disabled={cooldown > 0}
            style={{ width: '100%', marginBottom: 10 }}
          >
            {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => { setStep('details'); setOtp(''); setError(''); setInfo(''); }}
            style={{ width: '100%' }}
          >
            ← Edit details
          </button>
        </form>
      )}

      <p>Already have an account? <Link to="/login">Login</Link></p>
    </div>
  );
}
