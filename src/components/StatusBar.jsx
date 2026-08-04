import { useEffect, useState } from 'react';
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

// Dot color: RTK Fixed=green, RTK Float=amber, anything else=red
function fixDotColor(fix) {
  if (fix === 4) return '#22c55e';
  if (fix === 5) return '#f59e0b';
  return '#ef4444';
}

const HISTORY_MAX = 10;

/**
 * Compact always-visible header.
 * Row 1 — app branding + connection badge
 * Row 2 — fix quality, satellite count, HDOP, battery level
 * Row 3 — fix quality history dots (last 10 readings, newest on right)
 */
export default function StatusBar({ status, data }) {
  const fix  = data?.fix;
  const sats = data?.sats;
  const bat  = data?.bat;
  const hdop = data?.hdop;

  // History ring: array of up to HISTORY_MAX fix values, newest last
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (fix == null) return;
    setHistory(prev => {
      // Skip if same as last value
      if (prev.length > 0 && prev[prev.length - 1] === fix) return prev;
      const next = [...prev, fix];
      if (next.length > HISTORY_MAX) next.shift();
      return next;
    });
  }, [fix]);

  const fixColor = FIX_COLORS[fix] ?? '#64748b';
  const fixLabel = FIX_LABELS[fix] ?? '—';

  const hdopColor =
    hdop == null  ? '#64748b'
    : hdop <= 1.0 ? '#22c55e'
    : hdop <= 2.0 ? '#84cc16'
    : hdop <= 5.0 ? '#f59e0b'
    : '#ef4444';

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

        {/* HDOP */}
        <div className="sb-chip" style={{ color: hdopColor, borderColor: `${hdopColor}44` }}>
          <span className="sb-chip-val">{hdop != null ? Number(hdop).toFixed(2) : '—'}</span>
          <span className="sb-chip-label">HDOP</span>
        </div>

        {/* Battery */}
        <div className="sb-chip" style={{ color: batColor, borderColor: `${batColor}44` }}>
          <span className="sb-chip-icon">⚡</span>
          <span className="sb-chip-val">{bat != null ? `${bat}%` : '—'}</span>
        </div>
      </div>

      {/* Row 3 — fix quality history dots */}
      {history.length > 0 && (
        <div className="sb-row sb-fix-history">
          <span className="sb-fh-label">Fix history</span>
          <div className="sb-fh-dots">
            {/* Left-pad with empty placeholders so newest is always rightmost */}
            {Array.from({ length: HISTORY_MAX - history.length }).map((_, i) => (
              <span key={`pad-${i}`} className="sb-fh-dot sb-fh-dot--empty" />
            ))}
            {history.map((f, i) => (
              <span
                key={i}
                className="sb-fh-dot"
                style={{ background: fixDotColor(f) }}
                title={`Fix ${f}: ${FIX_LABELS[f] ?? '?'}`}
              />
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
