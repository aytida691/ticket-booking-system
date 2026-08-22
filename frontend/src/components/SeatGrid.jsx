export default function SeatGrid({ seats, selectedIds, onToggle }) {
  // Group seats by row_label so the grid renders visually row by row
  const rows = {};
  for (const s of seats) {
    rows[s.row_label] = rows[s.row_label] || [];
    rows[s.row_label].push(s);
  }
  const rowLabels = Object.keys(rows).sort();

  return (
    <div>
      <div className="legend">
        <span><span className="dot" style={{ background: '#1f2530' }} /> Available</span>
        <span><span className="dot" style={{ background: '#7a5c00' }} /> Held</span>
        <span><span className="dot" style={{ background: '#3a1e1e' }} /> Booked</span>
        <span><span className="dot" style={{ background: '#4f46e5' }} /> Selected</span>
      </div>
      {rowLabels.map((row) => (
        <div key={row} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ width: 18, color: '#9aa0ab', fontSize: '0.8rem' }}>{row}</span>
          <div className="seat-grid" style={{ gridTemplateColumns: `repeat(${rows[row].length}, 34px)` }}>
            {rows[row]
              .sort((a, b) => a.seat_number - b.seat_number)
              .map((seat) => {
                const selected = selectedIds.includes(seat.show_seat_id);
                const cls = selected ? 'selected' : seat.status;
                const clickable = seat.status === 'available' || selected;
                return (
                  <div
                    key={seat.show_seat_id}
                    className={`seat ${cls}`}
                    title={`${seat.category_name} · ${row}${seat.seat_number} · ₹${seat.price ?? '-'}`}
                    onClick={() => clickable && onToggle(seat)}
                  >
                    {seat.seat_number}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
