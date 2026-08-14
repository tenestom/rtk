/**
 * NmeaErrorCard — shows NMEA sentence error rate from the ESP32 firmware.
 * Replaces the old BatteryIndicator card in GpsDashboard.
 * err = percentage (0–100) of sentences that failed checksum in last 60.
 */
export default function NmeaErrorCard({ err }) {
  const pct = err ?? null;

  const color =
    pct == null ? 'var(--text-muted)'
    : pct === 0  ? '#16a34a'
    : pct <= 5   ? '#d97706'
    : '#dc2626';

  const label =
    pct == null ? 'No data'
    : pct === 0  ? 'Clean signal'
    : pct <= 5   ? 'Minor errors'
    : 'High error rate';

  return (
    <div className="card nmea-err-card">
      <div className="card-header">
        <span className="card-icon">📶</span>
        <span className="card-title">NMEA Error Rate</span>
      </div>
      <div className="nmea-err-body">
        <span className="nmea-err-pct" style={{ color }}>
          {pct != null ? `${pct}%` : '—'}
        </span>
        <span className="nmea-err-label" style={{ color }}>{label}</span>
        <span className="nmea-err-sub">last 60 sentences</span>
      </div>
    </div>
  );
}
