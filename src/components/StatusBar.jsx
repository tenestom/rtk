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
 * Row 2 — fix quality, satellite count, HDOP, NMEA error %
 * Row 3 — fix quality history dots (last 10 readings, newest on right)
 */
export default function StatusBar({ status, data }) {
  const fix  = data?.fix;
  const sats = data?.sats;
  const hdop = data?.hdop;
  const err  = data?.err;   // NMEA error % from firmware

  // History ring: array of up to HISTORY_MAX fix values, newest last (index -1)
  // Dots render left→right, oldest→newest, so newest is always rightmost.
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (fix == null) return;
    setHistory(prev => {
      // Skip duplicate consecutive values to avoid noise
      if (prev.length > 0 && prev[prev.length - 1] === fix) return prev;
      const next = [...prev, fix];
      if (next.length > HISTORY_MAX) next.shift(); // drop oldest (index 0)
      return next;
    });
  }, [fix]);

  const fixColor = FIX_COLORS[fix] ?? '#334155';
  const fixLabel = FIX_LABELS[fix] ?? '—';

  const hdopColor =
    hdop == null  ? '#334155'
    : hdop <= 1.0 ? '#16a34a'
    : hdop <= 2.0 ? '#65a30d'
    : hdop <= 5.0 ? '#d97706'
    : '#dc2626';

  const errColor =
    err == null ? '#334155'
    : err === 0  ? '#16a34a'
    : err <= 5   ? '#d97706'
    : '#dc2626';

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
        <div className="sb-chip" style={{ color: fixColor, borderColor: `${fixColor}55` }}>
          <span className="sb-chip-icon">🎯</span>
          <span className="sb-chip-val">{fix ?? '—'}</span>
          <span className="sb-chip-label">{fixLabel}</span>
        </div>

        {/* Satellite count */}
        <div className="sb-chip" style={{ color: '#1d4ed8', borderColor: 'rgba(29,78,216,0.3)' }}>
          <span className="sb-chip-icon">🛰️</span>
          <span className="sb-chip-val">{sats ?? '—'}</span>
          <span className="sb-chip-label">sats</span>
        </div>

        {/* HDOP */}
        <div className="sb-chip" style={{ color: hdopColor, borderColor: `${hdopColor}55` }}>
          <span className="sb-chip-val">{hdop != null ? Number(hdop).toFixed(2) : '—'}</span>
          <span className="sb-chip-label">HDOP</span>
        </div>

        {/* NMEA Error % */}
        <div className="sb-chip" style={{ color: errColor, borderColor: `${errColor}55` }}>
          <span className="sb-chip-val">{err != null ? `${err}%` : '—'}</span>
          <span className="sb-chip-label">ERR</span>
        </div>
      </div>

      {/* Row 3 — fix quality history dots (oldest left, newest right) */}
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
