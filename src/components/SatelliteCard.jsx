export default function SatelliteCard({ sats }) {
  // Render up to 12 satellite dots for visual flair
  const MAX_DOTS = 12;
  const activeDots = Math.min(sats ?? 0, MAX_DOTS);

  return (
    <div className="card satellite-card">
      <div className="card-header">
        <span className="card-icon">🛰️</span>
        <span className="card-title">Satellites</span>
      </div>
      <div className="sat-body">
        <span className="sat-number">{sats ?? '—'}</span>
        <div className="sat-dots">
          {Array.from({ length: MAX_DOTS }).map((_, i) => (
            <span
              key={i}
              className={`sat-dot ${i < activeDots ? 'sat-dot-active' : ''}`}
            />
          ))}
        </div>
        <span className="sat-unit">in view</span>
      </div>
    </div>
  );
}
