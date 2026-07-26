import { useState } from 'react';

export default function CoordinatesCard({ lat, lon }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (lat == null || lon == null) return;
    navigator.clipboard.writeText(`${lat.toFixed(7)}, ${lon.toFixed(7)}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="card coordinates-card" onClick={handleCopy} title="Tap to copy">
      <div className="card-header">
        <span className="card-icon">🌐</span>
        <span className="card-title">Coordinates</span>
        {lat != null && (
          <span className="copy-hint">{copied ? '✓ Copied!' : 'tap to copy'}</span>
        )}
      </div>

      <div className="coord-grid">
        <div className="coord-item">
          <span className="coord-label">Latitude</span>
          <span className="coord-value">
            {lat != null ? lat.toFixed(7) : '—'}
          </span>
          <span className="coord-unit">°N</span>
        </div>
        <div className="coord-divider" />
        <div className="coord-item">
          <span className="coord-label">Longitude</span>
          <span className="coord-value">
            {lon != null ? lon.toFixed(7) : '—'}
          </span>
          <span className="coord-unit">°E</span>
        </div>
      </div>
    </div>
  );
}
