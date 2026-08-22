import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import { useAuth } from './context/AuthContext';

import Login from './pages/Login';
import Register from './pages/Register';
import EventList from './pages/EventList';
import EventDetail from './pages/EventDetail';
import ShowSeatMap from './pages/ShowSeatMap';
import BookingHistory from './pages/BookingHistory';
import MyWaitlist from './pages/MyWaitlist';
import WaitlistOffer from './pages/WaitlistOffer';
import OrganiserDashboard from './pages/OrganiserDashboard';
import CreateEvent from './pages/CreateEvent';
import AdminVenues from './pages/AdminVenues';

function Protected({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<EventList />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/events/:eventId" element={<EventDetail />} />
        <Route path="/shows/:showId" element={<ShowSeatMap />} />
        <Route path="/waitlist/offer/:token" element={<WaitlistOffer />} />

        <Route path="/my-bookings" element={<Protected role="customer"><BookingHistory /></Protected>} />
        <Route path="/my-waitlist" element={<Protected role="customer"><MyWaitlist /></Protected>} />

        <Route path="/organiser" element={<Protected role="organiser"><OrganiserDashboard /></Protected>} />
        <Route path="/organiser/create-event" element={<Protected role="organiser"><CreateEvent /></Protected>} />

        <Route path="/admin/venues" element={<Protected role="admin"><AdminVenues /></Protected>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
