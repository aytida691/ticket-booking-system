import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/api';

export default function OrganiserDashboard() {
  const [summary, setSummary] = useState([]);

  useEffect(() => {
    api.get('/organiser/summary').then((res) => setSummary(res.data));
  }, []);

  const totalRevenue = summary.reduce((sum, s) => sum + Number(s.revenue), 0);

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Organiser Dashboard</h2>
        <Link to="/organiser/create-event" className="btn">+ New Event</Link>
      </div>

      <div className="card">
        <h3 style={{ margin: 0 }}>Total Revenue: ₹{totalRevenue.toLocaleString()}</h3>
      </div>

      <table className="card">
        <thead>
          <tr>
            <th>Event</th><th>Show</th><th>Venue</th><th>Confirmed</th><th>Cancelled</th><th>Seats Sold</th><th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((s) => (
            <tr key={s.show_id}>
              <td>{s.title}</td>
              <td>{new Date(s.show_date).toDateString()} {s.show_time}</td>
              <td>{s.venue_name}</td>
              <td>{s.confirmed_bookings}</td>
              <td>{s.cancelled_bookings}</td>
              <td>{s.seats_sold} / {s.total_seats}</td>
              <td>₹{Number(s.revenue).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!summary.length && <p style={{ color: '#9aa0ab' }}>No shows yet — create an event to get started.</p>}
    </div>
  );
}
