import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';

export default function WaitlistOffer() {
  const { token } = useParams();
  const { user } = useAuth();
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!user) {
      setStatus('error');
      setMessage('Please log in with the account that joined the waitlist, then reopen this link.');
      return;
    }
    api
      .get(`/waitlist/offer/${token}`)
      .then((res) => {
        setResult(res.data);
        setStatus('success');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.error || 'Could not claim this offer.');
      });
  }, [token, user]);

  return (
    <div className="container" style={{ maxWidth: 460 }}>
      <div className="card">
        {status === 'loading' && <p>Claiming your seat…</p>}
        {status === 'error' && <div className="error">{message}</div>}
        {status === 'success' && (
          <>
            <h2>🎉 Seat Claimed!</h2>
            <p>Booking Reference: <b>{result.booking.booking_ref}</b></p>
            <img src={result.qrDataUrl} alt="QR Ticket" width={220} />
            <p style={{ color: '#9aa0ab', fontSize: '0.85rem' }}>A copy has also been emailed to you.</p>
          </>
        )}
      </div>
    </div>
  );
}
