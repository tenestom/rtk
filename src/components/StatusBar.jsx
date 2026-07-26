import ConnectionBadge from './ConnectionBadge';

const FIX_COLORS = {
  0: '#ef4444',
  1: '#f59e0b',
  2: '#eab308',
  3: '#84cc16',
  4: '#22c55e',
  5: '#10b981',
  6: '#6366f1',
};

const FIX_LABELS = {
  0: 'No Fix',
  1: 'GPS',
  2: 'DGPS',
  3: 'PPS',
  4: 'RTK Fixed',
  5: 'RTK Float',
  6: 'DR',
};

/**
 * Compact always-visible header.
 * Row 1 — app branding + connection badge
 * Row 2 — fix quality, satellite count, battery level
 */
export default function StatusBar({ status, data }) {
  const fix = data?.fix;
  const sats = data?.sats;
  const bat = data?.bat;

  const fixColor = FIX_COLORS[fix] ?? '#64748b';
  const fixLabel = FIX_LABELS[fix] ?? '—';
  const batColor =
    bat == null ? '#64748b'
    : bat < 20  ? '#ef4444'
    : bat < 40  ? '#f59e0b'
    : '#22c55e';

  return (
    <header className="status-bar">
      {/* Row 1 — branding + connection */}
      <div className="sb-row sb-row-1">
        <div className="sb-brand">
          <span className="sb-logo">📡</span>
          <span className="sb-title">RTK Tracker</span>
        </div>
        <ConnectionBadge status={status} />
      </div>

      {/* Row 2 — GPS stats */}
      <div className="sb-row sb-row-2">
        {/* Fix quality */}
        <div className="sb-chip" style={{ color: fixColor, borderColor: `${fixColor}44` }}>
          <span className="sb-chip-icon">🎯</span>
          <span className="sb-chip-val">{fix ?? '—'}</span>
          <span className="sb-chip-label">{fixLabel}</span>
        </div>

        {/* Satellite count */}
        <div className="sb-chip" style={{ color: '#60a5fa', borderColor: 'rgba(96,165,250,0.3)' }}>
          <span className="sb-chip-icon">🛰️</span>
          <span className="sb-chip-val">{sats ?? '—'}</span>
          <span className="sb-chip-label">sats</span>
        </div>

        {/* Battery */}
        <div className="sb-chip" style={{ color: batColor, borderColor: `${batColor}44` }}>
          <span className="sb-chip-icon">⚡</span>
          <span className="sb-chip-val">{bat != null ? `${bat}%` : '—'}</span>
        </div>
      </div>
    </header>
  );
}
