import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="navbar">
      <div>
        <Link to="/" className="brand">🎟️ TicketBooking</Link>
        <Link to="/">Events</Link>
        {user?.role === 'organiser' && <Link to="/organiser">Organiser</Link>}
        {user?.role === 'organiser' && <Link to="/organiser/create-event">+ New Event</Link>}
        {user?.role === 'admin' && <Link to="/admin/venues">Venues</Link>}
        {user?.role === 'customer' && <Link to="/my-bookings">My Bookings</Link>}
        {user?.role === 'customer' && <Link to="/my-waitlist">My Waitlist</Link>}
      </div>
      <div>
        {user ? (
          <>
            <span style={{ marginRight: 14, color: '#9aa0ab' }}>{user.name} ({user.role})</span>
            <button className="btn secondary" onClick={handleLogout}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
    </div>
  );
}
